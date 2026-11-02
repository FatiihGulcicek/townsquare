/*
 * Interface language. The game is written in Turkish; for English the text
 * on screen (including what the server sends: narration, toasts, story) is
 * swapped in place by matching it against a dictionary. "{}" in a key stands
 * for a name or number, so "{} asıldı" turns "Ali asıldı" into "Ali was hanged".
 */
import en1 from "./en1";
import en2 from "./en2";
import en3 from "./en3";
import en4 from "./en4";
import { getItem, setItem } from "../storage";

function readLang() {
  const saved = getItem("vkLang");
  if (saved === "tr" || saved === "en") return saved;
  const nav = (navigator.language || "tr").toLowerCase();
  return nav.startsWith("tr") ? "tr" : "en";
}

export const lang = readLang();

export function setLang(value) {
  setItem("vkLang", value);
  location.reload();
}

const exact = new Map();
const patterns = [];

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function load(dict) {
  Object.keys(dict).forEach((key) => {
    const value = dict[key];
    if (!key.includes("{}")) {
      exact.set(key, value);
      return;
    }
    const source = "^" + escape(key).replace(/\\\{\\\}/g, "(.+?)") + "$";
    patterns.push({
      re: new RegExp(source, "s"),
      value,
      weight: key.replace(/\{\}/g, "").length,
    });
  });
}

if (lang === "en") {
  [en1, en2, en3, en4].forEach(load);
  // the most specific patterns first
  patterns.sort((a, b) => b.weight - a.weight);
}

const TURKISH = /[çğıöşüÇĞİÖŞÜ]|[A-Za-z]{2}/;

let depth = 0;
function translate(part, d) {
  const before = depth;
  depth = d;
  try {
    return t(part);
  } finally {
    depth = before;
  }
}

function lookup(core) {
  let out = exact.get(core);
  if (out === undefined) {
    for (const p of patterns) {
      const m = p.re.exec(core);
      if (!m) continue;
      let i = 1;
      out = p.value.replace(/\{\}/g, () => {
        const part = m[i++] || "";
        return depth < 2 ? translate(part, depth + 1) : part;
      });
      break;
    }
  }
  return out;
}

const LETTER = /[A-Za-zÇĞİÖŞÜçğıöşü]/;

/** translate one piece of text (unchanged when nothing matches) */
export function t(text) {
  if (lang !== "en" || !text) return text;
  const core = text.trim();
  if (!core || !TURKISH.test(core)) return text;
  let out = lookup(core);
  if (out === undefined && /\s{2,}/.test(core)) {
    // two sentences in one piece of text
    const parts = core.split(/(\s{2,})/).map((p) => lookup(p) || p);
    out = parts.join("");
    if (out === core) out = undefined;
  }
  if (out === undefined) {
    // "🧑‍🌾 3 Köylü", "(Gözcü)": keep what surrounds the words
    const i = core.search(LETTER);
    let j = core.length;
    while (j > i && !LETTER.test(core[j - 1])) j--;
    if (i > 0 || j < core.length) {
      const inner = core.slice(i, j);
      let rest = lookup(inner);
      if (rest === undefined) rest = lookup(core.slice(i));
      else rest = rest + core.slice(j);
      if (rest !== undefined) out = core.slice(0, i) + rest;
    }
  }
  if (out === undefined && depth === 0) {
    // several sentences read out together
    const parts = core.split(/(?<=[.!?…])\s+/);
    if (parts.length > 1 && parts.length < 12) {
      // join neighbours greedily: "Günaydın köy! 1. gün başladı." is one line
      const done = [];
      let changed = false;
      for (let i = 0; i < parts.length; ) {
        let j = parts.length;
        for (; j > i; j--) {
          const piece = parts.slice(i, j).join(" ");
          const next = translate(piece, 1);
          if (next !== piece) {
            done.push(next);
            changed = true;
            break;
          }
        }
        if (j === i) {
          done.push(parts[i]);
          j = i + 1;
        }
        i = j;
      }
      if (changed) out = done.join(" ");
    }
  }
  if (out === undefined) return text;
  const lead = text.match(/^\s*/)[0];
  const tail = text.match(/\s*$/)[0];
  return lead + out + tail;
}

const ATTRS = ["placeholder", "title", "aria-label"];

function one(node) {
  if (node.nodeType === 3) {
    const parent = node.parentNode;
    if (!parent || /^(SCRIPT|STYLE|TEXTAREA|NOSCRIPT)$/.test(parent.nodeName))
      return;
    const next = t(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
    return;
  }
  if (node.nodeType !== 1) return;
  ATTRS.forEach((attr) => {
    const value = node.getAttribute(attr);
    if (value) {
      const next = t(value);
      if (next !== value) node.setAttribute(attr, next);
    }
  });
}

function translateNode(node) {
  one(node);
  if (node.nodeType !== 1) return;
  const walker = document.createTreeWalker(
    node,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );
  let current = walker.nextNode();
  while (current) {
    one(current);
    current = walker.nextNode();
  }
}

/** start swapping the page to English (does nothing in Turkish) */
export function startTranslating() {
  if (lang !== "en") return;
  document.documentElement.lang = "en";
  window.vkT = t;
  document.title = "Vampire Village · Town Square";
  // dialogs are not part of the page
  const { confirm, alert, prompt } = window;
  window.confirm = (message) => confirm.call(window, t(String(message)));
  window.alert = (message) => alert.call(window, t(String(message)));
  window.prompt = (message, value) =>
    prompt.call(window, t(String(message)), value);
  translateNode(document.body);
  new MutationObserver((records) => {
    records.forEach((r) => {
      if (r.type === "characterData") translateNode(r.target);
      else if (r.type === "attributes") translateNode(r.target);
      else r.addedNodes.forEach(translateNode);
    });
  }).observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });
}
