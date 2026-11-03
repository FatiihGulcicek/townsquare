/*
 * Kasaba Meydanı – Vampir Köylü server
 * - serves the built app (dist/) with compression and caching
 * - runs game rooms over WebSocket: /vk/<ROOM>/<playerId>
 * - web push for players whose app is in the background
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const zlib = require("zlib");
const crypto = require("crypto");
const WebSocket = require("ws");
const push = require("./push");
const { Room } = require("./vk");
const db = require("./db");
if (db.init) db.init(); // create the MySQL tables right away
if (db.enabled()) push.attach(db); // notifications survive restarts
const { Lobby } = require("./lobby");
const updater = require("./updater");
const STARTED = new Date().toISOString();

const PORT = parseInt(process.env.PORT || "8080", 10);
const STATIC_DIR = path.resolve(
  process.env.STATIC_DIR || path.join(__dirname, "..", "dist"),
);
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const MAX_ROOMS = parseInt(process.env.MAX_ROOMS || "200", 10);
const MAX_PER_ROOM = 40;
const VALID_ID = /^[a-z0-9_-]{4,40}$/i;
const ROOM_CODE = /^[A-Z]{4}$/;
const CODE_LETTERS = "ABCDEFGHJKLMNPRSTUVYZ";

const PUBLIC_ORIGIN = process.env.PUBLIC_URL
  ? new URL(process.env.PUBLIC_URL).origin.toLowerCase()
  : null;

function isAllowedOrigin(origin, req) {
  if (!origin) return false;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch (e) {
    return false;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return false;
  const exactOrigin = parsed.origin.toLowerCase();
  if (PUBLIC_ORIGIN && exactOrigin === PUBLIC_ORIGIN) return true;
  if (
    EXTRA_ORIGINS.some((allowed) => {
      try {
        return new URL(allowed).origin.toLowerCase() === exactOrigin;
      } catch (e) {
        return false;
      }
    })
  )
    return true;
  const headers = (req && req.headers) || {};
  const requestHost = String(headers.host || "").trim().toLowerCase();
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestHost);
  if (local) return parsed.host.toLowerCase() === requestHost;
  return !PUBLIC_ORIGIN && parsed.host.toLowerCase() === requestHost;
}

// ---------- rooms ----------

const rooms = new Map(); // code -> { room, sockets: Set<ws> }

function newCode() {
  for (let i = 0; i < 1000; i++) {
    let code = "";
    for (let k = 0; k < 4; k++) {
      code += CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return null;
}

const isOpen = (ws) => ws.readyState === WebSocket.OPEN;

function isAway(entry, playerId) {
  return ![...entry.sockets].some(
    (ws) => ws.playerId === playerId && isOpen(ws) && ws.visible !== false,
  );
}

function roomIo(code, entry) {
  return {
    sendTo: (id, data) =>
      entry.sockets.forEach((ws) => {
        if (ws.playerId === id && isOpen(ws)) ws.send(data);
      }),
    connectedIds: () => [
      ...new Set([...entry.sockets].filter(isOpen).map((ws) => ws.playerId)),
    ],
    push: (ids, payload) => {
      if (!push.enabled()) return;
      [...new Set(ids)].forEach((id) => {
        if (isAway(entry, id)) {
          push.send(code, id, { url: "/#" + code, ...payload });
        }
      });
    },
    destroy: () => {
      entry.sockets.forEach((ws) => ws.close(4004, "Oda kapandı"));
      rooms.delete(code);
      db.closeRoom(code);
    },
    save: (snapshot) => db.enabled() && db.saveRoom(code, snapshot),
    profile: (playerId, name) =>
      db.enabled() && db.touchProfile(playerId, name),
    gameOver: (record) => {
      // results are also kept in memory for the weekly board
      record.players.forEach((p) =>
        recentResults.push({
          key: db.profileKey(p.id),
          name: p.name,
          won: p.won,
          at: Date.now(),
        }),
      );
      if (recentResults.length > 5000) recentResults.splice(0, 1000);
      if (!db.enabled()) return;
      db.recordGame({
        ...record,
        players: record.players.map(({ id, ...p }) => ({
          key: db.profileKey(id),
          ...p,
        })),
      });
    },
  };
}

function createRoom(mode, creatorId, wanted, tutorial, password) {
  if (rooms.size >= MAX_ROOMS) return null;
  const code = wanted || newCode();
  if (!code) return null;
  const entry = { sockets: new Set(), room: null };
  entry.room = new Room(code, mode, creatorId, roomIo(code, entry));
  if (tutorial) {
    // a practice game against bots with calm timings
    entry.room.tutorial = true;
    Object.assign(entry.room.settings, {
      dayMinutes: 3,
      nightSeconds: 90,
      penalty: "off",
      idlePenalty: false,
    });
  }
  if (password) entry.room.password = password;
  rooms.set(code, entry);
  entry.room.save();
  return code;
}

// rooms survive restarts: a room that is not in memory is loaded from the database
const loading = new Map();
function findRoom(code) {
  if (rooms.has(code)) return Promise.resolve(rooms.get(code));
  if (!db.enabled()) return Promise.resolve(null);
  if (!loading.has(code)) {
    loading.set(
      code,
      db
        .loadRoom(code)
        .then((data) => {
          if (rooms.has(code)) return rooms.get(code);
          if (!data || data.closed || !data.code) return null;
          const entry = { sockets: new Set(), room: null };
          entry.room = Room.fromJSON(data, roomIo(code, entry));
          rooms.set(code, entry);
          console.log("restored room", code, entry.room.phase);
          return entry;
        })
        .catch(() => null)
        .finally(() => loading.delete(code)),
    );
  }
  return loading.get(code);
}

// close rooms nobody uses any more
setInterval(() => {
  const now = Date.now();
  rooms.forEach((entry) => {
    const online = [...entry.sockets].some(isOpen);
    if (online) entry.room.lastActivity = now;
    if (
      now - entry.room.lastActivity > 30 * 60 * 1000 ||
      now - entry.room.createdAt > 24 * 3600 * 1000
    ) {
      entry.room.destroy();
    }
  });
}, 60 * 1000).unref();

// the square outside the games: who's online, chat, invitations
const lobby = new Lobby(
  push,
  (code) => rooms.has(code),
  // an invitation from someone inside a password room lets the guest in
  (code, inviterId, guestId) => {
    const entry = rooms.get(code);
    if (!entry) return false;
    const room = entry.room;
    if (!room.password) return true;
    if (!room.mayEnter(inviterId)) return false;
    room.allow(guestId);
    return true;
  },
);

// ---------- websocket ----------

const server = http.createServer();
const diagnostics = { accepted: 0, rejected: 0 };
const wss = new WebSocket.Server({
  server,
  maxPayload: 128 * 1024, // profile photos (~58 KB) travel over the socket
  verifyClient: (info) => {
    const ok = isAllowedOrigin(info.origin, info.req);
    if (ok) diagnostics.accepted++;
    else diagnostics.rejected++;
    return ok;
  },
});

/** liveness and flood counters shared by both kinds of sockets */
function watchSocket(ws) {
  ws.isAlive = true;
  ws.counter = 0;
  ws.on("pong", () => {
    ws.isAlive = true;
    ws.counter = 0;
  });
  ws.on("error", () => {});
}

