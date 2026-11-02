<template>
  <div class="page room" :class="'phase-' + phase">
    <!-- top bar -->
    <div class="bar">
      <button class="code" @click="share" title="Davet et">
        {{ game.code }} <span>🔗</span>
      </button>
      <div class="phase-title">{{ phaseTitle }}</div>
      <div class="timer" v-if="clock">{{ clock }}</div>
      <button class="icon" @click="$emit('settings')" aria-label="Ayarlar">
        ⚙️
      </button>
    </div>
    <div class="offline" v-if="game.status !== 'online'">
      {{
        game.status === "connecting"
          ? "Bağlanıyor…"
          : "Bağlantı koptu, yeniden bağlanıyor…"
      }}
    </div>

    <div v-if="!s" class="card center muted">Odaya bağlanıyor…</div>

    <template v-else>
      <!-- my role -->
      <button
        class="my-role"
        v-if="myRole"
        @click="game.roleCardOpen = true"
        :class="myRole.team"
      >
        <span class="em">{{ myRole.emoji }}</span>
        <span>
          <b>{{ myRole.name }}</b>
          <small>{{
            s.me.alive ? "rolünü görmek için dokun" : "öldün · izliyorsun"
          }}</small>
        </span>
      </button>
      <div class="my-role st" v-if="isSt">
        <span class="em">🎙️</span>
        <span
          ><b>Anlatıcı sensin</b
          ><small>Her şeyi sen görüyorsun, oyunu sen ilerletirsin</small></span
        >
      </div>

      <!-- ========== LOBBY ========== -->
      <template v-if="phase === 'lobby'">
        <div class="card" v-if="!s.me.seated && !isSt">
          <h3>Adın ne?</h3>
          <div class="inline">
            <input
              class="field"
              v-model="nameInput"
              maxlength="24"
              placeholder="Adın"
              @keyup.enter="sit"
            />
            <button class="btn primary" @click="sit">Otur</button>
          </div>
        </div>

        <div class="card center">
          <div class="muted">Oda kodu</div>
          <div class="big-code">{{ game.code }}</div>
          <button class="btn" @click="share">📨 Davet linkini paylaş</button>
        </div>

        <div class="card">
          <h3>Oyuncular ({{ s.players.length }})</h3>
          <ul class="names">
            <li v-for="p in s.players" :key="p.id">
              <span class="dot" :class="{ on: p.online }"></span>
              {{ p.name }}
              <small v-if="p.id === s.me.id" class="muted">(sen)</small>
              <button
                v-if="s.me.isOwner && p.id !== s.me.id"
                class="x"
                @click="kick(p)"
              >
                ✕
              </button>
            </li>
          </ul>
          <p v-if="!s.players.length" class="muted">Henüz kimse yok.</p>
          <div class="chips" v-if="s.setup">
            <span class="chip">🧛 {{ s.setup.vampir }} Vampir</span>
            <span class="chip" v-if="s.setup.doktor"
              >🩺 {{ s.setup.doktor }} Doktor</span
            >
            <span class="chip">👁️ {{ s.setup.gozcu }} Gözcü</span>
            <span class="chip">🧑‍🌾 {{ s.setup.koylu }} Köylü</span>
          </div>
          <p v-else class="muted">En az {{ s.min }} oyuncu gerekiyor.</p>
        </div>

        <div class="card" v-if="s.me.isOwner">
          <template v-if="s.mode === 'auto'">
            <div class="settings">
              <label>
                Gündüz süresi
                <select
                  :value="s.settings.dayMinutes"
                  @change="setting('dayMinutes', $event)"
                >
                  <option v-for="m in [2, 3, 5, 8, 12]" :key="m" :value="m">
                    {{ m }} dakika
                  </option>
                </select>
              </label>
              <label>
                Gece süresi
                <select
                  :value="s.settings.nightSeconds"
                  @change="setting('nightSeconds', $event)"
                >
                  <option
                    v-for="m in [30, 45, 60, 90, 120]"
                    :key="m"
                    :value="m"
                  >
                    {{ m }} saniye
                  </option>
                </select>
              </label>
            </div>
          </template>
          <button
            class="btn primary"
            :class="{ disabled: s.players.length < s.min }"
            @click="start"
          >
            ▶️ Oyunu başlat
          </button>
        </div>
        <p class="center muted" v-else-if="s.me.seated">
          Oyunu kuran kişi herkes gelince başlatacak.
        </p>
      </template>

      <!-- watching a running game -->
      <div
        class="card center muted"
        v-else-if="!s.me.seated && !isSt && phase !== 'over'"
      >
        Oyun başlamış, şu an izleyicisin. Bir sonraki oyunda katılabilirsin.
      </div>

      <!-- ========== ROLES ========== -->
      <div class="card center" v-if="phase === 'roles'">
        <p>Herkes rolüne baksın ve kimseye göstermesin.</p>
        <p class="muted" v-if="s.mode === 'auto'">Gece birazdan çöküyor…</p>
        <button class="btn primary" v-if="isSt" @click="act('next')">
          🌙 Geceyi başlat
        </button>
      </div>

      <!-- ========== NIGHT (player) ========== -->
      <div class="card night" v-if="phase === 'night' && s.night">
        <h3>{{ nightTitle }}</h3>
        <p>{{ nightHelp }}</p>
        <div
          v-if="seerResult"
          class="seer-result"
          :class="{ bad: seerResult.vampir }"
        >
          {{
            seerResult.vampir
              ? "🧛 " + seerResult.name + " bir VAMPİR!"
              : "✅ " + seerResult.name + " vampir değil."
          }}
        </div>
        <div
          class="targets"
          v-if="!(s.night.action === 'gozcu' && s.night.done)"
        >
          <button
            v-for="p in nightTargets"
            :key="p.id"
            :disabled="!p.allowed"
            :class="{ selected: s.night.target === p.id }"
            @click="nightPick(p)"
          >
            {{ p.name }}
            <small v-if="p.note">{{ p.note }}</small>
          </button>
        </div>
        <div v-if="s.night.team && s.night.team.length > 1" class="team">
          <b>Vampir ekibin:</b>
          <div v-for="v in s.night.team" :key="v.id">
            {{ v.name }} → {{ v.target ? nameOf(v.target) : "henüz seçmedi" }}
          </div>
        </div>
        <p class="done" v-if="s.night.done && s.night.action !== 'gozcu'">
          ✔ Seçimin kaydedildi. Sabaha kadar değiştirebilirsin. Şimdi gözlerini
          kapat.
        </p>
      </div>
      <div
        class="card center muted"
        v-else-if="phase === 'night' && s.me.seated && !s.me.alive"
      >
        Öldün. Gece boyunca bekle.
      </div>

      <!-- ========== NIGHT (storyteller) ========== -->
      <div class="card" v-if="phase === 'night' && isSt">
        <h3>Gece seçimleri</h3>
        <ul class="st-night">
          <li>
            🧛 Vampirler: <b>{{ vampSummary || "henüz seçmediler" }}</b>
          </li>
          <li v-if="hasAlive('doktor')">
            🩺 Doktor korudu:
            <b>{{ nameOf(st.night.doktor) || "henüz seçmedi" }}</b>
          </li>
          <li v-if="hasAlive('gozcu')">
            👁️ Gözcü baktı:
            <b>{{ nameOf(st.night.gozcu) || "henüz seçmedi" }}</b>
          </li>
        </ul>
        <p :class="st.night.ready ? 'ok' : 'muted'">
          {{
            st.night.ready
              ? "✔ Herkes seçimini yaptı."
              : "Seçimler bekleniyor…"
          }}
        </p>
        <button class="btn primary" @click="act('next')">
          ☀️ Sabahı getir
        </button>
      </div>

      <!-- ========== DAY ========== -->
      <template v-if="phase === 'day'">
        <div class="card banner" v-if="s.lastNight">
          <template v-if="s.lastNight.died.length">
            🩸 Bu gece <b>{{ s.lastNight.died[0].name }}</b> öldü ({{
              roleName(s.lastNight.died[0].role)
            }}).
          </template>
          <template v-else-if="s.lastNight.saved"
            >🩺 Doktor bu gece birini kurtardı! Kimse ölmedi.</template
          >
          <template v-else>🌅 Bu gece kimse ölmedi.</template>
        </div>
        <div class="card">
          <h3>Oylama</h3>
          <p class="muted" v-if="s.me.alive && s.me.seated">
            Şüphelendiğin kişiye dokun. Oyunu istediğin zaman değiştirebilirsin.
          </p>
          <div class="votes">
            <button
              v-for="p in alivePlayers"
              :key="p.id"
              class="vote-row"
              :class="{ mine: myVote === p.id, me: p.id === s.me.id }"
              :disabled="!canVote || p.id === s.me.id"
              @click="vote(p.id)"
            >
              <span class="who">
                {{ p.name }} <small v-if="p.id === s.me.id">(sen)</small>
                <em v-if="votersOf(p.id).length">{{
                  votersOf(p.id).join(", ")
                }}</em>
              </span>
              <span class="count" v-if="countOf(p.id)">{{
                countOf(p.id)
              }}</span>
            </button>
            <button
              class="vote-row pass"
              :class="{ mine: myVote === 'pass' }"
              :disabled="!canVote"
              @click="vote('pass')"
            >
              <span class="who">
                🤷 Pas geç
                <em v-if="votersOf('pass').length">{{
                  votersOf("pass").join(", ")
                }}</em>
              </span>
              <span class="count" v-if="countOf('pass')">{{
                countOf("pass")
              }}</span>
            </button>
          </div>
          <p class="settle" v-if="settle">
            Herkes oy verdi. Oylar {{ settle }} sn sonra sayılacak…
          </p>
          <p class="muted small">
            {{ votedCount }}/{{ alivePlayers.length }} kişi oy verdi. En çok oyu
            alan asılır; eşitlikte kimse asılmaz.
          </p>
          <button class="btn danger" v-if="isSt" @click="act('next')">
            ⚖️ Oylamayı bitir
          </button>
        </div>
      </template>

      <!-- ========== DUSK ========== -->
      <div class="card center" v-if="phase === 'dusk'">
        <p v-if="s.executed">
          ⚰️ <b>{{ s.executed.name }}</b> asıldı. O bir
          <b>{{ s.roles[s.executed.role].was }}</b
          >.
        </p>
        <p v-else>Bugün kimse asılmadı.</p>
        <p class="muted" v-if="s.mode === 'auto'">Gece birazdan çöküyor…</p>
        <button class="btn primary" v-if="isSt" @click="act('next')">
          🌙 Geceyi başlat
        </button>
      </div>

      <!-- ========== OVER ========== -->
      <template v-if="phase === 'over'">
        <div class="card center winner" :class="s.winner">
          <div class="big">{{ s.winner === "vampir" ? "🧛" : "🎉" }}</div>
          <h2>
            {{
              s.winner === "vampir" ? "Vampirler kazandı!" : "Köylüler kazandı!"
            }}
          </h2>
        </div>
        <div class="card">
          <h3>Roller</h3>
          <ul class="roles">
            <li v-for="p in s.players" :key="p.id" :class="{ dead: !p.alive }">
              <span>{{ p.name }}</span>
              <b :class="p.role"
                >{{ roleEmoji(p.role) }} {{ roleName(p.role) }}</b
              >
            </li>
          </ul>
          <button
            class="btn primary"
            v-if="s.me.isOwner"
            @click="act('newGame')"
          >
            🔁 Yeni oyun
          </button>
          <p class="muted center" v-else>Yeni oyunu oda sahibi başlatabilir.</p>
        </div>
      </template>

      <!-- seer notes -->
      <div class="card" v-if="s.seerLog.length && phase !== 'over'">
        <h3>👁️ Gözcü notların</h3>
        <div v-for="(r, i) in s.seerLog" :key="i">
          {{ r.round }}. gece: <b>{{ r.name }}</b> —
          {{ r.vampir ? "VAMPİR 🧛" : "vampir değil" }}
        </div>
      </div>

      <!-- players (during the game) -->
      <div class="card" v-if="!['lobby', 'over'].includes(phase)">
        <h3>Köy</h3>
        <ul class="roles">
          <li v-for="p in s.players" :key="p.id" :class="{ dead: !p.alive }">
            <span>
              <span class="dot" :class="{ on: p.online }"></span>
              {{ p.alive ? "" : "💀 " }}{{ p.name }}
              <small v-if="p.id === s.me.id" class="muted">(sen)</small>
            </span>
            <span class="right">
              <b v-if="p.role" :class="p.role"
                >{{ roleEmoji(p.role) }} {{ roleName(p.role) }}</b
              >
              <button v-if="isSt" class="mini" @click="stToggle(p)">
                {{ p.alive ? "Öldür" : "Dirilt" }}
              </button>
            </span>
          </li>
        </ul>
      </div>

      <!-- story so far -->
      <div class="card log" v-if="s.log.length">
        <h3>Olanlar</h3>
        <p v-for="(line, i) in reversedLog" :key="i">{{ line }}</p>
      </div>
    </template>
  </div>
