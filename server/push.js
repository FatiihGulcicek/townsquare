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

const MAX_SUBSCRIPTIONS = 3000;
const MAX_AGE = 1000 * 60 * 60 * 18; // 18 hours
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
  subscriptions.set(key, {
    subscription: {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    },
    at: Date.now(),
  });
  stats.registered++;
  return true;
}

function unregister(channel, playerId) {
  subscriptions.delete(channel + "/" + playerId);
}

/** forget every subscription of a player (all rooms and the lobby) */
function unregisterEverywhere(playerId) {
  [...subscriptions.keys()]
    .filter((k) => k.endsWith("/" + playerId))
    .forEach((k) => subscriptions.delete(k));
}

/**
 * Send a push message to one player.
 * payload: {title, body, tag, url}
 */
function send(channel, playerId, payload) {
  if (!webpush) return Promise.resolve(false);
  const key = channel + "/" + playerId;
  const entry = subscriptions.get(key);
  if (!entry) return Promise.resolve(false);
  if (Date.now() - entry.at > MAX_AGE) {
    subscriptions.delete(key);
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
        subscriptions.delete(key);
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
      if (now - entry.at > MAX_AGE) subscriptions.delete(key);
    }
  },
  1000 * 60 * 30,
).unref();

module.exports = {
  enabled: () => !!webpush,
  publicKey: () => publicKey,
  register,
  unregister,
  unregisterEverywhere,
  send,
  subscribedPlayers,
  stats: () => ({ ...stats, subscriptions: subscriptions.size }),
};