/** ["command", params] or null */
function parseMessage(raw) {
  try {
    const message = JSON.parse(raw.toString());
    return Array.isArray(message) ? message : null;
  } catch (e) {
    return null;
  }
}

wss.on("connection", (ws, req) => {
  const parts = req.url.split("?")[0].split("/").filter(Boolean);
  // /lobby/<playerId>
  if (parts[0] === "lobby" && parts.length === 2 && VALID_ID.test(parts[1])) {
    const id = parts[1];
    watchSocket(ws);
    lobby.connect(ws, id);
    ws.on("close", () => lobby.disconnect(ws, id));
    ws.on("message", (raw, isBinary) => {
      if (isBinary || ++ws.counter > 120) return;
      const message = parseMessage(raw);
      if (!message) return;
      const [command, params] = message;
      if (command === "ping") return ws.send('["pong"]');
      lobby.receive(id, command, params);
    });
    return;
  }
  // /vk/<ROOM>/<playerId>
  if (parts[0] !== "vk" || parts.length !== 3) {
    return ws.close(1000, "Geçersiz bağlantı");
  }
  const code = parts[1].toUpperCase();
  const playerId = parts[2];
  if (!ROOM_CODE.test(code) || !VALID_ID.test(playerId)) {
    return ws.close(1000, "Geçersiz oda");
  }
  ws.playerId = playerId;
  watchSocket(ws);
  // messages that arrive while the room is being loaded wait here
  const queue = [];
  let entry = null;
  const handle = (raw) => {
    if (++ws.counter > 150) return ws.close(1000, "Çok fazla mesaj");
    const message = parseMessage(raw);
    if (!message) return;
    const [command, params] = message;
    if (command === "ping") return ws.send('["pong"]');
    if (command === "visible") {
      ws.visible = params !== false;
      return;
    }
    if (command === "push") {
      if (params) push.register(code, playerId, params);
      else push.unregister(code, playerId);
      return;
    }
    entry.room.receive(playerId, command, params);
  };
  ws.on("message", (raw, isBinary) => {
    if (isBinary) return;
    if (entry) handle(raw);
    else if (queue.length < 20) queue.push(raw);
  });
  findRoom(code).then((found) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (!found) return ws.close(4004, "Oda bulunamadı");
    const pass = new URLSearchParams(req.url.split("?")[1] || "").get("k");
    if (!found.room.mayEnter(playerId, pass)) {
      return ws.close(pass ? 4013 : 4003, "Şifre gerekli");
    }
    if (found.sockets.size >= MAX_PER_ROOM) return ws.close(1000, "Oda dolu");
    entry = found;
    entry.sockets.add(ws);
    ws.on("close", () => {
      entry.sockets.delete(ws);
      const still = [...entry.sockets].some(
        (other) => other.playerId === playerId && isOpen(other),
      );
      if (!still) entry.room.left(playerId);
      entry.room.update();
    });
    entry.room.sendState(playerId);
    queue.splice(0).forEach(handle);
    entry.room.update();
  });
});

