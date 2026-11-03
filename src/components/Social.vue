<template>
  <div class="sheet-bg social-bg" @click.self="$emit('close')">
    <div class="sheet social-sheet" role="dialog" aria-modal="true" aria-labelledby="social-title">
      <header><h2 id="social-title">Arkadaşlar ve Klan</h2><button type="button" aria-label="Kapat" @click="$emit('close')">×</button></header>
      <div class="social-tabs"><button type="button" :class="{ on: tab === 'friends' }" @click="tab = 'friends'">Arkadaşlar</button><button type="button" :class="{ on: tab === 'clan' }" @click="tab = 'clan'">Klan</button></div>
      <p v-if="!account.enabled" class="muted">Arkadaş ve klan özellikleri e-posta ile giriş etkinleştirildiğinde açılacak.</p>
      <p v-if="loading && account.enabled" class="muted">Yükleniyor...</p>
      <p v-if="message" class="social-message" role="status">{{ message }}</p>
      <template v-if="data && tab === 'friends'">
        <div class="social-code"><span>Arkadaş kodun <b>{{ data.friendCode }}</b></span><button type="button" @click="copyCode">Kopyala</button></div>
        <p class="muted hint">Kodunu paylaş; arkadaşın seni bu kodla ekleyebilir.</p>
        <form class="social-form" @submit.prevent="submit('friendRequest', friendCode)"><input class="field" v-model.trim="friendCode" maxlength="8" placeholder="Arkadaş kodu" aria-label="Arkadaş kodu" required /><button class="btn primary small" :disabled="busy">Ekle</button></form>
        <section v-if="data.incoming.length"><h3>Gelen istekler</h3><div class="social-row" v-for="p in data.incoming" :key="p.id"><span>{{ p.name }}</span><div><button type="button" @click="submit('friendAccept', p.friend_code)">Kabul</button><button type="button" @click="submit('friendDecline', p.friend_code)">Reddet</button></div></div></section>
        <section><h3>Arkadaşların</h3><p v-if="!data.friends.length" class="muted hint">Henüz arkadaşın yok.</p><div class="social-row" v-for="p in data.friends" :key="p.id"><span>{{ p.name }} <small>{{ p.friend_code }}</small></span><button type="button" @click="submit('friendRemove', p.friend_code)">Kaldır</button></div></section>
        <section v-if="data.outgoing.length"><h3>Gönderilen istekler</h3><div class="social-row" v-for="p in data.outgoing" :key="p.id"><span>{{ p.name }}</span><small>Yanıt bekleniyor</small></div></section>
      </template>
      <template v-if="data && tab === 'clan'">
        <div v-if="data.clan">
          <div class="clan-heading"><span>[{{ data.clan.tag }}]</span><h3>{{ data.clan.name }}</h3></div>
          <p class="muted hint">{{ data.clan.members.length }} üye · {{ data.clan.owner ? 'Klan liderisin' : 'Klan üyesisin' }}</p>
          <div class="social-row" v-for="p in data.clan.members" :key="p.id"><span>{{ p.name }}</span><small>{{ p.owner ? 'Lider' : 'Üye' }}</small></div>
          <form v-if="data.clan.owner && inviteable.length" class="social-form" @submit.prevent="submit('clanInvite', inviteCode)"><select class="field" v-model="inviteCode" aria-label="Davet edilecek arkadaş"><option value="">Arkadaş seç</option><option v-for="p in inviteable" :key="p.id" :value="p.friend_code">{{ p.name }}</option></select><button class="btn primary small" :disabled="busy || !inviteCode">Davet et</button></form>
          <button class="btn ghost" type="button" @click="leaveClan">Klandan ayrıl</button>
        </div>
        <div v-else>
          <section v-if="data.clanInvites.length"><h3>Klan davetleri</h3><div class="social-row" v-for="c in data.clanInvites" :key="c.id"><span>[{{ c.tag }}] {{ c.name }}<small>{{ c.inviter }} davet etti</small></span><div><button type="button" @click="submit('clanAccept', null, c.id)">Katıl</button><button type="button" @click="submit('clanDecline', null, c.id)">Reddet</button></div></div></section>
          <section><h3>Klan kur</h3><p class="muted hint">Arkadaşlarını davet edip birlikte oynayabilirsin.</p><form @submit.prevent="submit('clanCreate')"><input class="field" v-model.trim="clanName" minlength="3" maxlength="40" placeholder="Klan adı" aria-label="Klan adı" required /><input class="field" v-model.trim="clanTag" minlength="2" maxlength="8" placeholder="Kısa etiket (2-8 karakter)" aria-label="Klan etiketi" required /><button class="btn primary" :disabled="busy">Klan kur</button></form></section>
        </div>
      </template>
    </div>
  </div>
