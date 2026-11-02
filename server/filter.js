/*
 * Simple word filter for chat and player names (app stores require a way to
 * filter objectionable content in user messages). Matching words are masked:
 * "salak" -> "s***k". It is deliberately small: common Turkish and English
 * insults, written the way people type them on phones.
 */
"use strict";

const WORDS = [
  // Turkish
  "amk",
  "aq",
  "amq",
  "amına",
  "amina",
  "amcık",
  "amcik",
  "orospu",
  "orosbu",
  "piç",
  "sik",
  "sikik",
  "sikerim",
  "siktir",
  "sikeyim",
  "yarrak",
  "yarak",
  "götveren",
  "gotveren",
  "ibne",
  "pezevenk",
  "kahpe",
  "kaltak",
  "gavat",
  "şerefsiz",
  "serefsiz",
  "puşt",
  "pust",
  "dalyarak",
  "yavşak",
  "yavsak",
  "oç",
  "mk",
  "skm",
  "sktir",
  "göt",
  "taşak",
  "tasak",
  // English
  "fuck",
  "fucking",
  "fucker",
  "shit",
  "bitch",
  "cunt",
  "pussy",
  "asshole",
  "bastard",
  "slut",
  "whore",
  "nigger",
  "faggot",
];

const LETTERS = "a-zçğıöşüâîû0-9";
const PATTERN = new RegExp(
  `(^|[^${LETTERS}])(${WORDS.map((w) =>
    w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("|")})(?=$|[^${LETTERS}])`,
  "giu",
);

function mask(word) {
  if (word.length <= 2) return "*".repeat(word.length);
  return word[0] + "*".repeat(word.length - 2) + word[word.length - 1];
}

/** text with offensive words masked */
function clean(text) {
  if (typeof text !== "string" || !text) return text;
  return text.replace(PATTERN, (all, before, word) => before + mask(word));
}

/** true when a name contains an offensive word */
function isOffensive(text) {
  return clean(text) !== text;
}

module.exports = { clean, isOffensive };
