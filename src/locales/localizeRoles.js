import rolesJSON from "../roles.json";
import fabledJSON from "../fabled.json";
import jinxesJSON from "../hatred.json";
import { i18nState } from "../i18n";
import rolesTR from "./roles.tr.json";
import jinxesTR from "./jinxes.tr.json";

/*
 * Applies the community translation of character names, abilities, reminder
 * tokens, night order notes and jinxes. Runs once at startup (the page reloads
 * when the language changes), mutating the shared role data in place so every
 * component sees the same text.
 */
const FIELDS = [
  "name",
  "ability",
  "firstNightReminder",
  "otherNightReminder",
  "reminders",
  "remindersGlobal",
];

function apply(roles, dictionary) {
  roles.forEach((role) => {
    const t = dictionary[role.id];
    if (!t) return;
    if (!role.nameEn) role.nameEn = role.name;
    FIELDS.forEach((field) => {
      if (t[field] !== undefined && t[field] !== "") role[field] = t[field];
    });
  });
}

if (i18nState.locale === "tr") {
  apply(rolesJSON, rolesTR);
  apply(fabledJSON, rolesTR);
  jinxesJSON.forEach(({ id, hatred }) => {
    hatred.forEach((jinx) => {
      const t = jinxesTR[id + "|" + jinx.id];
      if (t) jinx.reason = t;
    });
  });
}