const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);
wss.on("close", () => clearInterval(heartbeat));

// ---------- http ----------

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};
const COMPRESSIBLE = new Set([
  ".html",
  ".js",
  ".css",
  ".json",
  ".svg",
  ".txt",
  ".xml",
  ".map",
  ".webmanifest",
]);
const compressedCache = new Map();

function sendFile(res, file, req) {
  const ext = path.extname(file).toLowerCase();
  res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
  const accept = (req && req.headers["accept-encoding"]) || "";
  res.setHeader(
    "Cache-Control",
    /\.[0-9a-f]{8}\./.test(file)
      ? "public, max-age=31536000, immutable"
      : "no-cache",
  );
  if (COMPRESSIBLE.has(ext)) {
    res.setHeader("Vary", "Accept-Encoding");
    const encoding = /\bbr\b/.test(accept)
      ? "br"
      : /\bgzip\b/.test(accept)
      ? "gzip"
      : null;
    if (encoding) {
      const key = encoding + ":" + file;
      let body = compressedCache.get(key);
      if (!body) {
        const raw = fs.readFileSync(file);
        body =
          encoding === "br"
            ? zlib.brotliCompressSync(raw, {
                params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 },
              })
            : zlib.gzipSync(raw, { level: 9 });
        compressedCache.set(key, body);
      }
      res.setHeader("Content-Encoding", encoding);
      res.setHeader("Content-Length", body.length);
      return res.end(req.method === "HEAD" ? undefined : body);
    }
  }
  fs.createReadStream(file).pipe(res);
}

let leaderboardCache = {};
const recentResults = [];

/** start of this week (Monday 00:00, Istanbul) / this month */
function periodStart(period, offset = 0) {
  const now = new Date(Date.now() + 3 * 3600 * 1000); // Istanbul clock
  let start;
  if (period === "month") {
    start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1);
  } else {
    const day = (now.getUTCDay() + 6) % 7; // Monday = 0
    start =
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - day,
      ) -
      offset * 7 * 86400000;
  }
  return start - 3 * 3600 * 1000;
}

function memoryBoard(since, until = Infinity) {
  const rows = {};
  recentResults
    .filter((r) => r.at >= since && r.at < until)
    .forEach((r) => {
      const row =
        rows[r.key] || (rows[r.key] = { name: r.name, games: 0, wins: 0 });
      row.name = r.name;
      row.games++;
      if (r.won) row.wins++;
    });
  return Object.values(rows)
    .map((r) => ({ ...r, rate: Math.round((100 * r.wins) / r.games) }))
    .sort((a, b) => b.wins - a.wins || a.games - b.games)
    .slice(0, 20);
}

