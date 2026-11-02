const fs = require("fs");
const path = require("path");
const http = require("http");
const zlib = require("zlib");
const https = require("https");
const WebSocket = require("ws");
const client = require("prom-client");
const push = require("./push");
const { AutoGame } = require("./bot");

// Create a Registry which registers the metrics
const register = new client.Registry();
// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: "clocktower-online",
});

const PING_INTERVAL = 30000; // 30 seconds
const PORT = parseInt(process.env.PORT || "8080", 10);
const STATIC_DIR = path.resolve(
  process.env.STATIC_DIR || path.join(__dirname, "..", "dist"),
);
// comma separated list of extra allowed origins (regex fragments allowed)
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
// optional protection for the /metrics endpoint
const METRICS_TOKEN = process.env.METRICS_TOKEN || "";
// message contents (which include secret role assignments) are only logged when explicitly enabled
const LOG_MESSAGES = process.env.LOG_MESSAGES === "true";
// maximum size of a single message (custom scripts with homebrew roles can be large)
const MAX_PAYLOAD = parseInt(
  process.env.MAX_PAYLOAD || String(1024 * 1024),
  10,
);
// maximum number of connections per channel (20 players + travelers + spectators)
const MAX_PER_CHANNEL = parseInt(process.env.MAX_PER_CHANNEL || "40", 10);
const VALID_ID = /^[a-z0-9_\-.~%]{1,64}$/i;

function logMessage(ws, data) {
  if (!LOG_MESSAGES) return;
  // eslint-disable-next-line no-use-before-define
  console.log(new Date(), wss.clients.size, ws.channel, ws.playerId, data);
}

// TLS is optional: use it only if cert files are provided.
// Behind a reverse proxy / PaaS (Render, Fly, Railway, Caddy, nginx) plain HTTP is fine.
const CERT = process.env.TLS_CERT || "cert.pem";
const KEY = process.env.TLS_KEY || "key.pem";
const useTls = fs.existsSync(CERT) && fs.existsSync(KEY);
const server = useTls
  ? https.createServer({
      cert: fs.readFileSync(CERT),
      key: fs.readFileSync(KEY),
    })
  : http.createServer();

// hostnames this server is reachable under (Render sets RENDER_EXTERNAL_HOSTNAME)
const OWN_HOSTS = [
  process.env.RENDER_EXTERNAL_HOSTNAME,
  process.env.PUBLIC_HOSTNAME,
]
  .filter(Boolean)
  .map((h) => h.toLowerCase());
const hostname = (h) =>
  (h || "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");

// connection diagnostics, shown on /healthz
const diagnostics = { accepted: 0, rejected: 0, lastRejected: null };

