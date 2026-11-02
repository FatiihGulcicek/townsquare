/*
 * Small wrapper around localStorage. Private browsing or a full disk make it
 * throw, so every access goes through here and falls back quietly.
 */
export function getItem(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch (e) {
    return fallback;
  }
}

/** null or undefined removes the key */
export function setItem(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (e) {
    // private mode or storage full
  }
}

export function getJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "") || fallback;
  } catch (e) {
    return fallback;
  }
}

export function setJSON(key, value) {
  setItem(key, JSON.stringify(value));
}

/** "on"/"off" switches */
export function getFlag(key, defaultOn) {
  return getItem(key, defaultOn ? "on" : "off") === "on";
}

export function setFlag(key, on) {
  setItem(key, on ? "on" : "off");
}

export function storedKeys() {
  try {
    return Object.keys(localStorage);
  } catch (e) {
    return [];
  }
}
