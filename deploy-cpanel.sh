#!/bin/sh
# Builds the game and puts a ready-to-run copy on the "cpanel" branch:
# compiled site (dist), the server and only the packages the server needs.
# cPanel's Git Version Control pulls this branch; Setup Node.js App runs app.js.
set -e
npm run build
rm -rf /tmp/cpanel-out && mkdir -p /tmp/cpanel-out
cp -r dist server scripts /tmp/cpanel-out/
node -e '
const p = require("./package.json");
const keep = ["ws", "web-push", "mysql2"];
const deps = {};
keep.forEach((k) => (deps[k] = p.dependencies[k]));
require("fs").writeFileSync("/tmp/cpanel-out/package.json", JSON.stringify({
  name: "vampir-koylu", version: p.version, private: true,
  main: "app.js", engines: { node: ">=18" },
  scripts: { start: "node app.js", restart: "node scripts/restart.js" }, dependencies: deps,
}, null, 2) + "\n");'
cat > /tmp/cpanel-out/app.js <<'JS'
// cPanel "Setup Node.js App" startup file
require("./server/index.js");
JS
cp CPANEL.md /tmp/cpanel-out/README.md
cat > /tmp/cpanel-out/.htaccess.example <<'TXT'
# Setup Node.js App writes the real .htaccess in public_html; nothing needed here.
TXT
REPO=$(pwd)
rm -rf /tmp/cpanel-wt
git worktree add -f /tmp/cpanel-wt cpanel 2>/dev/null || git worktree add -f --orphan -b cpanel /tmp/cpanel-wt
cd /tmp/cpanel-wt
git rm -rq --ignore-unmatch . >/dev/null 2>&1 || true
cp -r /tmp/cpanel-out/. .
git add -A
git commit -qm "cPanel build $(cd "$REPO" && git rev-parse --short HEAD)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0167oXY6ZwbEeBCvj8jYoKrE" || echo "no changes"
cd "$REPO"
git push -q fork cpanel
git worktree remove --force /tmp/cpanel-wt
echo "cpanel branch updated"
