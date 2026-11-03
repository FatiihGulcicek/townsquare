<template>
  <div class="sheet-bg profile-overlay" @click.self="$emit('close')">
    <div class="sheet profile-sheet" role="dialog" aria-modal="true" aria-label="Profil">
      <div class="profile-topbar">
        <img src="static/nav-profile-v6.webp" alt="" />
        <div><h2>Profil</h2><small>Darkspire · Vampir Köylü</small></div>
        <button class="profile-close" @click="$emit('close')" aria-label="Profili kapat">×</button>
      </div>
      <nav class="tabs" aria-label="Profil bölümleri">
        <button :class="{ active: tab === 'me' }" @click="tab = 'me'">
          <img src="static/nav-profile-v6.webp" alt="" />Profilim
        </button>
        <button :class="{ active: tab === 'badges' }" @click="tab = 'badges'">
          <img src="static/nav-collection-v6.webp" alt="" />Rozetler
        </button>
        <button :class="{ active: tab === 'history' }" @click="tab = 'history'">
          <img src="static/tile-badges-v2.webp" alt="" />Geçmiş
        </button>
        <button :class="{ active: tab === 'shop' }" @click="tab = 'shop'">
          <img src="static/tile-shop-v2.webp" alt="" />Mağaza
        </button>
        <button :class="{ active: tab === 'top' }" @click="openTop">
          <img src="static/tile-rank.webp" alt="" />Sıralama
        </button>
      </nav>

      <template v-if="tab === 'shop'">
        <p class="coins">
          🪙 <b>{{ prog.totals.coins || 0 }}</b> altın
          <small class="muted">(gerçek oyuncularla oynadıkça altın kazanırsın)</small>
        </p>
        <nav class="shop-filters" aria-label="Mağaza kategorileri">
          <button v-for="group in shopGroups" :key="group.type" :class="{ active: shopCategory === group.type }" @click="shopCategory = group.type">{{ group.short }}</button>
        </nav>
        <div v-if="activeShopGroup">
          <h4>{{ activeShopGroup.title }}</h4>
          <p v-if="activeShopGroup.hint" class="muted small shop-hint">{{ activeShopGroup.hint }}</p>
          <div class="shop">
            <div
              v-for="item in activeShopGroup.items"
              :key="item.id"
              class="item"
              :class="[item.id, { on: equipped(item), owned: owned(item) }]"
            >
              <span v-if="item.type === 'frame'" class="pv frame-preview" :class="item.id"><img src="static/default-avatar-v4.webp" alt="" /></span>
              <img v-else-if="item.image" class="pv" :class="item.type === 'back' ? 'card-preview' : 'avatar-preview'" :src="item.image" :alt="item.name" loading="lazy" />
              <span v-else-if="item.type === 'chat'" class="pv chat-preview" :style="{ color: item.color }">Adın</span>
              <span v-else class="pv emblem-preview">{{ item.preview }}</span>
              <b>{{ item.name }}</b>
              <button
                v-if="owned(item)"
                class="btn small"
                @click="equipItem(item)"
              >
                {{ equipped(item) ? "✓ Takılı" : "Tak" }}
              </button>
              <button
                v-else
                class="btn small primary"
                :disabled="(prog.totals.coins || 0) < item.price"
                @click="buyItem(item)"
              >
                🪙 {{ item.price }}
              </button>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="tab === 'badges'">
        <p class="muted small">
          {{ badgeCount }}/{{ badges.length }} rozet açıldı.
        </p>
        <div class="badges">
          <div
            v-for="b in badges"
            :key="b.id"
            class="badge"
            :class="{ on: !!prog.totals.badges[b.id] }"
          >
            <span class="be">{{ b.emoji }}</span>
            <b>{{ b.name }}</b>
            <small>{{ b.desc }}</small>
          </div>
        </div>
      </template>

      <template v-else-if="tab === 'history'">
        <p v-if="!prog.history.length" class="muted">
          Henüz kayıtlı oyun yok. Oynadığın oyunlar burada birikir; hikâyesini
          tekrar izleyebilirsin.
        </p>
        <div class="match" v-for="g in prog.history" :key="g.key">
          <div class="mh">
            <span class="res" :class="{ won: g.won }">{{
              g.won ? "🏆 Kazandın" : "✖ Kaybettin"
            }}</span>
            <span class="muted small"
              >{{ day(g.at) }} · {{ g.players.length }} kişi ·
              {{ g.rounds }} gece</span
            >
          </div>
          <div class="ml">
            <span>{{ roleLabel(g.role) }}</span>
            <span class="muted small">{{ g.botGame ? "Botlu · ödülsüz" : "+" + g.xp + " XP" }}</span>
            <button
              class="btn small"
              v-if="g.events && g.events.length"
              @click="replay(g)"
            >
              ▶ İzle
            </button>
          </div>
        </div>
      </template>

      <div class="replay" v-if="replaying" @click="replayNext">
        <div class="rprog">
          <span
            class="fill"
            :key="replayIndex"
            @animationend="replayNext"
          ></span>
        </div>
        <button class="rclose" @click.stop="replaying = null">✕</button>
        <StoryScene
          :key="'r' + replayIndex"
          :e="replaying.events[replayIndex]"
          size="full"
        />
      </div>

      <div
        v-if="loading && (tab === 'me' || tab === 'top')"
        class="muted center"
      >
        Yükleniyor…
      </div>

      <template v-else-if="tab === 'me'">
        <div class="head">
          <div class="profile-portrait">
            <Avatar :name="name" :size="72" :src="game.myPhoto || 'static/default-avatar-v4.webp'" self />
          </div>
          <div>
            <h3>{{ name || "İsimsiz" }}</h3>
            <small class="muted" v-if="profile && profile.since">
              {{ since }} tarihinden beri oynuyor
            </small>
          </div>
        </div>
        <div class="level">
          <div class="lv">
            <b>{{ level }}. seviye</b>
            <span class="title">{{ title }}</span>
          </div>
          <div class="xpbar">
            <span :style="{ width: levelPct + '%' }"></span>
          </div>
          <small class="muted"
            >{{ prog.totals.xp }} XP · sonraki seviyeye
            {{ nextXp - prog.totals.xp }} XP</small
          >
        </div>
        <div class="stats" v-if="!enabled || !profile || !profile.games">
          <div>
            <b>{{ prog.totals.games }}</b
            ><span>oyun</span>
          </div>
          <div>
            <b>{{ prog.totals.wins }}</b
            ><span>galibiyet</span>
          </div>
          <div>
            <b>%{{ rate(prog.totals.wins, prog.totals.games) }}</b
            ><span>kazanma</span>
          </div>
          <div>
            <b>{{ prog.totals.bestStreak }}</b
            ><span>en iyi seri</span>
          </div>
        </div>
        <p v-if="!enabled" class="muted small">
          Bu istatistikler bu telefonda tutuluyor.
        </p>
        <p v-else-if="!profile || !profile.games" class="muted">
          Henüz bitmiş bir oyunun yok. İlk oyunundan sonra istatistiklerin
          burada görünecek.
        </p>
        <template v-else>
          <div class="stats">
            <div>
              <b>{{ profile.games }}</b>
              <span>oyun</span>
            </div>
            <div>
              <b>{{ profile.wins }}</b>
              <span>galibiyet</span>
            </div>
            <div>
              <b>%{{ rate(profile.wins, profile.games) }}</b>
              <span>kazanma</span>
            </div>
            <div>
              <b>{{ profile.survived }}</b>
              <span>hayatta kaldı</span>
            </div>
          </div>
          <h4>Rollere göre</h4>
          <div class="roles">
            <div v-for="r in roleRows" :key="r.id" class="role-row">
              <span>{{ r.emoji }} {{ r.name }}</span>
              <span class="bar">
                <span :style="{ width: r.rate + '%' }"></span>
              </span>
              <span class="muted">{{ r.wins }}/{{ r.games }}</span>
            </div>
          </div>
          <h4>Son oyunlar</h4>
          <div class="recent">
            <div
              v-for="(g, i) in profile.recent"
              :key="i"
              :class="{ won: g.won }"
            >
              <span>{{ g.won ? "🏆" : "✖" }} {{ roleLabel(g.role) }}</span>
              <span class="muted">{{ g.players }} kişi · {{ day(g.at) }}</span>
            </div>
          </div>
        </template>

        <details class="code">
          <summary>Profilini başka cihaza taşı</summary>
          <p class="muted small">
            Bu kod senin gizli anahtarındır, kimseyle paylaşma. Diğer cihazda
            buraya yazarsan istatistiklerin oraya taşınır.
          </p>
          <div class="inline">
            <input
              class="field"
              :value="game.playerId"
              readonly
              @focus="$event.target.select()"
            />
            <button class="btn small" @click="copy">Kopyala</button>
          </div>
          <div class="inline">
            <input
              class="field"
              v-model="importCode"
              placeholder="Diğer cihazdaki kod"
            />
            <button class="btn small" @click="useCode">Kullan</button>
          </div>
        </details>
      </template>

      <template v-else-if="tab === 'top'">
        <div class="periods">
          <button
            v-for="(label, key) in periods"
            :key="key"
            :class="{ active: period === key }"
            @click="loadTop(key)"
          >
            {{ label }}
          </button>
        </div>
        <p class="champ" v-if="champion">
          👑 Geçen {{ period === "month" ? "ayın" : "haftanın" }} şampiyonu:
          <b>{{ champion.name }}</b> ({{ champion.wins }} galibiyet)
        </p>
        <p v-if="!top.length" class="muted">
          Bu dönemde henüz bitmiş oyun yok. İlk sen ol!
        </p>
        <div class="top">
          <div v-for="(p, i) in top" :key="i" class="top-row">
            <span class="rank">{{ medal(i) }}</span>
            <Avatar :name="p.name" :size="36" />
            <span class="nm">{{ p.name }}</span>
            <span class="muted"
              >{{ p.wins }}/{{ p.games }} · %{{ p.rate }}</span
            >
          </div>
        </div>
      </template>

    </div>
  </div>
