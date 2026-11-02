// "Run JS script → restart" in cPanel: stops the running copy of the game
// so LiteSpeed starts a fresh one (with new settings) on the next visit.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
let count = 0;
for (const pid of fs.readdirSync("/proc").filter((d) => /^\d+$/.test(d))) {
  if (Number(pid) === process.pid || Number(pid) === process.ppid) continue;
  let cmd = "";
  try {
    cmd = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ");
  } catch (e) {
    continue;
  }
  let cwd = "";
  try {
    cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
  } catch (e) {
    // ignore
  }
  const ours = cmd.includes(root) || (cwd === root && /node|lsnode/.test(cmd));
  if (ours && !cmd.includes("restart.js") && !/npm/.test(cmd)) {
    try {
      process.kill(Number(pid), "SIGTERM");
      count++;
      console.log("stopped", pid, cmd.slice(0, 120));
    } catch (e) {
      console.log("could not stop", pid, e.message);
    }
  }
}
console.log(count ? `restarting (${count} process)` : "no running copy found");
