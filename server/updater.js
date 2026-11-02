/*
 * Self-updating on cPanel: the app folder is a git clone of the "cpanel"
 * branch. Every few minutes the server asks GitHub whether the branch moved;
 * if so it pulls, installs packages when package.json changed, saves all
 * rooms and exits. LiteSpeed/Passenger starts the new version on the next
 * request and players reconnect into their rooms (rooms live in MySQL).
 *
 * Enabled with AUTO_UPDATE=1 (or automatically when the app folder is a git
 * clone and DB_NAME is set). Status is shown in /healthz under "updater".
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const ROOT = path.join(__dirname, "..");
const BRANCH = process.env.UPDATE_BRANCH || "cpanel";
const EVERY = parseInt(process.env.UPDATE_EVERY || "120", 10) * 1000;
const GITS = ["git", "/usr/bin/git", "/usr/local/cpanel/3rdparty/bin/git"];

const status = {
  enabled: false,
  running: null, // the version this process started with
  git: null,
  head: null,
  remote: null,
  checkedAt: null,
  updatedAt: null,
  pending: false,
  lastError: null,
};

function run(cmd, args, timeout = 120000) {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { cwd: ROOT, timeout, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          err.message += " " + String(stderr || "").slice(0, 300);
          reject(err);
        } else resolve(String(stdout).trim());
      },
    );
  });
}

async function findGit() {
  for (const g of GITS) {
    try {
      await run(g, ["--version"], 10000);
      return g;
    } catch (e) {
      // try the next one
    }
  }
  return null;
}

function npmPath() {
  // the Node.js selector's virtual environment keeps npm next to node
  const local = path.join(path.dirname(process.execPath), "npm");
  return fs.existsSync(local) ? local : "npm";
}

let busy = false;
async function check(opts) {
  if (busy) return;
  busy = true;
  try {
    const git = status.git;
    status.head = await run(git, ["rev-parse", "HEAD"]);
    const line = await run(git, [
      "ls-remote",
      "origin",
      "refs/heads/" + BRANCH,
    ]);
    status.remote = (line.split(/\s+/)[0] || "").trim() || null;
    status.checkedAt = new Date().toISOString();
    if (!status.remote) return;
    // the files may already be new (pulled by an earlier copy) while this
    // process still runs the old code: then only a restart is needed
    if (status.remote === status.head) {
      if (status.running && status.running !== status.head) {
        status.pending = true;
        opts.restart();
      }
      return;
    }
    const before = await run(git, ["rev-parse", "HEAD:package.json"]).catch(
      () => "",
    );
    await run(git, ["fetch", "--depth", "1", "origin", BRANCH]);
    await run(git, ["reset", "--hard", "FETCH_HEAD"]);
    const after = await run(git, ["rev-parse", "HEAD:package.json"]).catch(
      () => "",
    );
    if (before !== after) {
      await run(
        npmPath(),
        ["install", "--omit=dev", "--no-audit", "--no-fund"],
        600000,
      );
    }
    status.head = await run(git, ["rev-parse", "HEAD"]);
    status.updatedAt = new Date().toISOString();
    status.pending = true;
    console.log("updater: new version", status.head, "- restarting");
    opts.restart();
  } catch (e) {
    status.lastError = {
      at: new Date().toISOString(),
      message: String(e.message || e).slice(0, 400),
    };
    console.log("updater error", status.lastError.message);
  } finally {
    busy = false;
  }
}

/** @param opts {restart(): void} */
async function start(opts) {
  const wanted =
    process.env.AUTO_UPDATE === "1" ||
    (process.env.AUTO_UPDATE !== "0" &&
      !!process.env.DB_NAME &&
      fs.existsSync(path.join(ROOT, ".git")));
  if (!wanted) return;
  status.git = await findGit();
  if (!status.git) {
    status.lastError = {
      at: new Date().toISOString(),
      message: "git not found",
    };
    return;
  }
  status.enabled = true;
  status.running = await run(status.git, ["rev-parse", "HEAD"]).catch(
    () => null,
  );
  setTimeout(() => check(opts), 15000).unref();
  setInterval(() => check(opts), EVERY).unref();
}

module.exports = { start, status: () => ({ ...status }), checkNow: check };
