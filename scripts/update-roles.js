/*
 * Regenerates src/roles.json, src/fabled.json, src/hatred.json and
 * src/nightsheet.json from the official toolmaker resources published by
 * The Pandemonium Institute (https://github.com/ThePandemoniumInstitute/botc-release).
 *
 * Usage:
 *   git clone --depth 1 https://github.com/ThePandemoniumInstitute/botc-release.git /tmp/botc-release
 *   node scripts/update-roles.js /tmp/botc-release/resources
 *
 * Existing entries are merged (so local fields such as imageAlt survive) and
 * characters that were removed officially are kept for old saved games.
 */
const fs = require("fs");
const path = require("path");

const res = process.argv[2];
if (!res) {
  console.error("usage: node scripts/update-roles.js <botc-release/resources>");
  process.exit(1);
}
const src = path.join(__dirname, "..", "src");
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const write = (f, d) =>
  fs.writeFileSync(path.join(src, f), JSON.stringify(d, null, 2) + "\n");

const official = read(path.join(res, "data", "roles.json"));
const jinxes = read(path.join(res, "data", "jinxes.json"));
const nightsheet = read(path.join(res, "data", "nightsheet.json"));
const oldRoles = read(path.join(src, "roles.json"));
const oldFabled = read(path.join(src, "fabled.json"));
const oldById = new Map([...oldRoles, ...oldFabled].map((r) => [r.id, r]));

// night order position = index in the official night sheet (0 = does not wake)
const pos = (list, id) => {
  const i = list.indexOf(id);
  return i > 0 ? i : 0;
};
const first = nightsheet.firstNight;
const other = nightsheet.otherNight;

const TEAM = { traveller: "traveler", loric: "fabled" };
const EDITION = { tb: "tb", bmr: "bmr", snv: "snv" };

function convert(role) {
  const old = oldById.get(role.id) || {};
  const out = {
    ...old,
    id: role.id,
    name: role.name,
    edition: EDITION[role.edition] || "",
    team: TEAM[role.team] || role.team,
    firstNight: pos(first, role.id),
    firstNightReminder: role.firstNightReminder || "",
    otherNight: pos(other, role.id),
    otherNightReminder: role.otherNightReminder || "",
    reminders: role.reminders || [],
    setup: !!role.setup,
    ability: role.ability,
  };
  if (role.remindersGlobal && role.remindersGlobal.length) {
    out.remindersGlobal = role.remindersGlobal;
  } else {
    delete out.remindersGlobal;
  }
  if (role.team === "loric") out.loric = true;
  return out;
}

const isStoryteller = (r) => r.team === "fabled" || r.team === "loric";
const roles = official.filter((r) => !isStoryteller(r)).map(convert);
const fabled = official.filter(isStoryteller).map(convert);

// keep characters that no longer exist officially (e.g. renamed ones)
const known = new Set(official.map((r) => r.id));
const ALIASES = { mephit: "mezepheles" };
for (const r of oldRoles) {
  if (known.has(r.id)) continue;
  const alias = ALIASES[r.id];
  roles.push({
    ...r,
    firstNight: alias ? pos(first, alias) : 0,
    otherNight: alias ? pos(other, alias) : 0,
  });
}

const order = ["tb", "bmr", "snv", ""];
const teams = ["townsfolk", "outsider", "minion", "demon", "traveler"];
roles.sort(
  (a, b) =>
    order.indexOf(a.edition) - order.indexOf(b.edition) ||
    teams.indexOf(a.team) - teams.indexOf(b.team) ||
    a.name.localeCompare(b.name),
);

const hatred = jinxes.map(({ id, jinx }) => ({
  id,
  hatred: jinx.map(({ id, reason }) => ({ id, reason })),
}));

write("roles.json", roles);
write("fabled.json", fabled);
write("hatred.json", hatred);
write("nightsheet.json", {
  minioninfo: pos(first, "minioninfo"),
  demoninfo: pos(first, "demoninfo"),
  dawnFirst: pos(first, "dawn"),
  dawnOther: pos(other, "dawn"),
});

// report missing icons
const icons = new Set(
  fs
    .readdirSync(path.join(src, "assets", "icons"))
    .map((f) => f.replace(/\.png$/, "")),
);
const missing = [...roles, ...fabled]
  .map((r) => r.imageAlt || r.id)
  .filter((id) => !icons.has(id));
console.log(
  `roles: ${roles.length}, fabled/loric: ${fabled.length}, jinxes: ${hatred.length}`,
);
if (missing.length) console.log("missing icons:", missing.join(" "));