</template>

<script>
import Avatar from "./Avatar";
import StoryScene from "./StoryScene";
import {
  progress,
  SHOP,
  buy,
  equip,
  BADGES,
  levelFor,
  xpForLevel,
  titleFor,
} from "../progress";
import {
  game,
  fetchProfile,
  fetchLeaderboard,
  useProfileCode,
  toast,
} from "../game";

const ROLE_INFO = {
  vampir: { emoji: "🧛", name: "Vampir" },
  koylu: { emoji: "🧑‍🌾", name: "Köylü" },
  doktor: { emoji: "🩺", name: "Doktor" },
  gozcu: { emoji: "👁️", name: "Gözcü" },
};

export default {
  components: { Avatar, StoryScene },
  props: { initialTab: { type: String, default: "me" } },
  data() {
    return {
      game,
      tab: this.initialTab,
      loading: true,
      enabled: true,
      profile: null,
      top: [],
      importCode: "",
      prog: progress,
      replaying: null,
      period: "week",
      champion: null,
      periods: { week: "Bu hafta", month: "Bu ay", all: "Tüm zamanlar" },
      replayIndex: 0,
      shopCategory: "back",
    };
  },
  computed: {
    badges() {
      return BADGES.filter(
        (b) => b.id !== "ogrenci" || this.prog.totals.badges.ogrenci,
      );
    },
    name() {
      return (this.profile && this.profile.name) || game.name;
    },
    since() {
      return new Date(this.profile.since).toLocaleDateString("tr-TR");
    },
    level() {
      return levelFor(this.prog.totals.xp);
    },
    title() {
      return titleFor(this.level);
    },
    nextXp() {
      return xpForLevel(this.level + 1);
    },
    levelPct() {
      const a = xpForLevel(this.level);
      return Math.min(
        100,
        (100 * (this.prog.totals.xp - a)) / (this.nextXp - a),
      );
    },
    shopGroups() {
      return [
        { type: "back", short: "Kart", title: "Kart arkaları" },
        { type: "frame", short: "Çerçeve", title: "Avatar çerçeveleri" },
        { type: "avatar", short: "Fotoğraf", title: "Profil fotoğrafları", hint: "Hazır portre seçebilir veya kendi fotoğrafını kullanabilirsin." },
        { type: "chat", short: "Sohbet", title: "Sohbet adı renkleri" },
        { type: "emblem", short: "Simge", title: "Profil simgeleri", hint: "Profil fotoğrafının yanında görünür; başarı rozetlerinden ayrıdır." },
      ].map((g) => ({ ...g, items: SHOP.filter((i) => i.type === g.type) }));
    },
    activeShopGroup() {
      return this.shopGroups.find((group) => group.type === this.shopCategory);
    },
    badgeCount() {
      return Object.keys(this.prog.totals.badges).length;
    },
    roleRows() {
      const roles = (this.profile && this.profile.roles) || {};
      return Object.keys(ROLE_INFO)
        .filter((id) => roles[id])
        .map((id) => ({
          id,
          ...ROLE_INFO[id],
          games: roles[id].games,
          wins: roles[id].wins,
          rate: this.rate(roles[id].wins, roles[id].games),
        }));
    },
  },
  async mounted() {
    if (this.tab === "top") await this.openTop();
    const result = await fetchProfile();
    this.enabled = result.enabled;
    this.profile = result.profile || null;
    this.loading = false;
  },
  methods: {
    owned(item) {
      return (this.prog.totals.owned || []).includes(item.id);
    },
    equipped(item) {
      return (this.prog.totals.equipped || {})[item.type] === item.id;
    },
    buyItem(item) {
      if (!confirm(`${item.name} ${item.price} altına alınsın mı?`)) return;
      if (buy(item.id))
        toast(`${item.preview} ${item.name} alındı ve takıldı!`, "success");
    },
    equipItem(item) {
      equip(item.id);
    },
    replay(g) {
      this.replayIndex = 0;
      this.replaying = g;
    },
    replayNext() {
      if (!this.replaying) return;
      if (this.replayIndex < this.replaying.events.length - 1)
        this.replayIndex++;
      else this.replaying = null;
    },
    rate(w, g) {
      return g ? Math.round((100 * w) / g) : 0;
    },
    roleLabel(id) {
      const r = ROLE_INFO[id];
      return r ? r.emoji + " " + r.name : id;
    },
    day(at) {
      return new Date(at).toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "short",
      });
    },
    medal(i) {
      return ["🥇", "🥈", "🥉"][i] || i + 1 + ".";
    },
    async openTop() {
      this.tab = "top";
      await this.loadTop(this.period);
    },
    async loadTop(period) {
      this.period = period;
      const result = await fetchLeaderboard(period);
      this.top = result.list || [];
      this.champion = result.champion || null;
    },
    async copy() {
      try {
        await navigator.clipboard.writeText(game.playerId);
        toast("Profil kodu kopyalandı. Kimseyle paylaşma!", "success");
      } catch (e) {
        prompt("Profil kodun:", game.playerId);
      }
    },
    async useCode() {
      if (!confirm("Bu cihazdaki profil, girdiğin kodla değiştirilsin mi?")) {
        return;
      }
      if (useProfileCode(this.importCode)) {
        toast("Profil bu cihaza taşındı.", "success");
        this.loading = true;
        const result = await fetchProfile();
        this.profile = result.profile || null;
        this.loading = false;
      } else {
        toast("Kod geçersiz.", "warning");
      }
    },
  },
};
</script>

