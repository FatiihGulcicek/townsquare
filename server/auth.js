"use strict";
const crypto = require("crypto");
const db = require("./db");
const mail = require("./mail");

const COOKIE = "vk_session";
const sessionDays = 30;
const codeKey = crypto.randomBytes(32);
const requests = new Map();
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const codeHash = (email, code) => crypto.createHmac("sha256", codeKey).update(email + ":" + code).digest("hex");
const normalizeEmail = (value) => {
  const email = String(value || "").trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
};
const cleanName = (value) => String(value || "").replace(/\s+/g, " ").trim().slice(0, 24);
const enabled = () => db.enabled() && mail.enabled();
const profile = (row) => row && ({
  id: row.id, email: row.email, name: row.name,
  playerId: row.player_id, friendCode: row.friend_code,
});

function cookieToken(req) {
  const pair = String(req.headers.cookie || "").split("; ").find((part) => part.startsWith(COOKIE + "="));
  const value = pair && pair.slice(COOKIE.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : "";
}
function setCookie(req, res, token) {
  const secure = req.socket.encrypted || req.headers["x-forwarded-proto"] === "https" ||
    (process.env.PUBLIC_URL || "").startsWith("https://");
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionDays * 86400}${secure ? "; Secure" : ""}`);
}
function clearCookie(req, res) {
  setCookie(req, res, "");
  res.setHeader("Set-Cookie", String(res.getHeader("Set-Cookie")).replace(/Max-Age=\d+/, "Max-Age=0"));
}

function allowRequest(key, max, period) {
  const now = Date.now();
  const row = (requests.get(key) || []).filter((at) => now - at < period);
  if (row.length >= max) return false;
  row.push(now);
  requests.set(key, row);
  if (requests.size > 10000) requests.clear();
  return true;
}

async function requestCode(emailValue, ip) {
  if (!enabled()) return { error: "unavailable" };
  const email = normalizeEmail(emailValue);
  if (!email) return { error: "email" };
  if (!allowRequest("ip:" + ip, 200, 3600000) ||
      !allowRequest("email:" + sha(email), 6, 3600000)) return { error: "rate" };
  const code = String(crypto.randomInt(10000000, 100000000));
  const saved = await db.withDb("saveLoginCode", async (pool) => {
    const [[old]] = await pool.query("SELECT sent_at FROM vk_login_codes WHERE email = ?", [email]);
    if (old && Date.now() - new Date(old.sent_at).getTime() < 60000) return "wait";
    await pool.query(
      "INSERT INTO vk_login_codes (email, code_hash, expires_at, sent_at, attempts) VALUES (?, ?, ?, NOW(), 0) " +
      "ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), expires_at = VALUES(expires_at), sent_at = NOW(), attempts = 0",
      [email, codeHash(email, code), new Date(Date.now() + 600000)],
    );
    return "saved";
  });
  if (saved === "wait") return { error: "wait" };
  if (saved !== "saved") return { error: "unavailable" };
  try {
    await mail.sendCode(email, code);
  } catch (e) {
    await db.withDb("dropLoginCode", (pool) => pool.query("DELETE FROM vk_login_codes WHERE email = ?", [email]));
    return { error: "mail" };
  }
  return { ok: true };
}

async function consumeCode(email, code) {
  return db.withDb("consumeLoginCode", async (pool) => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[row]] = await conn.query("SELECT code_hash, expires_at, attempts FROM vk_login_codes WHERE email = ? FOR UPDATE", [email]);
      if (!row || new Date(row.expires_at).getTime() < Date.now() || row.attempts >= 5) {
        await conn.commit();
        return false;
      }
      const expected = Buffer.from(row.code_hash, "hex");
      const actual = Buffer.from(codeHash(email, code), "hex");
      const good = crypto.timingSafeEqual(expected, actual);
      if (good) await conn.query("DELETE FROM vk_login_codes WHERE email = ?", [email]);
      else await conn.query("UPDATE vk_login_codes SET attempts = attempts + 1 WHERE email = ?", [email]);
      await conn.commit();
      return good;
    } catch (e) {
      await conn.rollback().catch(() => {});
      throw e;
    } finally { conn.release(); }
  });
}

async function accountFor(email, name, claimPlayerId, register) {
  return db.withDb("accountFor", async (pool) => {
    const [[existing]] = await pool.query("SELECT * FROM vk_accounts WHERE email = ?", [email]);
    if (existing) return profile(existing);
    if (!register || !name) return null;
    const id = crypto.randomBytes(16).toString("hex");
    let playerId = /^[a-z0-9]{8,40}$/.test(claimPlayerId || "") ? claimPlayerId : "";
    if (playerId) {
      const [[claimed]] = await pool.query("SELECT id FROM vk_accounts WHERE player_id = ?", [playerId]);
      if (claimed) playerId = "";
    }
    if (!playerId) playerId = crypto.randomBytes(16).toString("hex");
    for (let i = 0; i < 3; i++) {
      const friendCode = crypto.randomBytes(4).toString("hex").toUpperCase();
      try {
        await pool.query("INSERT INTO vk_accounts (id, email, name, player_id, friend_code) VALUES (?, ?, ?, ?, ?)",
          [id, email, name, playerId, friendCode]);
        return { id, email, name, playerId, friendCode };
      } catch (e) {
        if (e.code !== "ER_DUP_ENTRY") throw e;
      }
    }
    throw new Error("account collision");
  });
}

async function verifyCode(body, req, res) {
  if (!enabled()) return { error: "unavailable" };
  const email = normalizeEmail(body.email);
  const code = String(body.code || "").trim();
  if (!email || !/^\d{8}$/.test(code)) return { error: "code" };
  if (!allowRequest("verify:" + (req.socket.remoteAddress || ""), 500, 3600000)) return { error: "rate" };
  if (!(await consumeCode(email, code))) return { error: "code" };
  const account = await accountFor(email, cleanName(body.name), body.playerId, !!body.register);
  if (!account) return { error: body.register ? "unavailable" : "no_account" };
  const token = crypto.randomBytes(32).toString("hex");
  const stored = await db.withDb("newSession", (pool) => pool.query(
    "INSERT INTO vk_sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)",
    [sha(token), account.id, new Date(Date.now() + sessionDays * 86400000)],
  ));
  if (!stored) return { error: "unavailable" };
  setCookie(req, res, token);
  return { user: account };
}

async function session(req) {
  if (!enabled()) return null;
  const token = cookieToken(req);
  if (!token) return null;
  return db.withDb("getSession", async (pool) => {
    const [[row]] = await pool.query(
      "SELECT a.* FROM vk_sessions s JOIN vk_accounts a ON a.id = s.account_id " +
      "WHERE s.token_hash = ? AND s.expires_at > NOW()", [sha(token)],
    );
    return profile(row);
  });
}
async function logout(req, res) {
  const token = cookieToken(req);
  if (token) await db.withDb("logout", (pool) => pool.query("DELETE FROM vk_sessions WHERE token_hash = ?", [sha(token)]));
  clearCookie(req, res);
}

module.exports = { enabled, normalizeEmail, requestCode, verifyCode, session, logout };
