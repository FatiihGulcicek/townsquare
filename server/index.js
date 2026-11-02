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

const OWN_HOSTS = [
  process.env.RENDER_EXTERNAL_HOSTNAME,
  process.env.PUBLIC_HOSTNAME,
]
  .filter(Boolean)
  .map((h) => h.toLowerCase());
const hostname = (h) =>
  (h || "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");

function isAllowedOrigin(origin, req) {
  if (!origin) return false;
  let originHost;
  try {
    originHost = new URL(origin).hostname.toLowerCase();
  } catch (e) {
    return false;
  }
  const headers = (req && req.headers) || {};
  const candidates = [
    hostname(headers.host),
    hostname(headers["x-forwarded-host"]),
    ...OWN_HOSTS,
  ].filter(Boolean);
  if (candidates.includes(originHost)) return true;
  if (/^(localhost|127\.0\.0\.1)$/i.test(originHost)) return true;
  return EXTRA_ORIGINS.some((o) =>
    new RegExp("^https?://" + o.replace(/^https?:\/\//, "") + "$", "i").test(
      origin,
    ),
  );
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

function createRoom(mode, creatorId, wanted) {
  if (rooms.size >= MAX_ROOMS) return null;
  const code = wanted || newCode();
  if (!code) return null;
  const entry = { sockets: new Set(), room: null };
  entry.room = new Room(code, mode, creatorId, roomIo(code, entry));
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

// ---------- websocket ----------

const server = http.createServer();
const diagnostics = { accepted: 0, rejected: 0 };
const wss = new WebSocket.Server({
  server,
  maxPayload: 16 * 1024,
  verifyClient: (info) => {
    const ok = isAllowedOrigin(info.origin, info.req);
    if (ok) diagnostics.accepted++;
    else diagnostics.rejected++;
    return ok;
  },
});

wss.on("connection", (ws, req) => {
  const parts = req.url.split("?")[0].split("/").filter(Boolean);
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
  ws.isAlive = true;
  ws.counter = 0;
  ws.on("pong", () => {
    ws.isAlive = true;
    ws.counter = 0;
  });
  ws.on("error", () => {});
  // messages that arrive while the room is being loaded wait here
  const queue = [];
  let entry = null;
  const handle = (raw) => {
    if (++ws.counter > 150) return ws.close(1000, "Çok fazla mesaj");
    let command, params;
    try {
      [command, params] = JSON.parse(raw.toString());
    } catch (e) {
      return;
    }
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
  ".webmanifest": "application/manifest+json",
};
const COMPRESSIBLE = new Set([
  ".html",
  ".js",
  ".css",
  ".json",
  ".svg",
  ".txt",
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

let leaderboardCache = null;

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
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/healthz") {
    return json(res, 200, {
      ok: true,
      rooms: rooms.size,
      players: wss.clients.size,
      connections: diagnostics,
      push: push.stats(),
      db: db.stats(),
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
    const code = createRoom(body.mode, body.playerId, wanted);
    if (!code) return json(res, 503, { error: "busy" });
    return json(res, 200, { code });
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
    if (process.env.TURN_URL) {
      iceServers.push({
        urls: process.env.TURN_URL.split(","),
        username: process.env.TURN_USERNAME || "",
        credential: process.env.TURN_CREDENTIAL || "",
      });
    }
    return json(res, 200, { iceServers });
  }
  if (url.pathname === "/api/me") {
    const id = req.headers["x-player-id"] || "";
    if (!VALID_ID.test(id)) return json(res, 400, { error: "id" });
    if (!db.enabled()) return json(res, 200, { enabled: false });
    const profile = await db.getProfile(id);
    return json(res, 200, { enabled: true, profile });
  }
  if (url.pathname === "/api/leaderboard") {
    if (!db.enabled()) return json(res, 200, { enabled: false, list: [] });
    const now = Date.now();
    if (!leaderboardCache || now - leaderboardCache.at > 60000) {
      leaderboardCache = { at: now, list: (await db.leaderboard()) || [] };
    }
    return json(res, 200, { enabled: true, list: leaderboardCache.list });
  }
  if (url.pathname.startsWith("/api/room/")) {
    const code = url.pathname.split("/").pop().toUpperCase();
    const found = await findRoom(code);
    return json(res, found ? 200 : 404, { exists: !!found });
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    return res.end();
  }
  let file = path.normalize(
    path.join(STATIC_DIR, decodeURIComponent(url.pathname)),
  );
  if (!file.startsWith(STATIC_DIR)) {
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

// Render's free plan sleeps after 15 idle minutes, which makes the first
// visit slow. Stay awake during typical playing hours (Istanbul time).
const SELF_URL = process.env.RENDER_EXTERNAL_URL;
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
