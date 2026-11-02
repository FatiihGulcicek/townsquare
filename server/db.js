/*
 * Optional database (Supabase): keeps rooms alive across restarts and stores
 * profiles and statistics. Everything goes through RPC functions that check
 * a server secret (VK_DB_SECRET); without it the game simply runs in memory.
 */
const crypto = require("crypto");

const URL_BASE =
  process.env.SUPABASE_URL || "https://bwkoitiyryfbgdgtolqk.supabase.co";
// publishable key: safe to ship, all access is checked by the secret
const KEY =
  process.env.SUPABASE_KEY || "sb_publishable_crp1XgMT_VbIaOcYKw1m_g_F_MujN-V";
const SECRET = process.env.VK_DB_SECRET || "";

const stats = { calls: 0, errors: 0, lastError: null };

async function rpc(name, args, timeout = 8000) {
  if (!SECRET) return null;
  stats.calls++;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${URL_BASE}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ secret: SECRET, ...args }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        response.status + " " + (await response.text()).slice(0, 200),
      );
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch (e) {
    stats.errors++;
    stats.lastError = {
      at: new Date().toISOString(),
      message: String(e.message || e),
    };
    console.log("db error", name, stats.lastError.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** profile key: hash of the private player id (never stored in clear) */
const profileKey = (playerId) =>
  crypto
    .createHash("sha256")
    .update("vk-profile:" + playerId)
    .digest("hex");

module.exports = {
  enabled: () => !!SECRET,
  stats: () => ({ enabled: !!SECRET, ...stats }),
  profileKey,
  saveRoom: (code, data) =>
    rpc("vampir_save_room", { room_code: code, room_data: data }),
  closeRoom: (code) =>
    rpc("vampir_save_room", { room_code: code, room_data: { closed: true } }),
  loadRoom: (code) => rpc("vampir_load_room", { room_code: code }),
  touchProfile: (playerId, name) =>
    rpc("vampir_touch_profile", {
      profile_key: profileKey(playerId),
      profile_name: name,
    }),
  recordGame: (game) => rpc("vampir_record_game", { game }),
  getProfile: (playerId) =>
    rpc("vampir_get_profile", { profile_key: profileKey(playerId) }),
  leaderboard: () => rpc("vampir_leaderboard", {}),
};
