/** character artwork for each role (full figure or a face thumbnail) */
const KNOWN = [
  "vampir",
  "koylu",
  "doktor",
  "gozcu",
  "avci",
  "cadi",
  "deli",
  "muhtar",
  "kurtadam",
  "asiklar",
];

export function roleArt(role, small = false) {
  if (!KNOWN.includes(role)) return "";
  return `/static/roles/${role}${small ? "-s" : ""}.webp`;
}