function isAllowedOrigin(origin, req) {
  if (!origin) return false;
  let originHost;
  try {
    originHost = new URL(origin).hostname.toLowerCase();
  } catch (e) {
    return false;
  }
  const headers = (req && req.headers) || {};
  // same host as the server (ignoring ports and proxies) -> always allowed
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

const wss = new WebSocket.Server({
  server,
  maxPayload: MAX_PAYLOAD,
  verifyClient: (info) => {
    const ok = isAllowedOrigin(info.origin, info.req);
    if (ok) {
      diagnostics.accepted++;
    } else {
      diagnostics.rejected++;
      diagnostics.lastRejected = {
        origin: info.origin || null,
        host: info.req.headers.host || null,
        forwardedHost: info.req.headers["x-forwarded-host"] || null,
        at: new Date().toISOString(),
      };
      console.log(
        "rejected websocket",
        JSON.stringify(diagnostics.lastRejected),
      );
    }
    return ok;
  },
});

function noop() {}

// calculate latency on heartbeat
function heartbeat() {
  this.latency = Math.round((new Date().getTime() - this.pingStart) / 2);
  this.counter = 0;
  this.isAlive = true;
}

// map of channels currently in use
const channels = {};
// names of the seated players per channel (from the host's last gamestate)
const channelNames = {};
// channels run by the automatic storyteller
const bots = {};
const MAX_BOTS = parseInt(process.env.MAX_BOTS || "30", 10);

// deliver a message to a client; the bot gets to know who sent it
function deliver(client, data, from) {
  if (client.isBot) client.receive(data, from);
  else client.send(data);
}

function createBot() {
  if (Object.keys(bots).length >= MAX_BOTS) return null;
  let channel;
  do {
    channel = "oto" + Math.random().toString(36).slice(2, 7);
  } while (channels[channel] || bots[channel]);
  const open = (c) => !c.isBot && c.readyState === WebSocket.OPEN;
  const list = () => channels[channel] || [];
  const fake = {
    isBot: true,
    playerId: "host",
    channel,
    readyState: WebSocket.OPEN,
    visible: true,
    latency: 0,
    receive: (data, from) => game.receive(data, from),
    send() {},
  };
  const game = new AutoGame(channel, {
    broadcast: (data) =>
      list().forEach((c) => {
        if (open(c)) {
          c.send(data);
          metrics.messages_outgoing.inc();
        }
      }),
    sendTo: (id, data) =>
      list().forEach((c) => {
        if (open(c) && c.playerId === id) {
          c.send(data);
          metrics.messages_outgoing.inc();
        }
      }),
    isConnected: (id) => list().some((c) => open(c) && c.playerId === id),
    connectedIds: () => [
      ...new Set(
        list()
          .filter(open)
          .map((c) => c.playerId),
      ),
    ],
    push: (ids, payload) => pushToChannel(channel, payload, ids),
    destroy: () => {
      fake.readyState = WebSocket.CLOSED;
      if (channels[channel]) {
        channels[channel] = channels[channel].filter((c) => c !== fake);
      }
      delete bots[channel];
    },
  });
  channels[channel] = [fake];
  bots[channel] = game;
  return channel;
}

// a player is "away" when no visible app of theirs is connected
function isAway(channel, playerId) {
  return !(channels[channel] || []).some(
    (c) =>
      c.playerId === playerId &&
      c.readyState === WebSocket.OPEN &&
      c.visible !== false,
  );
}

/**
 * Push a notification to the players of a channel whose app is closed or in
 * the background. `only` limits it to some player ids.
 */
function pushToChannel(channel, payload, only) {
  if (!push.enabled()) return;
  push.subscribedPlayers(channel).forEach((playerId) => {
    if (playerId === "host") return;
    if (only && !only.includes(playerId)) return;
    if (!isAway(channel, playerId)) return;
    push.send(channel, playerId, { url: "/#" + channel, ...payload });
  });
}

// turn host messages into push notifications for absent players
function pushHooks(ws, data) {
  if (ws.playerId !== "host" || !push.enabled()) return;
  let command, params;
  try {
    [command, params] = JSON.parse(data);
  } catch (e) {
    return;
  }
  const channel = ws.channel;
  switch (command) {
    case "gs":
      if (params && Array.isArray(params.gamestate)) {
        channelNames[channel] = params.gamestate.map((p) =>
          String((p && p.name) || "").slice(0, 40),
        );
      }
      break;
    case "direct": {
      const roleFor = Object.keys(params || {}).filter(
        (id) =>
          Array.isArray(params[id]) &&
          params[id][0] === "player" &&
          params[id][1] &&
          params[id][1].property === "role" &&
          params[id][1].value,
      );
      if (roleFor.length) {
        pushToChannel(
          channel,
          {
            title: "Karakterin geldi 🎭",
            body: "Kim olduğunu görmek için dokun.",
            tag: "role",
          },
          roleFor,
        );
      }
      break;
    }
    case "isNight":
      pushToChannel(
        channel,
        params
          ? {
              title: "Gece çöktü 🌙",
              body: "Kasaba uyuyor. Anlatıcı seni uyandırabilir.",
              tag: "phase",
            }
          : {
              title: "Gün doğdu ☀️",
              body: "Kasaba uyandı, tartışma başlıyor.",
              tag: "phase",
            },
      );
      break;
    case "nomination": {
      if (!Array.isArray(params) || params.length < 2) break;
      const names = channelNames[channel] || [];
      const nominator = names[params[0]];
      const nominee = names[params[1]];
      pushToChannel(channel, {
        title: "Aday gösterildi ⚖️",
        body:
          nominator && nominee
            ? nominator + ", " + nominee + " adlı oyuncuyu aday gösterdi."
            : "Oylama birazdan başlıyor.",
        tag: "vote",
      });
      break;
    }
    case "isVoteInProgress":
      if (params) {
        pushToChannel(channel, {
          title: "Oylama başladı ✋",
          body: "Elini kaldırmak için şimdi uygulamaya dön.",
          tag: "vote",
        });
      }
      break;
  }
}

// metrics
const metrics = {
  players_concurrent: new client.Gauge({
    name: "players_concurrent",
    help: "Concurrent Players",
    collect() {
      this.set(wss.clients.size);
    },
  }),
  channels_concurrent: new client.Gauge({
    name: "channels_concurrent",
    help: "Concurrent Channels",
    collect() {
      this.set(Object.keys(channels).length);
    },
  }),
  channels_list: new client.Gauge({
    name: "channel_players",
    help: "Players in each channel",
    labelNames: ["name"],
    collect() {
      for (let channel in channels) {
        this.set(
          { name: channel },
          channels[channel].filter(
            (ws) =>
              ws &&
              (ws.readyState === WebSocket.OPEN ||
                ws.readyState === WebSocket.CONNECTING),
          ).length,
        );
      }
    },
  }),
  messages_incoming: new client.Counter({
    name: "messages_incoming",
    help: "Incoming messages",
  }),
  messages_outgoing: new client.Counter({
    name: "messages_outgoing",
    help: "Outgoing messages",
  }),
  connection_terminated_host: new client.Counter({
    name: "connection_terminated_host",
    help: "Terminated connection due to host already present",
  }),
  connection_terminated_spam: new client.Counter({
    name: "connection_terminated_spam",
    help: "Terminated connection due to message spam",
  }),
  connection_terminated_timeout: new client.Counter({
    name: "connection_terminated_timeout",
    help: "Terminated connection due to timeout",
  }),
};

// register metrics
for (let metric in metrics) {
  register.registerMetric(metrics[metric]);
}

// a new client connects
wss.on("connection", function connection(ws, req) {
  // url pattern: clocktower.online/<channel>/<playerId|host>
  const url = req.url.toLocaleLowerCase().split("/");
  ws.playerId = url.pop();
  ws.channel = url.pop();
  if (!VALID_ID.test(ws.playerId || "") || !VALID_ID.test(ws.channel || "")) {
    ws.close(1000, "Invalid channel name");
    return;
  }
  // rooms of the automatic storyteller end when the server restarts
  if (/^oto[a-z0-9]{5}$/.test(ws.channel) && !bots[ws.channel]) {
    ws.close(1000, "This automatic room has ended");
    return;
  }
  const open = (channels[ws.channel] || []).filter(
    (c) => c.readyState === WebSocket.OPEN,
  ).length;
  if (open >= MAX_PER_CHANNEL) {
    ws.close(1000, "This channel is full");
    return;
  }
  // check for another host on this channel
  if (
    ws.playerId === "host" &&
    channels[ws.channel] &&
    channels[ws.channel].some(
      (client) =>
        client !== ws &&
        client.readyState === WebSocket.OPEN &&
        client.playerId === "host",
    )
  ) {
    console.log(ws.channel, "duplicate host");
    ws.close(1000, "This channel already has a host");
    metrics.connection_terminated_host.inc();
    return;
  }
  ws.isAlive = true;
  ws.pingStart = new Date().getTime();
  ws.counter = 0;
  // add channel to list
  if (!channels[ws.channel]) {
    channels[ws.channel] = [];
  }
  channels[ws.channel].push(ws);
  ws.on("close", () => {
    const list = channels[ws.channel];
    if (list) channels[ws.channel] = list.filter((c) => c !== ws);
  });
  ws.on("error", (err) => console.log(ws.channel, "socket error", err.message));
  // start ping pong
  ws.ping(noop);
  ws.on("pong", heartbeat);
  // handle message
  ws.on("message", function incoming(raw, isBinary) {
    if (isBinary) return;
    const data = raw.toString();
    metrics.messages_incoming.inc();
    // check rate limit (max 5msg/second)
    ws.counter++;
    if (ws.counter > (5 * PING_INTERVAL) / 1000) {
      console.log(ws.channel, "disconnecting user due to spam");
      ws.close(
        1000,
        "Your app seems to be malfunctioning, please clear your browser cache.",
      );
      metrics.connection_terminated_spam.inc();
      return;
    }
    const messageType = data.toLowerCase().slice(1).split(",", 1).pop();
    switch (messageType) {
      case '"push"':
        // register a push subscription for this player (never relayed)
        try {
          const sub = JSON.parse(data)[1];
          if (sub) push.register(ws.channel, ws.playerId, sub);
          else push.unregister(ws.channel, ws.playerId);
        } catch (e) {
          // ignore malformed subscriptions
        }
        break;
      case '"visible"':
        // the app went to the background / came back (never relayed)
        try {
          ws.visible = JSON.parse(data)[1] !== false;
        } catch (e) {
          // ignore
        }
        break;
      case '"ping"':
        // ping messages will only be sent host -> all or all -> host
        channels[ws.channel].forEach(function each(client) {
          if (
            client !== ws &&
            !client.isBot &&
            client.readyState === WebSocket.OPEN &&
            (ws.playerId === "host" || client.playerId === "host")
          ) {
            client.send(
              data.replace(
                /latency/,
                (client.latency || 0) + (ws.latency || 0),
              ),
            );
            metrics.messages_outgoing.inc();
          }
        });
        break;
      case '"direct"':
        // handle "direct" messages differently
        logMessage(ws, data);
        try {
          const dataToPlayer = JSON.parse(data)[1];
          const isBotChannel = !!bots[ws.channel];
          channels[ws.channel].forEach(function each(client) {
            if (
              client !== ws &&
              client.readyState === WebSocket.OPEN &&
              dataToPlayer[client.playerId] &&
              // with the automatic storyteller players only talk to it
              (!isBotChannel || client.isBot)
            ) {
              deliver(
                client,
                JSON.stringify(dataToPlayer[client.playerId]),
                ws,
              );
              metrics.messages_outgoing.inc();
            }
          });
          pushHooks(ws, data);
        } catch (e) {
          console.log("error parsing direct message JSON", e);
        }
        break;
      default: {
        // all other messages
        logMessage(ws, data);
        // with the automatic storyteller only votes are shared between players,
        // everything else goes to the storyteller alone (no spoofed game states)
        const botOnly = !!bots[ws.channel] && messageType !== '"vote"';
        channels[ws.channel].forEach(function each(client) {
          if (
            client !== ws &&
            client.readyState === WebSocket.OPEN &&
            (!botOnly || client.isBot)
          ) {
            deliver(client, data, ws);
            metrics.messages_outgoing.inc();
          }
        });
        pushHooks(ws, data);
        break;
      }
    }
  });
});

// start ping interval timer
const interval = setInterval(function ping() {
  // ping each client
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) {
      metrics.connection_terminated_timeout.inc();
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.pingStart = new Date().getTime();
    ws.ping(noop);
  });
  // clean up empty channels
  for (let channel in channels) {
    if (
      !channels[channel].length ||
      !channels[channel].some(
        (ws) =>
          ws &&
          (ws.readyState === WebSocket.OPEN ||
            ws.readyState === WebSocket.CONNECTING),
      )
    ) {
      metrics.channels_list.remove({ name: channel });
      delete channels[channel];
      delete channelNames[channel];
    }
  }
}, PING_INTERVAL);

