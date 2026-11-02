/*
 * Web Push for Kasaba Meydanı.
 *
 * Players who allowed notifications register their push subscription over the
 * live socket. When something happens that needs them (night falls, a vote
 * starts, their character arrives, the automatic storyteller wakes them) and
 * their app is in the background or closed, the server sends a push message.
 *
 * VAPID keys are derived from PUSH_SECRET so they survive
 * restarts. Without a secret a random key is used; clients notice the changed
 * key and subscribe again.
 */
const crypto = require("crypto");

let webpush = null;
try {
  webpush = require("web-push");
} catch (e) {
  console.log("web-push not installed, push notifications disabled");
}

const b64url = (buf) =>
  Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const SECRET =
  process.env.PUSH_SECRET || crypto.randomBytes(32).toString("hex");

let publicKey = "";
if (webpush) {
  try {
    const privateKey = crypto
      .createHash("sha256")
      .update("kasaba-meydani-vapid:" + SECRET)
      .digest();
    const ecdh = crypto.createECDH("prime256v1");
    ecdh.setPrivateKey(privateKey);
    publicKey = b64url(ecdh.getPublicKey());
    const host = process.env.PUBLIC_URL
      ? new URL(process.env.PUBLIC_URL).hostname
      : null;
    const subject =
      process.env.PUSH_SUBJECT ||
      (host
        ? "https://" + host
        : "mailto:kasaba-meydani@users.noreply.github.com");
    webpush.setVapidDetails(subject, publicKey, b64url(privateKey));
  } catch (e) {
    console.log("could not set up push keys", e.message);
    webpush = null;
  }
}

// only real browser push services are contacted (no arbitrary URLs)
const PUSH_HOSTS = [
  /(^|\.)fcm\.googleapis\.com$/,
  /(^|\.)android\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
  /(^|\.)push\.apple\.com$/,
];

const MAX_SUBSCRIPTIONS = 5000;
const DAY = 1000 * 60 * 60 * 24;
// room subscriptions matter for a day; the town square one for a month
const maxAge = (key) => (key.startsWith("lobby/") ? 30 * DAY : DAY);

/*
 * Subscriptions are kept in MySQL too, so phones keep getting "your turn"
 * notifications after the server restarts (updates) while their app is
 * closed. Keys are stored hashed: the private player id never hits the disk.
 */
let store = null;
const hashKey = (key) =>
  crypto
    .createHash("sha256")
    .update("vk-push:" + key)
    .digest("hex");
// channel/playerId -> { subscription, at }
const subscriptions = new Map();
const stats = { registered: 0, sent: 0, failed: 0 };

function validSubscription(sub) {
  if (!sub || typeof sub !== "object" || typeof sub.endpoint !== "string") {
    return false;
  }
  if (sub.endpoint.length > 1024) return false;
  let url;
  try {
    url = new URL(sub.endpoint);
  } catch (e) {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (!PUSH_HOSTS.some((re) => re.test(url.hostname))) return false;
  const keys = sub.keys || {};
  return (
    typeof keys.p256dh === "string" &&
    typeof keys.auth === "string" &&
    keys.p256dh.length < 200 &&
    keys.auth.length < 100
  );
}

function register(channel, playerId, sub) {
  if (!webpush || !validSubscription(sub)) return false;
  if (subscriptions.size >= MAX_SUBSCRIPTIONS) {
    // drop the oldest entry
    const oldest = subscriptions.keys().next().value;
    subscriptions.delete(oldest);
  }
  const key = channel + "/" + playerId;
  subscriptions.delete(key);
  const entry = {
    subscription: {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    },
    at: Date.now(),
  };
  subscriptions.set(key, entry);
  if (store) store.savePush(hashKey(key), entry);
  stats.registered++;
  return true;
}

function forget(key) {
  subscriptions.delete(key);
  if (store) store.deletePush(hashKey(key));
}

function unregister(channel, playerId) {
  forget(channel + "/" + playerId);
}

/** forget every subscription of a player (all rooms and the lobby) */
function unregisterEverywhere(playerId) {
  [...subscriptions.keys()]
    .filter((k) => k.endsWith("/" + playerId))
    .forEach(forget);
}

/**
 * Send a push message to one player.
 * payload: {title, body, tag, url}
 */
function send(channel, playerId, payload) {
  if (!webpush) return Promise.resolve(false);
  const key = channel + "/" + playerId;
  let entry = subscriptions.get(key);
  if (!entry) {
    // loaded from the database after a restart
    entry = diskEntries.get(hashKey(key));
    if (entry) subscriptions.set(key, entry);
  }
  if (!entry) return Promise.resolve(false);
  if (Date.now() - entry.at > maxAge(key)) {
    forget(key);
    return Promise.resolve(false);
  }
  return webpush
    .sendNotification(entry.subscription, JSON.stringify(payload), {
      TTL: 600,
      urgency: "high",
      topic: (payload.tag || "kasaba")
        .replace(/[^a-z0-9_-]/gi, "")
        .slice(0, 32),
    })
    .then(() => {
      stats.sent++;
      return true;
    })
    .catch((err) => {
      stats.failed++;
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        forget(key);
      } else {
        console.log("push failed", err && (err.statusCode || err.message));
      }
      return false;
    });
}

/** players of a channel that have a subscription */
function subscribedPlayers(channel) {
  const prefix = channel + "/";
  const list = [];
  for (const key of subscriptions.keys()) {
    if (key.startsWith(prefix)) list.push(key.slice(prefix.length));
  }
  return list;
}

// forget stale subscriptions
setInterval(
  () => {
    const now = Date.now();
    for (const [key, entry] of subscriptions) {
      if (now - entry.at > maxAge(key)) forget(key);
    }
  },
  1000 * 60 * 30,
).unref();

/** subscriptions saved before a restart (hashed key -> entry) */
const diskEntries = new Map();

/** connect the database: load saved subscriptions, save new ones */
async function attach(db) {
  if (!db || !db.loadPushes) return;
  store = db;
  const rows = (await db.loadPushes(30 * DAY)) || [];
  rows.forEach((r) => diskEntries.set(r.key, r.entry));
}

module.exports = {
  attach,
  enabled: () => !!webpush,
  publicKey: () => publicKey,
  register,
  unregister,
  unregisterEverywhere,
  send,
  subscribedPlayers,
  stats: () => ({ ...stats, subscriptions: subscriptions.size }),
};