async function board(period) {
  const now = Date.now();
  const cached = leaderboardCache[period];
  if (cached && now - cached.at < 60000) return cached.data;
  let data;
  if (period === "all") {
    data = db.enabled() ? (await db.leaderboard()) || [] : memoryBoard(0);
  } else {
    const since = periodStart(period);
    data = db.enabled()
      ? (await db.leaderboardSince(since)) || []
      : memoryBoard(since);
  }
  // last period's champion
  let champion = null;
  if (period !== "all") {
    const prevStart = periodStart(period, 1);
    const prev = db.enabled()
      ? (await db.leaderboardSince(prevStart, periodStart(period))) || []
      : memoryBoard(prevStart, periodStart(period));
    champion = prev[0] || null;
  }
  const result = { list: data, champion };
  leaderboardCache[period] = { at: now, data: result };
  return result;
}

/*
 * Cloudflare's TURN relay (free up to 1,000 GB a month) lets voice and video
 * work on mobile networks that block direct phone-to-phone links. The key
 * stays on the server; browsers get short-lived credentials.
 */
let turnCache = { at: 0, servers: null };
async function cloudflareTurn() {
  const id = process.env.CF_TURN_KEY_ID;
  const token = process.env.CF_TURN_API_TOKEN;
  if (!id || !token) return null;
  if (turnCache.servers && Date.now() - turnCache.at < 12 * 3600 * 1000) {
    return turnCache.servers;
  }
  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: 86400 }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) throw new Error("status " + response.status);
    const data = await response.json();
    const list = [].concat(data.iceServers || []).map((s) => ({
      ...s,
      // port 53 is blocked by browsers and only slows the connection down
      urls: [].concat(s.urls).filter((u) => !/:53\b/.test(u)),
    }));
    turnCache = { at: Date.now(), servers: list };
    return list;
  } catch (e) {
    console.log("turn credentials failed", String(e.message || e));
    return turnCache.servers;
  }
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

function readBody(req, limit = 4096) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > limit) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch (e) {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

server.on("request", async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  );
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/healthz") {
    return json(res, 200, {
      ok: true,
      rooms: rooms.size,
      players: wss.clients.size,
      connections: diagnostics,
      push: push.stats(),
      db: db.stats(),
      lobby: lobby.stats(),
      updater: updater.status(),
      turn: !!(
        (process.env.CF_TURN_KEY_ID && process.env.CF_TURN_API_TOKEN) ||
        process.env.TURN_URL
      ),
      started: STARTED,
    });
  }
  if (url.pathname === "/push/key") {
    return json(res, 200, { enabled: push.enabled(), key: push.publicKey() });
  }
  if (url.pathname === "/api/room") {
    if (req.method !== "POST") return json(res, 405, { error: "POST" });
    if (!isAllowedOrigin(req.headers.origin, req)) {
      return json(res, 403, { error: "origin" });
    }
    const body = await readBody(req);
    if (!VALID_ID.test(body.playerId || "")) {
      return json(res, 400, { error: "playerId" });
    }
    // a chosen, permanent code ("CUMA"): reuse the room if it still exists
    let wanted = null;
    if (body.code) {
      wanted = String(body.code).toUpperCase();
      if (!ROOM_CODE.test(wanted)) return json(res, 400, { error: "code" });
      const existing = await findRoom(wanted);
      if (existing) return json(res, 200, { code: wanted, existing: true });
    }
    const code = createRoom(
      body.tutorial ? "auto" : body.mode,
      body.playerId,
      body.tutorial ? null : wanted,
      !!body.tutorial,
      typeof body.password === "string" && !body.tutorial
        ? body.password.replace(/\s+/g, " ").trim().slice(0, 20)
        : "",
    );
    if (!code) return json(res, 503, { error: "busy" });
    return json(res, 200, { code });
  }
  if (url.pathname === "/.well-known/assetlinks.json") {
    // proves to Android that the Play Store app (TWA) and this site belong
    // together, so the app opens full screen without a browser bar
    const pkg = process.env.TWA_PACKAGE;
    const prints = (process.env.TWA_SHA256 || "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (!pkg || !prints.length) return json(res, 404, []);
    return json(res, 200, [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: pkg,
          sha256_cert_fingerprints: prints,
        },
      },
    ]);
  }
  if (url.pathname === "/api/ice") {
    // STUN finds a direct route between phones; a TURN relay (optional)
    // helps when mobile networks block direct connections
    const iceServers = [
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
          "stun:stun.cloudflare.com:3478",
        ],
      },
    ];
    const relay = await cloudflareTurn();
    if (relay) iceServers.push(...relay);
    if (process.env.TURN_URL) {
      iceServers.push({
        urls: process.env.TURN_URL.split(","),
        username: process.env.TURN_USERNAME || "",
        credential: process.env.TURN_CREDENTIAL || "",
      });
    }
    return json(res, 200, { iceServers });
  }
  if (url.pathname === "/api/me/delete") {
    if (req.method !== "POST") return json(res, 405, { error: "POST" });
    if (!isAllowedOrigin(req.headers.origin, req)) {
      return json(res, 403, { error: "origin" });
    }
    const id = req.headers["x-player-id"] || "";
    if (!VALID_ID.test(id)) return json(res, 400, { error: "id" });
    const key = db.profileKey(id);
    for (let i = recentResults.length - 1; i >= 0; i--) {
      if (recentResults[i].key === key) recentResults.splice(i, 1);
    }
    Object.keys(leaderboardCache).forEach((k) => delete leaderboardCache[k]);
    push.unregisterEverywhere(id);
    if (db.enabled()) await db.deleteProfile(id);
    return json(res, 200, { ok: true });
  }
  if (url.pathname === "/api/me") {
    const id = req.headers["x-player-id"] || "";
    if (!VALID_ID.test(id)) return json(res, 400, { error: "id" });
    if (!db.enabled()) return json(res, 200, { enabled: false });
    const profile = await db.getProfile(id);
    return json(res, 200, { enabled: true, profile });
  }
  if (url.pathname === "/api/leaderboard") {
    const period = ["week", "month", "all"].includes(
      url.searchParams.get("period"),
    )
      ? url.searchParams.get("period")
      : "all";
    const result = await board(period);
    return json(res, 200, { enabled: db.enabled(), period, ...result });
  }
  if (url.pathname.startsWith("/api/room/")) {
    const code = url.pathname.split("/").pop().toUpperCase();
    const found = await findRoom(code);
    return json(res, found ? 200 : 404, {
      exists: !!found,
      locked: !!(found && found.room.password),
    });
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    return res.end();
  }
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch (e) {
    res.statusCode = 400;
    return res.end();
  }
  let file = path.resolve(STATIC_DIR, "." + pathname);
  const relative = path.relative(STATIC_DIR, file);
  if (
    relative === ".." ||
    relative.startsWith(".." + path.sep) ||
    path.isAbsolute(relative)
  ) {
    res.statusCode = 403;
    return res.end();
  }
  fs.stat(file, (err, stat) => {
    if (!err && stat.isDirectory()) file = path.join(file, "index.html");
    fs.stat(file, (err2, stat2) => {
      if (!err2 && stat2.isFile()) return sendFile(res, file, req);
      const index = path.join(STATIC_DIR, "index.html");
      if (fs.existsSync(index)) return sendFile(res, index, req);
      res.statusCode = 404;
      res.end("not found - did you run `npm run build`?");
    });
  });
});

