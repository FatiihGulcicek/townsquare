/*
 * Storage in MySQL / MariaDB (cPanel, visible in phpMyAdmin): rooms,
 * profiles, finished games and leaderboards. Tables are created on the
 * first start. Enabled when DB_NAME and DB_USER are set.
 */
"use strict";
const crypto = require("crypto");

let mysql = null;
try {
  mysql = require("mysql2/promise");
} catch (e) {
  mysql = null;
}

const CONFIG = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "3306", 10),
  user: process.env.DB_USER || "",
  password: process.env.DB_PASS || process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "",
  charset: "utf8mb4",
  connectionLimit: 4,
  waitForConnections: true,
  enableKeepAlive: true,
  timezone: "Z",
};
const ENABLED = !!(mysql && CONFIG.user && CONFIG.database);

const stats = { calls: 0, errors: 0, lastError: null, ready: false };
let pool = null;
let ready = null;

const TABLES = [
  `CREATE TABLE IF NOT EXISTS vk_rooms (
    code CHAR(4) NOT NULL PRIMARY KEY,
    data LONGTEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS vk_profiles (
    profile_key CHAR(64) NOT NULL PRIMARY KEY,
    name VARCHAR(64) NOT NULL DEFAULT '',
    games INT NOT NULL DEFAULT 0,
    wins INT NOT NULL DEFAULT 0,
    survived INT NOT NULL DEFAULT 0,
    role_stats LONGTEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS vk_games (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    room CHAR(4) NOT NULL,
    mode VARCHAR(10) NOT NULL,
    winner VARCHAR(20) NULL,
    rounds INT NOT NULL DEFAULT 0,
    player_count INT NOT NULL DEFAULT 0,
    players LONGTEXT NULL,
    started_at DATETIME NULL,
    ended_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY ended (ended_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS vk_game_players (
    game_id BIGINT NOT NULL,
    profile_key CHAR(64) NOT NULL,
    role VARCHAR(20) NOT NULL,
    won TINYINT(1) NOT NULL DEFAULT 0,
    alive TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (game_id, profile_key),
    KEY prof (profile_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

function fail(name, e) {
  stats.errors++;
  stats.lastError = {
    at: new Date().toISOString(),
    message: `${name}: ${String((e && e.message) || e).slice(0, 200)}`,
  };
  console.log("mysql error", stats.lastError.message);
  return null;
}

function init() {
  if (!ENABLED) return Promise.resolve(false);
  if (!ready) {
    pool = mysql.createPool(CONFIG);
    // store and compare times in UTC
    pool.pool.on("connection", (conn) =>
      conn.query("SET time_zone = '+00:00'"),
    );
    ready = (async () => {
      for (const sql of TABLES) await pool.query(sql);
      stats.ready = true;
      console.log("mysql ready:", CONFIG.database);
      return true;
    })().catch((e) => {
      fail("init", e);
      ready = null; // try again on the next call
      return false;
    });
  }
  return ready;
}

async function run(name, fn) {
  if (!ENABLED) return null;
  stats.calls++;
  try {
    if (!(await init())) return null;
    return await fn(pool);
  } catch (e) {
    return fail(name, e);
  }
}

const profileKey = (playerId) =>
  crypto
    .createHash("sha256")
    .update("vk-profile:" + playerId)
    .digest("hex");

const toDate = (ms) => new Date(ms);
const rate = (wins, games) => Math.round((100 * wins) / Math.max(games, 1));

module.exports = {
  kind: "mysql",
  enabled: () => ENABLED,
  init,
  stats: () => ({
    enabled: ENABLED,
    kind: "mysql",
    driver: !!mysql,
    database: CONFIG.database || null,
    ...stats,
  }),
  profileKey,

  saveRoom: (code, data) =>
    run("saveRoom", (db) =>
      db.query(
        "INSERT INTO vk_rooms (code, data) VALUES (?, ?) " +
          "ON DUPLICATE KEY UPDATE data = VALUES(data)",
        [code, JSON.stringify(data)],
      ),
    ),

  closeRoom: (code) =>
    run("closeRoom", (db) =>
      db.query("DELETE FROM vk_rooms WHERE code = ?", [code]),
    ),

  loadRoom: (code) =>
    run("loadRoom", async (db) => {
      const [rows] = await db.query(
        "SELECT data FROM vk_rooms WHERE code = ? " +
          "AND updated_at > NOW() - INTERVAL 1 DAY",
        [code],
      );
      if (!rows.length) return null;
      const data = JSON.parse(rows[0].data);
      return data && !data.closed ? data : null;
    }),

  touchProfile: (playerId, name) =>
    run("touchProfile", (db) =>
      db.query(
        "INSERT INTO vk_profiles (profile_key, name) VALUES (?, ?) " +
          "ON DUPLICATE KEY UPDATE name = VALUES(name), updated_at = NOW()",
        [profileKey(playerId), String(name || "").slice(0, 24)],
      ),
    ),

  recordGame: (game) =>
    run("recordGame", async (db) => {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        const [res] = await conn.query(
          "INSERT INTO vk_games (room, mode, winner, rounds, player_count, " +
            "players, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [
            game.room,
            game.mode,
            game.winner,
            game.rounds || 0,
            game.players.length,
            JSON.stringify(game.players),
            toDate(game.startedAt || Date.now()),
            new Date(),
          ],
        );
        const gid = res.insertId;
        for (const p of game.players) {
          const name = String(p.name || "").slice(0, 24);
          await conn.query(
            "INSERT INTO vk_profiles (profile_key, name) VALUES (?, ?) " +
              "ON DUPLICATE KEY UPDATE name = VALUES(name)",
            [p.key, name],
          );
          const [[row]] = await conn.query(
            "SELECT role_stats FROM vk_profiles WHERE profile_key = ? FOR UPDATE",
            [p.key],
          );
          let roles = {};
          try {
            roles = JSON.parse((row && row.role_stats) || "{}") || {};
          } catch (e) {
            roles = {};
          }
          const r = roles[p.role] || { games: 0, wins: 0 };
          roles[p.role] = {
            games: r.games + 1,
            wins: r.wins + (p.won ? 1 : 0),
          };
          await conn.query(
            "UPDATE vk_profiles SET games = games + 1, wins = wins + ?, " +
              "survived = survived + ?, role_stats = ?, updated_at = NOW() " +
              "WHERE profile_key = ?",
            [p.won ? 1 : 0, p.alive ? 1 : 0, JSON.stringify(roles), p.key],
          );
          await conn.query(
            "INSERT IGNORE INTO vk_game_players " +
              "(game_id, profile_key, role, won, alive) VALUES (?, ?, ?, ?, ?)",
            [gid, p.key, p.role, p.won ? 1 : 0, p.alive ? 1 : 0],
          );
        }
        await conn.commit();
        return gid;
      } catch (e) {
        await conn.rollback().catch(() => {});
        throw e;
      } finally {
        conn.release();
      }
    }),

  getProfile: (playerId) =>
    run("getProfile", async (db) => {
      const key = profileKey(playerId);
      const [[pr]] = await db.query(
        "SELECT * FROM vk_profiles WHERE profile_key = ?",
        [key],
      );
      if (!pr) return null;
      const [recent] = await db.query(
        "SELECT gp.role, gp.won, gp.alive, g.ended_at, g.player_count, g.winner " +
          "FROM vk_game_players gp JOIN vk_games g ON g.id = gp.game_id " +
          "WHERE gp.profile_key = ? ORDER BY gp.game_id DESC LIMIT 10",
        [key],
      );
      let roles = {};
      try {
        roles = JSON.parse(pr.role_stats || "{}") || {};
      } catch (e) {
        roles = {};
      }
      return {
        name: pr.name,
        games: pr.games,
        wins: pr.wins,
        survived: pr.survived,
        roles,
        since: pr.created_at,
        recent: recent.map((g) => ({
          role: g.role,
          won: !!g.won,
          alive: !!g.alive,
          at: g.ended_at,
          players: g.player_count,
          winner: g.winner,
        })),
      };
    }),

  /** "delete my data": profile, game rows and the name inside old games */
  deleteProfile: (playerId) =>
    run("deleteProfile", async (db) => {
      const key = profileKey(playerId);
      await db.query("DELETE FROM vk_game_players WHERE profile_key = ?", [
        key,
      ]);
      await db.query("DELETE FROM vk_profiles WHERE profile_key = ?", [key]);
      const [games] = await db.query(
        "SELECT id, players FROM vk_games WHERE players LIKE ?",
        ["%" + key + "%"],
      );
      for (const g of games) {
        let players = [];
        try {
          players = JSON.parse(g.players) || [];
        } catch (e) {
          players = [];
        }
        await db.query("UPDATE vk_games SET players = ? WHERE id = ?", [
          JSON.stringify(players.filter((p) => p.key !== key)),
          g.id,
        ]);
      }
      return true;
    }),

  leaderboard: () =>
    run("leaderboard", async (db) => {
      const [rows] = await db.query(
        "SELECT name, games, wins FROM vk_profiles WHERE games >= 3 " +
          "ORDER BY wins DESC, games ASC LIMIT 20",
      );
      return rows.map((r) => ({ ...r, rate: rate(r.wins, r.games) }));
    }),

  leaderboardSince: (since, until) =>
    run("leaderboardSince", async (db) => {
      const [rows] = await db.query(
        "SELECT pr.name, COUNT(*) AS games, SUM(gp.won) AS wins " +
          "FROM vk_game_players gp JOIN vk_games g ON g.id = gp.game_id " +
          "JOIN vk_profiles pr ON pr.profile_key = gp.profile_key " +
          "WHERE g.ended_at >= ? AND g.ended_at < ? " +
          "GROUP BY pr.profile_key, pr.name ORDER BY wins DESC, games ASC LIMIT 20",
        [toDate(since), toDate(until || Date.now() + 86400000)],
      );
      return rows.map((r) => ({
        name: r.name,
        games: Number(r.games),
        wins: Number(r.wins),
        rate: rate(Number(r.wins), Number(r.games)),
      }));
    }),
};
