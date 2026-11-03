import Vue from "vue";
import { getJSON, setJSON } from "./storage";
import castleCardBack from "./assets/card-back-castle-v1.jpg";
import crescentCardBack from "./assets/card-back-crescent-v1.jpg";

/*
 * Levels, titles, badges and match history. Kept on this phone (and moved
 * along with the profile code), so it works even without the database.
 */
const read = getJSON;
const write = setJSON;

export const TITLES = [
  [1, "Çaylak Köylü"],
  [3, "Köy Sakini"],
  [5, "Gece Bekçisi"],
  [8, "Kurnaz Tilki"],
  [12, "Usta Avcı"],
  [16, "Köyün Efsanesi"],
  [20, "Ölümsüz"],
];

const VAMP_TEAM = ["vampir", "kurtadam"];
const teamOf = (role) =>
  VAMP_TEAM.includes(role) ? "vampir" : role === "deli" ? "deli" : "koy";

export const BADGES = [
  {
    id: "ilk_oyun",
    emoji: "🎮",
    name: "İlk adım",
    desc: "İlk oyununu bitir",
    test: (g, t) => t.games >= 1,
  },
  {
    id: "ilk_zafer",
    emoji: "🏆",
    name: "İlk zafer",
    desc: "Bir oyun kazan",
    test: (g, t) => t.wins >= 1,
  },
  {
    id: "vampir_zafer",
    emoji: "🧛",
    name: "Karanlığın efendisi",
    desc: "Vampir olarak kazan",
    test: (g) => g.won && g.role === "vampir",
  },
  {
    id: "koy_zafer",
    emoji: "🌾",
    name: "Köyün kahramanı",
    desc: "Köylü takımıyla kazan",
    test: (g) => g.won && teamOf(g.role) === "koy",
  },
  {
    id: "deli_zafer",
    emoji: "🤡",
    name: "Deli işi",
    desc: "Deli olarak asılıp kazan",
    test: (g) => g.won && g.role === "deli",
  },
  {
    id: "kurt",
    emoji: "🐺",
    name: "Kurt sürüsü",
    desc: "Kurt Adam olarak kazan",
    test: (g) => g.won && g.role === "kurtadam",
  },
  {
    id: "hayatta",
    emoji: "🛡️",
    name: "Hayatta kalan",
    desc: "Oyunun sonunda hâlâ hayatta ol",
    test: (g) => g.alive,
  },
  {
    id: "doktor",
    emoji: "🩺",
    name: "Mucize doktor",
    desc: "Doktor olarak birini kurtar",
    test: (g) => (g.stats.save || 0) >= 1,
  },
  {
    id: "gozcu",
    emoji: "👁️",
    name: "Keskin göz",
    desc: "Gözcü olarak bir vampir bul",
    test: (g) => (g.stats.found || 0) >= 1,
  },
  {
    id: "dedektif",
    emoji: "🔍",
    name: "Dedektif",
    desc: "Bir oyunda 2 vampir bul",
    test: (g) => (g.stats.found || 0) >= 2,
  },
  {
    id: "avci",
    emoji: "🏹",
    name: "Son kurşun",
    desc: "Avcı olarak bir vampiri vur",
    test: (g) => (g.stats.shotVamp || 0) >= 1,
  },
  {
    id: "cadi",
    emoji: "☠️",
    name: "Zehirli dokunuş",
    desc: "Cadı olarak bir vampiri zehirle",
    test: (g) => (g.stats.poisonVamp || 0) >= 1,
  },
  {
    id: "iksir",
    emoji: "🧪",
    name: "Son anda",
    desc: "Cadı olarak bir kurbanı kurtar",
    test: (g) => (g.stats.witchSave || 0) >= 1,
  },
  {
    id: "avcilik",
    emoji: "🩸",
    name: "Gece avcısı",
    desc: "Bir oyunda 3 kurbana ortak ol",
    test: (g) => (g.stats.kill || 0) >= 3,
  },
  {
    id: "adalet",
    emoji: "⚖️",
    name: "Adalet",
    desc: "Asılan bir vampire oy ver",
    test: (g) => (g.stats.rightVote || 0) >= 1,
  },
  {
    id: "ask",
    emoji: "💘",
    name: "Romantik",
    desc: "Aşık olarak hayatta kal ve kazan",
    test: (g) => g.stats.lover && g.alive && g.won,
  },
  {
    id: "kurban",
    emoji: "😵",
    name: "İlk kurban",
    desc: "Oyunda ilk ölen ol (olur böyle şeyler)",
    test: (g) => g.stats.firstDead,
  },
  {
    id: "seri",
    emoji: "🔥",
    name: "Alev alev",
    desc: "Üst üste 3 kez kazan",
    test: (g, t) => t.streak >= 3,
  },
  {
    id: "on",
    emoji: "🎖️",
    name: "Müdavim",
    desc: "10 oyun oyna",
    test: (g, t) => t.games >= 10,
  },
  {
    id: "elli",
    emoji: "👑",
    name: "Köyün demirbaşı",
    desc: "50 oyun oyna",
    test: (g, t) => t.games >= 50,
  },
  {
    id: "hayalet",
    emoji: "👻",
    name: "Hayalet kâhin",
    desc: "Ölüyken 2 vampiri doğru tahmin et",
    test: (g) => (g.stats.ghostCorrect || 0) >= 2,
  },
  {
    id: "yildiz",
    emoji: "⭐",
    name: "Oyunun yıldızı",
    desc: "Oyunun yıldızı seçil",
    test: () => false,
  },
  {
    id: "ogrenci",
    emoji: "🎓",
    name: "Mezun",
    desc: "Öğretici oyunu bitir",
    test: (g) => g.tutorial,
  },
  {
    id: "ceza",
    emoji: "🎲",
    name: "Sözünün eri",
    desc: "Bir cezayı yerine getir",
    test: () => false,
  },
];