</template>

<script>
import { game, act, setName, toast, shareLink } from "../game";
import { unlockVoice } from "../voice";

export default {
  data() {
    return { game, now: Date.now(), nameInput: game.name };
  },
  computed: {
    s() {
      return game.state;
    },
    phase() {
      return this.s ? this.s.phase : "";
    },
    isSt() {
      return !!this.s && this.s.me.isStoryteller;
    },
    st() {
      return (this.s && this.s.storyteller) || { night: {}, allVoted: false };
    },
    myRole() {
      return this.s && this.s.me.role ? this.s.roles[this.s.me.role] : null;
    },
    elapsed() {
      return Math.max(0, this.now - game.receivedAt);
    },
    clock() {
      if (!this.s || !this.s.remaining) return "";
      const sec = Math.max(
        0,
        Math.round((this.s.remaining - this.elapsed) / 1000),
      );
      return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
    },
    settle() {
      if (!this.s || !this.s.settle) return 0;
      return Math.max(0, Math.round((this.s.settle - this.elapsed) / 1000));
    },
    phaseTitle() {
      const r = this.s ? this.s.round : 0;
      return (
        {
          lobby: "Bekleme odası",
          roles: "Roller dağıtıldı",
          night: `🌙 ${r}. Gece`,
          day: `☀️ ${r}. Gün`,
          dusk: "🌆 Akşam",
          over: "🏁 Oyun bitti",
        }[this.phase] || ""
      );
    },
    alivePlayers() {
      return this.s ? this.s.players.filter((p) => p.alive) : [];
    },
    myVote() {
      return this.s ? this.s.votes[this.s.me.id] : null;
    },
    canVote() {
      return (
        this.s && this.s.me.seated && this.s.me.alive && this.phase === "day"
      );
    },
    votedCount() {
      return this.alivePlayers.filter((p) => this.s.votes[p.id]).length;
    },
    nightTitle() {
      return {
        vampir: "🧛 Kurbanını seç",
        doktor: "🩺 Kimi koruyacaksın?",
        gozcu: "👁️ Kimi araştıracaksın?",
        koylu: "🧑‍🌾 Uyuyorsun",
      }[this.s.night.action];
    },
    nightHelp() {
      return {
        vampir:
          "Diğer vampirlerle aynı kişiyi seçin. Sabah en çok seçilen kişiye saldırılır.",
        doktor:
          "Seçtiğin kişi bu gece vampirlerden korunur. Kendini de seçebilirsin, ama aynı kişiyi iki gece üst üste koruyamazsın.",
        gozcu:
          "Seçtiğin kişinin vampir olup olmadığını hemen öğreneceksin. Gecede bir kez.",
        koylu:
          "Kimse anlamasın diye sen de şüphelendiğin birini seç. Bunun hiçbir etkisi yok.",
      }[this.s.night.action];
    },
    nightTargets() {
      const s = this.s;
      const action = s.night.action;
      return this.alivePlayers.map((p) => {
        let allowed = true;
        let note = "";
        if (action === "vampir" && p.role === "vampir") {
          allowed = false;
          note = "vampir";
        }
        if (action === "doktor" && p.id === s.night.forbidden) {
          allowed = false;
          note = "dün korundu";
        }
        if ((action === "gozcu" || action === "koylu") && p.id === s.me.id)
          allowed = false;
        if (p.id === s.me.id && allowed) note = "sen";
        return { ...p, allowed, note };
      });
    },
    seerResult() {
      if (!this.s || this.s.night.action !== "gozcu") return null;
      const last = this.s.seerLog[this.s.seerLog.length - 1];
      return last && last.round === this.s.round ? last : null;
    },
    vampSummary() {
      const vamp = this.st.night.vamp || {};
      return Object.keys(vamp)
        .map((v) => this.nameOf(v) + " → " + this.nameOf(vamp[v]))
        .join(", ");
    },
    reversedLog() {
      return this.s.log.slice().reverse();
    },
  },
  mounted() {
    this.timer = setInterval(() => (this.now = Date.now()), 1000);
  },
  beforeDestroy() {
    clearInterval(this.timer);
  },
  methods: {
    act(type, params) {
      unlockVoice();
      act(type, params);
    },
    nameOf(id) {
      const p = this.s && this.s.players.find((x) => x.id === id);
      return p ? p.name : "";
    },
    roleName(id) {
      return id && this.s.roles[id] ? this.s.roles[id].name : "?";
    },
    roleEmoji(id) {
      return id && this.s.roles[id] ? this.s.roles[id].emoji : "";
    },
    hasAlive(role) {
      return this.s.players.some((p) => p.alive && p.role === role);
    },
    votersOf(target) {
      return Object.keys(this.s.votes)
        .filter((v) => this.s.votes[v] === target)
        .map((v) => this.nameOf(v));
    },
    countOf(target) {
      return this.votersOf(target).length;
    },
    sit() {
      setName(this.nameInput);
      if (!game.name) toast("Önce adını yaz.", "warning");
    },
    async share() {
      const url = shareLink();
      const text = `Vampir Köylü oynuyoruz! Oda kodu: ${game.code}`;
      try {
        if (navigator.share) {
          await navigator.share({ title: "Vampir Köylü", text, url });
          return;
        }
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
      try {
        await navigator.clipboard.writeText(url);
        toast("Davet linki kopyalandı.", "success");
      } catch (e) {
        prompt("Bu linki arkadaşlarına gönder:", url);
      }
    },
    setting(key, event) {
      this.act("settings", {
        ...this.s.settings,
        [key]: parseInt(event.target.value, 10),
      });
    },
    start() {
      if (this.s.players.length < this.s.min) {
        toast(`En az ${this.s.min} oyuncu gerekiyor.`, "warning");
        return;
      }
      if (confirm(`Oyun ${this.s.players.length} oyuncuyla başlasın mı?`))
        this.act("start");
    },
    kick(p) {
      if (confirm(`${p.name} odadan çıkarılsın mı?`))
        this.act("kick", { target: p.id });
    },
    nightPick(p) {
      if (!p.allowed) return;
      if (
        this.s.night.action === "gozcu" &&
        !confirm(
          `${p.name} araştırılsın mı? Gecede sadece bir kez seçebilirsin.`,
        )
      ) {
        return;
      }
      this.act("night", { target: p.id });
    },
    vote(target) {
      if (!this.canVote) return;
      this.act("vote", { target: this.myVote === target ? null : target });
    },
    stToggle(p) {
      const verb = p.alive ? "öldürülsün" : "diriltilsin";
      if (confirm(`${p.name} ${verb} mi?`))
        this.act(p.alive ? "kill" : "revive", { target: p.id });
    },
  },
};
</script>

<style scoped lang="scss">
@import "../vars";

.bar {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: -12px -14px 4px;
  padding: calc(8px + env(safe-area-inset-top)) 12px 8px;
  background: rgba(5, 6, 12, 0.88);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid $line;
}
.code {
  border: 1px solid rgba(233, 180, 76, 0.5);
  background: rgba(233, 180, 76, 0.12);
  color: $gold;
  font-weight: 800;
  letter-spacing: 0.15em;
  border-radius: 10px;
  padding: 6px 10px;
  font-size: 15px;
  cursor: pointer;
  span {
    letter-spacing: 0;
  }
}
.phase-title {
  flex: 1;
  font-family: "Cinzel", Georgia, serif;
  font-weight: 700;
  font-size: 17px;
  text-align: center;
}
.timer {
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  color: $gold;
}
.icon {
  background: none;
  border: 0;
  font-size: 22px;
  cursor: pointer;
  padding: 4px;
}
.offline {
  text-align: center;
  background: rgba(179, 18, 29, 0.85);
  border-radius: 10px;
  padding: 6px;
  margin: 8px 0;
  font-size: 14px;
}
.center {
  text-align: center;
}
h3 {
  margin: 0 0 8px;
  font-size: 19px;
}
.my-role {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  margin: 10px 0 0;
  padding: 10px 14px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(30, 40, 80, 0.55);
  color: $text;
  text-align: left;
  cursor: pointer;
  &.vampir {
    background: rgba(90, 10, 20, 0.6);
  }
  &.st {
    background: rgba(233, 180, 76, 0.12);
    cursor: default;
  }
  .em {
    font-size: 34px;
  }
  b {
    display: block;
    font-size: 18px;
  }
  small {
    color: $muted;
  }
}
.inline {
  display: flex;
  gap: 8px;
  .btn {
    width: auto;
    margin: 0;
  }
}
.big-code {
  font-size: 54px;
  font-weight: 900;
  letter-spacing: 0.2em;
  color: $gold;
  margin: 2px 0 4px;
  padding-left: 0.2em;
}
.names {
  list-style: none;
  padding: 0;
  margin: 0 0 10px;
  li {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    border-bottom: 1px solid $line;
    font-size: 17px;
  }
  .x {
    margin-left: auto;
    background: none;
    border: 0;
    color: $muted;
    font-size: 18px;
    padding: 6px 10px;
    cursor: pointer;
  }
}
.dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #555;
  &.on {
    background: #3ddc84;
  }
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  padding: 5px 10px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 14px;
}
.settings {
  display: flex;
  gap: 10px;
  label {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 14px;
    color: $muted;
  }
  select {
    min-height: 44px;
    border-radius: 10px;
    background: #151826;
    color: $text;
    border: 1px solid rgba(255, 255, 255, 0.2);
    font-size: 16px;
    padding: 0 8px;
  }
}
.night {
  border-color: rgba(123, 108, 255, 0.5);
}
.targets {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 10px 0;
  button {
    min-height: 54px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.06);
    color: $text;
    font-size: 17px;
    font-weight: 600;
    cursor: pointer;
    small {
      display: block;
      font-weight: 400;
      font-size: 12px;
      color: $muted;
    }
    &.selected {
      background: rgba(123, 108, 255, 0.45);
      border-color: #b4a9ff;
    }
    &:disabled {
      opacity: 0.35;
    }
  }
}
.team {
  font-size: 15px;
  background: rgba(179, 18, 29, 0.18);
  border-radius: 10px;
  padding: 8px 10px;
}
.done {
  color: #9be7b4;
}
.seer-result {
  font-size: 20px;
  font-weight: 800;
  text-align: center;
  padding: 14px;
  border-radius: 12px;
  background: rgba(47, 158, 90, 0.25);
  margin: 10px 0;
  &.bad {
    background: rgba(179, 18, 29, 0.35);
  }
}
.st-night {
  padding-left: 0;
  list-style: none;
  li {
    margin: 6px 0;
  }
}
.ok {
  color: #9be7b4;
}
.banner {
  font-size: 17px;
  border-left: 4px solid $gold;
}
.votes {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 8px 0;
}
.vote-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 52px;
  padding: 6px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.05);
  color: $text;
  font-size: 17px;
  text-align: left;
  cursor: pointer;
  .who {
    display: flex;
    flex-direction: column;
  }
  em {
    font-style: normal;
    font-size: 13px;
    color: $muted;
  }
  .count {
    min-width: 34px;
    height: 34px;
    border-radius: 17px;
    background: $blood;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
  }
  &.mine {
    border-color: $gold;
    background: rgba(233, 180, 76, 0.18);
  }
  &:disabled {
    cursor: default;
  }
  &.me:disabled {
    opacity: 0.7;
  }
  &.pass .count {
    background: #555;
  }
}
.settle {
  color: $gold;
  font-weight: 700;
}
.small {
  font-size: 14px;
}
.winner {
  .big {
    font-size: 80px;
  }
  h2 {
    margin: 4px 0;
    font-size: 30px;
    color: $gold;
  }
  &.vampir h2 {
    color: #ff5a5f;
  }
}
.roles {
  list-style: none;
  padding: 0;
  margin: 0 0 8px;
  li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    min-height: 42px;
    border-bottom: 1px solid $line;
    &.dead > span:first-child {
      opacity: 0.55;
    }
  }
  .right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  b.vampir {
    color: #ff5a5f;
  }
  b.doktor {
    color: #7fd6ff;
  }
  b.gozcu {
    color: #c9a7ff;
  }
}
.mini {
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.06);
  color: $text;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 13px;
  cursor: pointer;
}
.log p {
  margin: 6px 0;
  font-size: 15px;
  line-height: 1.4;
  color: $muted;
  &:first-of-type {
    color: $text;
  }
}
</style>