</template>

<script>
import { accountRequest } from "../account";
import { account } from "../account";
const errors = { code: "Geçerli bir arkadaş kodu yaz.", not_found: "Oyuncu veya davet bulunamadı.", already_in_clan: "Bu oyuncu zaten bir klanda.", not_friend: "Yalnızca arkadaşlarını davet edebilirsin.", taken: "Bu klan etiketi kullanılıyor.", invalid: "Klan adı veya etiketi geçersiz.", forbidden: "Bu işlem için yetkin yok.", login: "Oturumun sona erdi." };
export default {
  data: () => ({ account, tab: "friends", data: null, loading: true, busy: false, message: "", friendCode: "", inviteCode: "", clanName: "", clanTag: "" }),
  computed: { inviteable() { return this.data ? this.data.friends.filter((p) => !this.data.clan.members.some((m) => m.id === p.id)) : []; } },
  mounted() { if (account.enabled) this.refresh(); },
  methods: {
    async refresh() {
      this.loading = true;
      try { const r = await fetch("/api/social", { cache: "no-store" }); if (!r.ok) throw new Error("network"); this.data = await r.json(); }
      catch (e) { this.message = "Bilgiler yüklenemedi. Tekrar dene."; }
      this.loading = false;
    },
    async submit(action, code, clanId) {
      if (this.busy) return;
      this.busy = true; this.message = "";
      try {
        await accountRequest("/api/social", { action, code, clanId, name: this.clanName, tag: this.clanTag });
        this.friendCode = ""; this.inviteCode = ""; this.clanName = ""; this.clanTag = "";
        await this.refresh();
        this.message = "Kaydedildi.";
      } catch (e) { this.message = errors[e.message] || "İşlem tamamlanamadı. Tekrar dene."; }
      this.busy = false;
    },
    leaveClan() { if (confirm("Klandan ayrılmak istediğine emin misin?")) this.submit("clanLeave"); },
    async copyCode() {
      try { await navigator.clipboard.writeText(this.data.friendCode); this.message = "Arkadaş kodun kopyalandı."; }
      catch (e) { this.message = "Kodunu seçip kopyalayabilirsin."; }
    },
  },
};
</script>

<style scoped lang="scss">
.social-bg { align-items: center; padding: 10px; }
.social-sheet { max-width: 520px; max-height: 90dvh; border-radius: 18px; }
header { display: flex; align-items: center; justify-content: space-between; }
h2 { margin: 0 0 12px; font-size: 22px; }
header button { border: 0; background: none; color: #f0d195; font-size: 30px; cursor: pointer; }
.social-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 16px; }
.social-tabs button { padding: 10px; border: 1px solid #74442f; border-radius: 9px; background: #190c14; color: #e5c8a6; font: inherit; cursor: pointer; }
.social-tabs button.on { background: #662033; border-color: #d29b58; }
.social-code, .social-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 0; border-bottom: 1px solid #65432e; }
.social-code b { color: #ffdf9c; letter-spacing: .12em; }
.social-code button, .social-row button { border: 1px solid #a66c39; border-radius: 8px; background: #3c1c1b; color: #ffe0a9; padding: 7px 9px; cursor: pointer; }
.social-row div { display: flex; gap: 5px; }
.social-row small { display: block; color: #bba394; font-size: 12px; }
.social-form { display: flex; gap: 8px; align-items: center; margin: 14px 0; }
.social-form .field { min-width: 0; flex: 1; }
.social-form .btn { flex: 0 0 auto; }
.social-sheet section { margin-top: 22px; }
h3 { margin: 0 0 8px; font-size: 17px; }
.hint { margin: 7px 0; font-size: 13px; }
.social-sheet form:not(.social-form) .field { margin: 5px 0; }
.social-message { padding: 9px; border: 1px solid #aa7649; border-radius: 9px; color: #ffdfa6; font-size: 13px; }
.clan-heading { display: flex; align-items: center; gap: 8px; }
.clan-heading span { color: #ffd48a; }
.clan-heading h3 { margin: 0; }
@media (max-width: 600px) { .social-bg { align-items: flex-end; padding: 0; } .social-sheet { max-height: 94dvh; border-radius: 18px 18px 0 0; } }
</style>
