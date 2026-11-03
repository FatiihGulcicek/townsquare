"use strict";
const crypto = require("crypto");
const db = require("./db");
const pair = (a, b) => a < b ? [a, b] : [b, a];

async function state(account) {
  return db.withDb("socialState", async (pool) => {
    const [links] = await pool.query(
      "SELECT l.status, l.requested_by, a.id, a.name, a.friend_code " +
      "FROM vk_friend_links l JOIN vk_accounts a ON a.id = IF(l.account_a = ?, l.account_b, l.account_a) " +
      "WHERE l.account_a = ? OR l.account_b = ? ORDER BY l.created_at DESC LIMIT 100",
      [account.id, account.id, account.id],
    );
    const [invites] = await pool.query(
      "SELECT c.id, c.name, c.tag, a.name AS inviter FROM vk_clan_invites i " +
      "JOIN vk_clans c ON c.id = i.clan_id JOIN vk_accounts a ON a.id = i.invited_by " +
      "WHERE i.account_id = ? ORDER BY i.created_at DESC LIMIT 20", [account.id],
    );
    const [[membership]] = await pool.query(
      "SELECT c.id, c.name, c.tag, c.owner_id FROM vk_clan_members m " +
      "JOIN vk_clans c ON c.id = m.clan_id WHERE m.account_id = ?", [account.id],
    );
    let members = [];
    if (membership) {
      const [rows] = await pool.query(
        "SELECT a.id, a.name, a.friend_code FROM vk_clan_members m " +
        "JOIN vk_accounts a ON a.id = m.account_id WHERE m.clan_id = ? " +
        "ORDER BY m.joined_at LIMIT 50", [membership.id],
      );
      members = rows.map((row) => ({ ...row, owner: row.id === membership.owner_id }));
    }
    return {
      friendCode: account.friendCode,
      friends: links.filter((r) => r.status === "accepted"),
      incoming: links.filter((r) => r.status === "pending" && r.requested_by !== account.id),
      outgoing: links.filter((r) => r.status === "pending" && r.requested_by === account.id),
      clan: membership ? { ...membership, owner: membership.owner_id === account.id, members } : null,
      clanInvites: invites,
    };
  });
}

async function friend(account, action, code) {
  const friendCode = String(code || "").trim().toUpperCase();
  if (!/^[A-F0-9]{8}$/.test(friendCode)) return { error: "code" };
  return db.withDb("friendAction", async (pool) => {
    const [[target]] = await pool.query("SELECT id FROM vk_accounts WHERE friend_code = ?", [friendCode]);
    if (!target || target.id === account.id) return { error: "not_found" };
    const [a, b] = pair(account.id, target.id);
    const [[link]] = await pool.query(
      "SELECT status, requested_by FROM vk_friend_links WHERE account_a = ? AND account_b = ?", [a, b],
    );
    if (action === "request") {
      if (!link) await pool.query(
        "INSERT INTO vk_friend_links (account_a, account_b, requested_by) VALUES (?, ?, ?)", [a, b, account.id],
      );
      else if (link.status === "pending" && link.requested_by === target.id)
        await pool.query("UPDATE vk_friend_links SET status = 'accepted' WHERE account_a = ? AND account_b = ?", [a, b]);
      return { ok: true };
    }
    if (!link) return { error: "not_found" };
    if (action === "accept" && link.status === "pending" && link.requested_by === target.id)
      await pool.query("UPDATE vk_friend_links SET status = 'accepted' WHERE account_a = ? AND account_b = ?", [a, b]);
    else if ((action === "decline" && link.status === "pending" && link.requested_by === target.id) ||
             (action === "remove" && link.status === "accepted"))
      await pool.query("DELETE FROM vk_friend_links WHERE account_a = ? AND account_b = ?", [a, b]);
    else return { error: "forbidden" };
    return { ok: true };
  });
}

async function createClan(account, nameValue, tagValue) {
  const name = String(nameValue || "").replace(/\s+/g, " ").trim();
  const tag = String(tagValue || "").trim().toUpperCase();
  if (name.length < 3 || name.length > 40 || !/^[A-Z0-9]{2,8}$/.test(tag)) return { error: "invalid" };
  return db.withDb("createClan", async (pool) => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[member]] = await conn.query("SELECT account_id FROM vk_clan_members WHERE account_id = ? FOR UPDATE", [account.id]);
      if (member) { await conn.rollback(); return { error: "already_in_clan" }; }
      const id = crypto.randomBytes(16).toString("hex");
      await conn.query("INSERT INTO vk_clans (id, name, tag, owner_id) VALUES (?, ?, ?, ?)", [id, name, tag, account.id]);
      await conn.query("INSERT INTO vk_clan_members (account_id, clan_id) VALUES (?, ?)", [account.id, id]);
      await conn.commit();
      return { ok: true };
    } catch (e) {
      await conn.rollback().catch(() => {});
      if (e.code === "ER_DUP_ENTRY") return { error: "taken" };
      throw e;
    } finally { conn.release(); }
  });
}