server.listen(PORT, () => {
  console.log(`Vampir Köylü server on http://0.0.0.0:${PORT}`);
});

async function shutdown() {
  // save every room before going away, then ask clients to reconnect
  await Promise.race([
    Promise.all([...rooms.values()].map((entry) => entry.room.flush())),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ]);
  wss.clients.forEach((ws) => ws.close(1012, "Sunucu yeniden başlıyor"));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// cPanel: pull new versions from GitHub by itself, restart between games
updater.start({
  restart() {
    const since = Date.now();
    const tryNow = () => {
      const playing = [...rooms.values()].some(
        (e) => !["lobby", "over"].includes(e.room.phase),
      );
      if (!playing || Date.now() - since > 20 * 60 * 1000) shutdown();
      else setTimeout(tryNow, 30000);
    };
    tryNow();
  },
});

// The host stops idle Node apps, which makes the first visit slow. Stay
// awake during typical playing hours (Istanbul time).
const SELF_URL = process.env.PUBLIC_URL;
const AWAKE_FROM = parseInt(process.env.AWAKE_FROM || "10", 10);
const AWAKE_TO = parseInt(process.env.AWAKE_TO || "2", 10);
if (SELF_URL && process.env.KEEP_AWAKE !== "false") {
  setInterval(
    () => {
      const hour = (new Date().getUTCHours() + 3) % 24;
      const awake =
        AWAKE_FROM <= AWAKE_TO
          ? hour >= AWAKE_FROM && hour < AWAKE_TO
          : hour >= AWAKE_FROM || hour < AWAKE_TO;
      if (awake || rooms.size) {
        fetch(SELF_URL + "/healthz").catch(() => {});
      }
    },
    10 * 60 * 1000,
  ).unref();
}
