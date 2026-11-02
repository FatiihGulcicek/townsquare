# Vampir Köylü — notes for working on this repo

- Live site: **https://darkspire.co** (cPanel, LiteSpeed, Node.js selector, MariaDB
  `darkspire_vampir`). Render is no longer used.
- Work on `develop`. To publish: commit, `git push fork develop`, then run
  `./deploy-cpanel.sh`. It builds and pushes the `cpanel` branch; the server
  pulls it by itself within ~2 minutes and restarts once no game is running.
- Verify: `https://darkspire.co/healthz` → `updater.head` equals the new
  `cpanel` commit, `started` changed, `db.ready: true`.
- If package.json dependencies change, the updater runs npm install itself.
- New environment variables (cPanel → Setup Node.js App) only apply after the
  running copy stops: cPanel → Setup Node.js App → Run JS script → `restart`.
- Database: `server/db-mysql.js` (tables `vk_*`, created on start).
- UI language: Turkish source text, English via `src/i18n/en*.js`; add new
  strings there.