async function invite(account, code) {
  const friendCode = String(code || "").trim().toUpperCase();
  if (!/^[A-F0-9]{8}$/.test(friendCode)) return { error: "code" };
  return db.withDb("inviteClan", async (pool) => {
    const [[clan]] = await pool.query("SELECT id FROM vk_clans WHERE owner_id = ?", [account.id]);
    if (!clan) return { error: "forbidden" };
    const [[target]] = await pool.query("SELECT id FROM vk_accounts WHERE friend_code = ?", [friendCode]);
    if (!target || target.id === account.id) return { error: "not_found" };
    const [a, b] = pair(account.id, target.id);
    const [[friend]] = await pool.query("SELECT status FROM vk_friend_links WHERE account_a = ? AND account_b = ?", [a, b]);
    if (!friend || friend.status !== "accepted") return { error: "not_friend" };
    const [[member]] = await pool.query("SELECT account_id FROM vk_clan_members WHERE account_id = ?", [target.id]);
    if (member) return { error: "already_in_clan" };
    await pool.query("INSERT IGNORE INTO vk_clan_invites (clan_id, account_id, invited_by) VALUES (?, ?, ?)",
      [clan.id, target.id, account.id]);
    return { ok: true };
  });
}

async function respondInvite(account, clanId, accept) {
  if (!/^[a-f0-9]{32}$/.test(clanId || "")) return { error: "invalid" };
  return db.withDb("respondClanInvite", async (pool) => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[invitation]] = await conn.query(
        "SELECT clan_id FROM vk_clan_invites WHERE clan_id = ? AND account_id = ? FOR UPDATE", [clanId, account.id],
      );
      if (!invitation) { await conn.rollback(); return { error: "not_found" }; }
      if (accept) {
        const [[member]] = await conn.query("SELECT account_id FROM vk_clan_members WHERE account_id = ? FOR UPDATE", [account.id]);
        if (member) { await conn.rollback(); return { error: "already_in_clan" }; }
        await conn.query("INSERT INTO vk_clan_members (account_id, clan_id) VALUES (?, ?)", [account.id, clanId]);
        await conn.query("DELETE FROM vk_clan_invites WHERE account_id = ?", [account.id]);
      } else await conn.query("DELETE FROM vk_clan_invites WHERE clan_id = ? AND account_id = ?", [clanId, account.id]);
      await conn.commit();
      return { ok: true };
    } catch (e) {
      await conn.rollback().catch(() => {});
      throw e;
    } finally { conn.release(); }
  });
}

async function leaveClan(account) {
  return db.withDb("leaveClan", async (pool) => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[clan]] = await conn.query(
        "SELECT c.id, c.owner_id FROM vk_clan_members m JOIN vk_clans c ON c.id = m.clan_id " +
        "WHERE m.account_id = ? FOR UPDATE", [account.id],
      );
      if (!clan) { await conn.rollback(); return { error: "not_found" }; }
      await conn.query("DELETE FROM vk_clan_members WHERE account_id = ?", [account.id]);
      if (clan.owner_id === account.id) {
        const [[next]] = await conn.query(
          "SELECT account_id FROM vk_clan_members WHERE clan_id = ? ORDER BY joined_at, account_id LIMIT 1", [clan.id],
        );
        if (next) await conn.query("UPDATE vk_clans SET owner_id = ? WHERE id = ?", [next.account_id, clan.id]);
        else {
          await conn.query("DELETE FROM vk_clan_invites WHERE clan_id = ?", [clan.id]);
          await conn.query("DELETE FROM vk_clans WHERE id = ?", [clan.id]);
        }
      }
      await conn.commit();
      return { ok: true };
    } catch (e) {
      await conn.rollback().catch(() => {});
      throw e;
    } finally { conn.release(); }
  });
}

async function deleteAccount(account) {
  await leaveClan(account);
  return db.withDb("deleteAccount", async (pool) => {
    await pool.query("DELETE FROM vk_friend_links WHERE account_a = ? OR account_b = ?", [account.id, account.id]);
    await pool.query("DELETE FROM vk_clan_invites WHERE account_id = ? OR invited_by = ?", [account.id, account.id]);
    await pool.query("DELETE FROM vk_sessions WHERE account_id = ?", [account.id]);
    await pool.query("DELETE FROM vk_accounts WHERE id = ?", [account.id]);
    return true;
  });
}

module.exports = { state, friend, createClan, invite, respondInvite, leaveClan, deleteAccount };
