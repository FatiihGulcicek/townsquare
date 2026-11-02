<template>
  <div class="sheet-bg" @click.self="$emit('close')">
    <div class="sheet">
      <div class="tabs">
        <button :class="{ active: tab === 'me' }" @click="tab = 'me'">
          👤 Profilim
        </button>
        <button :class="{ active: tab === 'top' }" @click="openTop">
          🏆 Sıralama
        </button>
      </div>

      <div v-if="loading" class="muted center">Yükleniyor…</div>

      <template v-else-if="tab === 'me'">
        <div class="head">
          <Avatar :name="name" :size="72" :src="game.myPhoto" />
          <div>
            <h3>{{ name || "İsimsiz" }}</h3>
            <small class="muted" v-if="profile && profile.since">
              {{ since }} tarihinden beri oynuyor
            </small>
          </div>
        </div>
        <p v-if="!enabled" class="muted">
          İstatistikler henüz açılmadı (sunucuya veritabanı anahtarı
          eklenmemiş).
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

      <template v-else>
        <p class="muted small">
          En az 3 oyun oynamış oyuncular, galibiyete göre.
        </p>
        <p v-if="!top.length" class="muted">Henüz sıralama yok.</p>
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

      <button class="btn ghost" @click="$emit('close')">Kapat</button>
    </div>
  </div>
</template>

<script>
import Avatar from "./Avatar";
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
  components: { Avatar },
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
    };
  },
  computed: {
    name() {
      return (this.profile && this.profile.name) || game.name;
    },
    since() {
      return new Date(this.profile.since).toLocaleDateString("tr-TR");
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
      const result = await fetchLeaderboard();
      this.top = result.list || [];
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
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  button {
    flex: 1;
    min-height: 44px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.05);
    color: $text;
    font-size: 16px;
    font-weight: 600;
    &.active {
      border-color: $gold;
      background: rgba(233, 180, 76, 0.18);
    }
  }
}
.center {
  text-align: center;
}
.head {
  display: flex;
  align-items: center;
  gap: 14px;
  h3 {
    margin: 0;
    font-size: 22px;
  }
}
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin: 14px 0;
  div {
    background: rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    padding: 10px 4px;
    text-align: center;
  }
  b {
    display: block;
    font-size: 22px;
    color: $gold;
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