<style scoped lang="scss">
@import "../vars";
.profile-overlay { align-items: center; }
.profile-sheet {
  width: min(100%, 640px);
  height: 100dvh;
  max-height: 100dvh;
  padding: 0 14px calc(20px + env(safe-area-inset-bottom));
  border: 1px solid #ae713b;
  border-radius: 0;
  background:
    radial-gradient(ellipse at 50% 0, rgba(116, 21, 39, 0.5), transparent 44%),
    linear-gradient(160deg, #240a16, #09080e 72%);
  box-shadow: 0 0 50px rgba(0, 0, 0, 0.75), inset 0 1px rgba(255, 229, 166, 0.14);
}
.profile-topbar {
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 68px;
  margin: 0 -14px;
  padding: calc(9px + env(safe-area-inset-top)) 14px 9px;
  border-bottom: 1px solid rgba(224, 151, 70, 0.56);
  background: linear-gradient(180deg, #35101d, #160910);
  img { width: 39px; height: 39px; object-fit: contain; }
  > div { flex: 1; min-width: 0; }
  h2 { margin: 0; color: #ffe1a4; font: 700 22px Georgia, "Times New Roman", serif; }
  small { color: #cfab87; font-size: 11px; }
}
.profile-close {
  width: 35px;
  height: 35px;
  border: 1px solid #ce8a4a;
  border-radius: 50%;
  background: linear-gradient(#552319, #1b0d11);
  color: #ffe0a6;
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
}
.tabs {
  position: sticky;
  top: calc(68px + env(safe-area-inset-top));
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 3px;
  margin: 0 -14px 16px;
  padding: 6px 7px;
  border-bottom: 1px solid rgba(224, 151, 70, 0.5);
  background: rgba(13, 8, 13, 0.98);
  button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    min-width: 0;
    min-height: 52px;
    border-radius: 9px;
    border: 1px solid transparent;
    background: transparent;
    color: #d4bda0;
    font-family: inherit;
    font-size: clamp(9px, 2.7vw, 12px);
    font-weight: 600;
    white-space: nowrap;
    padding: 3px 0;
    cursor: pointer;
    img { width: 26px; height: 26px; object-fit: contain; }
    &.active {
      border-color: #cf8b49;
      color: #ffe3ad;
      background: linear-gradient(180deg, #711423, #260811);
      box-shadow: inset 0 1px rgba(255, 222, 158, 0.18), 0 0 11px rgba(196, 40, 40, 0.2);
    }
  }
}
@media (min-width: 700px) {
  .profile-sheet { height: min(90dvh, 800px); max-height: 90dvh; border-radius: 18px; }
}
.level {
  margin: 12px 0;
  padding: 15px;
  border-radius: 13px;
  background: linear-gradient(130deg, rgba(61, 17, 26, 0.95), rgba(14, 10, 16, 0.96));
  border: 1px solid rgba(225, 153, 76, 0.62);
  box-shadow: inset 0 1px rgba(255, 226, 163, 0.12), 0 8px 20px rgba(0, 0, 0, 0.3);
  .lv {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    b {
      font-size: 20px;
      color: $gold;
    }
    .title {
      font-family: "Cinzel", Georgia, serif;
      font-weight: 700;
    }
  }
  .xpbar {
    height: 10px;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.12);
    margin: 8px 0 4px;
    overflow: hidden;
    span {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, #a85324, #ffd077 72%, #fff1bb);
    }
  }
}
.coins {
  padding: 12px 14px;
  border: 1px solid rgba(225, 153, 76, 0.62);
  border-radius: 12px;
  background: linear-gradient(130deg, #3b1720, #110a11);
  font-size: 18px;
  b {
    color: $gold;
  }
  small {
    display: block;
    font-size: 12px;
  }
}
.shop {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 8px;
  .item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    text-align: center;
    padding: 10px 6px;
    border-radius: 12px;
    background: linear-gradient(145deg, #2e0e1b, #0c0910);
    border: 1px solid rgba(211, 141, 69, 0.52);
    .pv {
      font-size: 28px;
    }
    .card-preview {
      display: block;
      width: 42px;
      height: 63px;
      object-fit: cover;
      border-radius: 3px;
    }
    .avatar-preview {
      width: 52px;
      height: 52px;
      border: 2px solid #d9a866;
      border-radius: 50%;
      object-fit: cover;
      background: #1b0b1b;
    }
    .frame-preview {
      display: block;
      width: 52px;
      height: 52px;
      border: 3px solid #d9a866;
      border-radius: 50%;
      box-shadow: 0 0 12px #d9a866;
      img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
      &.frame-fire { border-color: #ff8b2c; box-shadow: 0 0 12px #f52; }
      &.frame-ice { border-color: #a6efff; box-shadow: 0 0 12px #5bcfff; }
      &.frame-rose { border-color: #ff75a7; box-shadow: 0 0 12px #ff5d91; }
      &.frame-shadow { border-color: #5e4382; box-shadow: 0 0 12px #a452da; }
      &.frame-moon { border-color: #d5bdf0; box-shadow: 0 0 12px #a786dc; }
      &.frame-thorn { border-color: #b8455a; box-shadow: 0 0 12px #d93858; }
      &.frame-royal { border-color: #ffdb84; box-shadow: 0 0 12px #e5ad39; }
      &.frame-emerald { border-color: #85e9bd; box-shadow: 0 0 12px #32b986; }
    }
    .chat-preview {
      display: grid;
      place-items: center;
      min-height: 52px;
      font-size: 16px;
      font-weight: 800;
      text-shadow: 0 2px 5px #000;
    }
    .emblem-preview { display: grid; place-items: center; min-height: 52px; }
    &.back-eclipse .card-preview { filter: hue-rotate(45deg) brightness(0.82); }
    &.back-royal .card-preview { filter: saturate(0.65) hue-rotate(30deg); }
    b {
      font-size: 12px;
    }
    .btn {
      margin: 0;
      width: 100%;
      min-height: 34px;
      font-size: 13px;
    }
    &.on {
      border-color: $gold;
      background: rgba(233, 180, 76, 0.12);
    }
  }
}
.shop-filters {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 0 0 8px;
  scrollbar-width: none;
  button {
    flex: 0 0 auto;
    padding: 7px 11px;
    border: 1px solid rgba(211, 141, 69, 0.48);
    border-radius: 999px;
    background: #1c0e17;
    color: #d9b991;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    &.active { background: #8b2432; border-color: #f4bb75; color: #ffe5b6; }
  }
}
.shop-hint { margin: -4px 0 10px; }
.badges {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 8px;
}
.badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 2px;
  padding: 10px 6px;
  border-radius: 12px;
  background: linear-gradient(145deg, #29101a, #0e0b11);
  border: 1px solid rgba(211, 141, 69, 0.42);
  filter: grayscale(1);
  opacity: 0.45;
  .be {
    font-size: 30px;
  }
  b {
    font-size: 13px;
  }
  small {
    font-size: 11px;
    color: $muted;
  }
  &.on {
    filter: none;
    opacity: 1;
    border-color: rgba(233, 180, 76, 0.5);
    background: rgba(233, 180, 76, 0.1);
  }
}
.match {
  padding: 10px 0;
  border-bottom: 1px solid $line;
  .mh,
  .ml {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .ml {
    margin-top: 4px;
  }
  .res {
    font-weight: 700;
    &.won {
      color: $gold;
    }
  }
  .btn {
    margin: 0;
  }
}
.replay {
  position: fixed;
  inset: 0;
  z-index: 390;
  background: black;
}
.rprog {
  position: absolute;
  z-index: 5;
  left: 10px;
  right: 60px;
  top: calc(14px + env(safe-area-inset-top));
  height: 3px;
  background: rgba(255, 255, 255, 0.3);
  .fill {
    display: block;
    height: 100%;
    width: 0;
    background: white;
    animation: rp 4200ms linear forwards;
  }
}
@keyframes rp {
  to {
    width: 100%;
  }
}
.rclose {
  position: absolute;
  z-index: 6;
  right: 12px;
  top: calc(8px + env(safe-area-inset-top));
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 0;
  background: rgba(0, 0, 0, 0.4);
  color: white;
  font-size: 18px;
}
.center {
  text-align: center;
}
.head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  border: 1px solid rgba(225, 153, 76, 0.62);
  border-radius: 14px;
  background: linear-gradient(115deg, #3f1221, #140a11);
  box-shadow: inset 0 1px rgba(255, 226, 163, 0.14), 0 8px 22px rgba(0, 0, 0, 0.3);
  .profile-portrait {
    display: grid;
    place-items: center;
    flex: none;
    width: 82px;
    height: 82px;
    img { width: 100%; height: 100%; object-fit: contain; }
  }
  h3 {
    margin: 0;
    color: #ffe0a6;
    font: 700 22px Georgia, "Times New Roman", serif;
  }
}
.stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 14px 0;
  div {
    background: linear-gradient(150deg, rgba(53, 15, 27, 0.98), rgba(13, 9, 15, 0.98));
    border: 1px solid rgba(211, 141, 69, 0.49);
    border-radius: 12px;
    padding: 13px 4px;
    text-align: center;
  }
  b {
    display: block;
    font-size: 25px;
    color: #ffda8e;
  }
  span {
    font-size: 12px;
    color: $muted;
  }
}
h4 {
  margin: 14px 0 6px;
}
.role-row {
  display: grid;
  grid-template-columns: 110px 1fr 50px;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
  .bar {
    height: 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.1);
    overflow: hidden;
    span {
      display: block;
      height: 100%;
      background: $gold;
    }
  }
}
.recent div {
  display: flex;
  justify-content: space-between;
  padding: 7px 0;
  border-bottom: 1px solid $line;
  &.won span:first-child {
    color: $gold;
  }
}
.code {
  margin-top: 14px;
  summary {
    cursor: pointer;
    font-weight: 600;
  }
}
.inline {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 6px 0;
  .field {
    font-size: 14px;
    min-height: 42px;
  }
}
.small {
  font-size: 14px;
}
.periods {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
  button {
    flex: 1;
    min-height: 38px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.05);
    color: $text;
    font-size: 13px;
    &.active {
      border-color: $gold;
      background: rgba(233, 180, 76, 0.18);
    }
  }
}
.champ {
  padding: 10px;
  border-radius: 12px;
  background: rgba(233, 180, 76, 0.12);
  border: 1px solid rgba(233, 180, 76, 0.4);
}
.top-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid $line;
  .rank {
    width: 30px;
    text-align: center;
    font-weight: 800;
  }
  .nm {
    flex: 1;
    font-weight: 600;
  }
}
</style>