const emptyTotals = () => ({
  games: 0,
  wins: 0,
  xp: 0,
  streak: 0,
  bestStreak: 0,
  badges: {},
});

export const progress = Vue.observable({
  totals: read("vkTotals", emptyTotals()),
  history: read("vkHistory", []),
});

export function levelFor(xp) {
  return Math.floor(Math.sqrt((xp || 0) / 25)) + 1;
}

export function xpForLevel(level) {
  return 25 * (level - 1) * (level - 1);
}

export function titleFor(level) {
  let title = TITLES[0][1];
  TITLES.forEach(([min, name]) => {
    if (level >= min) title = name;
  });
  return title;
}

function xpFor(g) {
  const s = g.stats || {};
  return (
    10 +
    (g.won ? 20 : 0) +
    (g.alive ? 5 : 0) +
    5 * (s.save || 0) +
    5 * (s.found || 0) +
    5 * (s.witchSave || 0) +
    8 * (s.shotVamp || 0) +
    8 * (s.poisonVamp || 0) +
    3 * (s.kill || 0) +
    3 * (s.rightVote || 0) +
    5 * (s.ghostCorrect || 0)
  );
}

function unlock(id) {
  if (progress.totals.badges[id]) return null;
  Vue.set(progress.totals.badges, id, Date.now());
  return BADGES.find((b) => b.id === id);
}

function save() {
  write("vkTotals", progress.totals);
  write("vkHistory", progress.history);
}

export function isBotGame(state) {
  return !!(
    state.botGame ||
    state.tutorial ||
    (state.players || []).some((p) => p.bot)
  );
}

/** called once when a game this player was in ends; returns new badges */
export function recordGame(state) {
  const key = state.code + ":" + state.gameId;
  if (progress.history.some((g) => g.key === key)) return [];
  const role = state.me.role;
  if (!role) return [];
  const won = teamOf(role) === state.winner;
  const g = {
    key,
    at: Date.now(),
    code: state.code,
    role,
    won,
    winner: state.winner,
    alive: state.me.alive,
    rounds: state.round,
    players: state.players.map((p) => ({
      name: p.name,
      role: p.role,
      alive: p.alive,
    })),
    stats: state.myStats || {},
    tutorial: !!state.tutorial,
    botGame: isBotGame(state),
    events: (state.events || []).slice(-60),
  };
  if (g.botGame) {
    g.xp = 0;
    progress.history.unshift(g);
    progress.history.splice(20);
    save();
    return { fresh: [], xp: 0, levelUp: 0 };
  }
  g.xp = xpFor(g);
  const t = progress.totals;
  const before = levelFor(t.xp);
  t.games++;
  if (won) t.wins++;
  t.streak = won ? t.streak + 1 : 0;
  t.bestStreak = Math.max(t.bestStreak, t.streak);
  t.xp += g.xp;
  t.coins = (t.coins || 0) + g.xp;
  progress.history.unshift(g);
  progress.history.splice(20);
  const fresh = BADGES.filter((b) => b.test(g, t))
    .map((b) => unlock(b.id))
    .filter(Boolean);
  save();
  return {
    fresh,
    xp: g.xp,
    levelUp: levelFor(t.xp) > before ? levelFor(t.xp) : 0,
  };
}

