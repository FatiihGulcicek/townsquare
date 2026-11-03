<template>
  <main class="auth-page">
    <div class="auth-card">
      <img class="auth-logo" src="static/darkspire-logo.webp" alt="Darkspire Vampir Köylü" />
      <h1>{{ sent ? "E-postanı kontrol et" : "Darkspire'a gir" }}</h1>
      <p class="muted">{{ sent ? "Gönderdiğimiz 8 haneli kodu yaz." : "Hesabınla arkadaşlarını ve klanını her cihazda bul." }}</p>
      <div class="auth-tabs" v-if="!sent">
        <button type="button" :class="{ selected: !register }" @click="register = false">Giriş yap</button>
        <button type="button" :class="{ selected: register }" @click="register = true">Kayıt ol</button>
      </div>
      <form @submit.prevent="sent ? verify() : requestCode()">
        <label v-if="register && !sent" for="auth-name">Oyuncu adı</label>
        <input v-if="register && !sent" id="auth-name" class="field" v-model.trim="name" maxlength="24" autocomplete="nickname" required />
        <label for="auth-email">E-posta adresi</label>
        <input id="auth-email" class="field" v-model.trim="email" type="email" autocomplete="email" :readonly="sent" required />
        <template v-if="sent">
          <label for="auth-code">Giriş kodu</label>
          <input id="auth-code" class="field auth-code" v-model.trim="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" maxlength="8" required autofocus />
        </template>
        <p class="auth-error" v-if="error" role="alert">{{ error }}</p>
        <button class="btn primary" type="submit" :disabled="busy">{{ busy ? "Bir dakika..." : sent ? "Devam et" : "Kod gönder" }}</button>
      </form>
      <button v-if="sent" class="auth-back" type="button" @click="sent = false; code = ''; error = ''">E-postayı değiştir veya kodu yeniden gönder</button>
      <p class="auth-foot">Şifre gerekmez. Kod 10 dakika geçerlidir.</p>
    </div>
  </main>
</template>

<script>
import { accountRequest, signIn } from "../account";
import { game } from "../game";

const messages = {
  email: "Geçerli bir e-posta adresi yaz.", code: "Kod hatalı veya süresi doldu.",
  rate: "Çok fazla deneme yapıldı. Bir süre sonra tekrar dene.",
  wait: "Yeni kod istemeden önce bir dakika bekle.",
  mail: "Kod gönderilemedi. Bir süre sonra tekrar dene.",
  no_account: "Bu e-postayla hesap bulunamadı. Kayıt ol sekmesini seç.",
  unavailable: "Giriş şu anda kullanılamıyor. Bir süre sonra tekrar dene.",
};
export default {
  data: () => ({ register: false, sent: false, name: game.name || "", email: "", code: "", busy: false, error: "" }),
  methods: {
    async requestCode() {
      this.error = "";
      if (this.register && this.name.trim().length < 2) { this.error = "Oyuncu adın en az iki karakter olsun."; return; }
      this.busy = true;
      try {
        await accountRequest("/api/auth/request", { email: this.email });
        this.sent = true;
      } catch (e) { this.error = messages[e.message] || "Bağlantı kurulamadı. Tekrar dene."; }
      this.busy = false;
    },
    async verify() {
      this.error = "";
      this.busy = true;
      try {
        const data = await accountRequest("/api/auth/verify", {
          email: this.email, code: this.code, register: this.register,
          name: this.name, playerId: game.playerId,
        });
        signIn(data.user);
        this.$emit("done");
      } catch (e) { this.error = messages[e.message] || "Giriş yapılamadı. Tekrar dene."; }
      this.busy = false;
    },
  },
};
</script>

<style scoped lang="scss">
.auth-page { min-height: 100dvh; display: grid; place-items: center; padding: 24px 16px; }
.auth-card { width: min(100%, 420px); padding: 24px; border: 1px solid #c68c51; border-radius: 20px; background: linear-gradient(155deg, rgba(52, 13, 30, .97), rgba(9, 7, 14, .98)); box-shadow: 0 25px 70px #000b; }
.auth-logo { display: block; width: min(85%, 290px); max-height: 160px; object-fit: contain; margin: 0 auto 8px; }
h1 { margin: 0 0 6px; font-size: 25px; text-align: center; }
p { font-size: 14px; text-align: center; line-height: 1.5; }
.auth-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 20px 0; padding: 4px; border: 1px solid #7f5139; border-radius: 12px; background: #100910; }
.auth-tabs button { border: 0; border-radius: 9px; background: none; color: #d6bca1; padding: 10px; font: inherit; cursor: pointer; }
.auth-tabs button.selected { background: #672230; color: #ffe0a9; }
label { display: block; margin: 14px 0 5px; color: #f2d49a; font-size: 13px; font-weight: 700; }
.auth-code { text-align: center; letter-spacing: .25em; font-variant-numeric: tabular-nums; }
.auth-error { color: #ffb5ae; }
.auth-card .btn { margin-top: 20px; }
.auth-back { display: block; margin: 16px auto 0; border: 0; background: none; color: #f3c77f; font: inherit; font-size: 13px; cursor: pointer; }
.auth-foot { margin: 24px 0 0; color: #ac988e; font-size: 12px; }
</style>
