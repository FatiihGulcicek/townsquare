import Vue from "vue";
import tr from "./locales/tr.json";

/*
 * Minimal i18n: the English text is the key, so untranslated strings simply
 * fall back to English. Placeholders use {name} syntax.
 *   $t("{count} votes", { count: 3 })
 */
const dictionaries = { en: {}, tr };

export const languages = [
  { id: "tr", name: "Türkçe" },
  { id: "en", name: "English" },
];

function initialLocale() {
  try {
    const saved = localStorage.getItem("locale");
    if (saved && dictionaries[saved]) return saved;
  } catch (e) {
    // localStorage not available
  }
  const nav = (navigator.language || "en").toLowerCase();
  return nav.startsWith("tr") ? "tr" : "en";
}

export const i18nState = Vue.observable({ locale: initialLocale() });

export function t(key, params) {
  const dict = dictionaries[i18nState.locale] || {};
  let text = dict[key] || key;
  if (params) {
    Object.keys(params).forEach((name) => {
      text = text.split("{" + name + "}").join(params[name]);
    });
  }
  return text;
}

export function setLocale(locale) {
  if (!dictionaries[locale]) return;
  i18nState.locale = locale;
  document.documentElement.lang = locale;
  try {
    localStorage.setItem("locale", locale);
  } catch (e) {
    // ignore
  }
}

export default {
  install(VueInstance) {
    document.documentElement.lang = i18nState.locale;
    VueInstance.prototype.$t = t;
    VueInstance.prototype.$i18n = i18nState;
  },
};
