import Vue from "vue";
import { game, setAccountIdentity } from "./game";

export const account = Vue.observable({ ready: false, enabled: false, user: null });

export async function loadAccount() {
  try {
    const response = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error("network");
    const data = await response.json();
    account.enabled = !!data.enabled;
    account.user = data.user || null;
    if (account.user) setAccountIdentity(account.user);
  } catch (e) {
    // A temporary network error must not silently bypass a previously enabled login.
    account.enabled = localStorage.getItem("vkAuthEnabled") === "1";
    account.user = null;
  }
  if (account.enabled) localStorage.setItem("vkAuthEnabled", "1");
  account.ready = true;
  return account;
}

export async function accountRequest(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || "network");
  return data;
}

export function signIn(user) {
  account.user = user;
  setAccountIdentity(user);
}

export async function signOut() {
  await accountRequest("/api/auth/logout", {});
  account.user = null;
  game.code = "";
  location.replace("/");
}