// handle server shutdown
wss.on("close", function close() {
  clearInterval(interval);
});

// ---- HTTP: static site + metrics + health ----
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

// text assets are compressed once and kept in memory
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
  // hashed assets can be cached forever, index.html never
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

server.on("request", (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/healthz") {
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        ok: true,
        players: wss.clients.size,
        channels: Object.keys(channels).length,
        connections: diagnostics,
        push: push.stats(),
        autoGames: Object.keys(bots).length,
      }),
    );
  }
  if (url.pathname === "/auto/new") {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") {
      res.statusCode = 405;
      return res.end(JSON.stringify({ error: "POST only" }));
    }
    if (!isAllowedOrigin(req.headers.origin, req)) {
      res.statusCode = 403;
      return res.end(JSON.stringify({ error: "origin" }));
    }
    const channel = createBot();
    if (!channel) {
      res.statusCode = 503;
      return res.end(JSON.stringify({ error: "busy" }));
    }
    return res.end(JSON.stringify({ channel }));
  }
  if (url.pathname === "/push/key") {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-cache");
    return res.end(
      JSON.stringify({ enabled: push.enabled(), key: push.publicKey() }),
    );
  }
  if (url.pathname === "/metrics") {
    if (METRICS_TOKEN && url.searchParams.get("token") !== METRICS_TOKEN) {
      res.statusCode = 401;
      return res.end("unauthorized");
    }
    res.setHeader("Content-Type", register.contentType);
    return register.metrics().then((out) => res.end(out));
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    return res.end();
  }
  // static files with SPA fallback
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
  console.log(
    `townsquare server listening on ${
      useTls ? "https" : "http"
    }://0.0.0.0:${PORT} (static: ${STATIC_DIR})`,
  );
});

function shutdown() {
  console.log("shutting down");
  wss.clients.forEach((ws) => ws.close(1001, "Server restarting"));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