/** chosen as player of the game (decided after the game ended) */
export function awardMvp(key) {
  if (progress.totals.mvpKeys && progress.totals.mvpKeys.includes(key))
    return null;
  if (!progress.totals.mvpKeys) Vue.set(progress.totals, "mvpKeys", []);
  progress.totals.mvpKeys.push(key);
  progress.totals.mvpKeys.splice(0, progress.totals.mvpKeys.length - 20);
  progress.totals.xp += 15;
  progress.totals.coins = (progress.totals.coins || 0) + 15;
  const badge = unlock("yildiz");
  save();
  return { badge };
}

/** the penalty badge is earned later, when the penalty is marked as done */
export function penaltyDone() {
  const badge = unlock("ceza");
  if (badge) save();
  return badge;
}

/* ---------- XP shop: coins are earned with XP and spent on cosmetics ---------- */

export const SHOP = [
  {
    id: "back-blood",
    type: "back",
    name: "Kanlı kart arkası",
    price: 60,
    preview: "🩸",
    image: castleCardBack,
  },
  {
    id: "back-gold",
    type: "back",
    name: "Altın kart arkası",
    price: 120,
    preview: "✨",
    image: crescentCardBack,
  },
  {
    id: "back-forest",
    type: "back",
    name: "Orman kart arkası",
    price: 80,
    preview: "🌲",
  },
  {
    id: "back-stars",
    type: "back",
    name: "Yıldızlı kart arkası",
    price: 100,
    preview: "🌌",
  },
  {
    id: "frame-fire",
    type: "frame",
    name: "Ateş çerçeve",
    price: 150,
    preview: "🔥",
  },
  {
    id: "frame-ice",
    type: "frame",
    name: "Buz çerçeve",
    price: 150,
    preview: "❄️",
  },
  {
    id: "frame-rose",
    type: "frame",
    name: "Gül çerçeve",
    price: 120,
    preview: "🌹",
  },
  {
    id: "frame-shadow",
    type: "frame",
    name: "Gölge çerçeve",
    price: 200,
    preview: "🌑",
  },
  {
    id: "chat-red",
    type: "chat",
    name: "Kızıl sohbet adı",
    price: 40,
    preview: "🔴",
  },
  {
    id: "chat-blue",
    type: "chat",
    name: "Mavi sohbet adı",
    price: 40,
    preview: "🔵",
  },
  {
    id: "chat-green",
    type: "chat",
    name: "Yeşil sohbet adı",
    price: 40,
    preview: "🟢",
  },
  {
    id: "chat-purple",
    type: "chat",
    name: "Mor sohbet adı",
    price: 60,
    preview: "🟣",
  },
];

function ensureShop() {
  const t = progress.totals;
  if (t.coins === undefined) Vue.set(t, "coins", t.xp || 0);
  if (!t.owned) Vue.set(t, "owned", []);
  if (!t.equipped) Vue.set(t, "equipped", { back: "", frame: "", chat: "" });
}
ensureShop();

export function buy(id) {
  ensureShop();
  const item = SHOP.find((i) => i.id === id);
  const t = progress.totals;
  if (!item || t.owned.includes(id) || t.coins < item.price) return false;
  t.coins -= item.price;
  t.owned.push(id);
  equip(id);
  return true;
}

export function equip(id) {
  ensureShop();
  const item = SHOP.find((i) => i.id === id);
  if (!item) return;
  const t = progress.totals;
  if (!t.owned.includes(id)) return;
  t.equipped[item.type] = t.equipped[item.type] === id ? "" : id;
  save();
  if (onCosmetics) onCosmetics(t.equipped);
}

let onCosmetics = null;
export function onCosmeticsChange(fn) {
  onCosmetics = fn;
}
