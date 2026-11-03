<template>
  <div class="page home">
    <!-- me: photo, name, settings -->
    <div class="me-bar">
      <div class="profile-strip">
        <button class="photo-btn" @click="choosePhoto" aria-label="Profil fotoğrafı">
          <Avatar v-if="game.myPhoto" :name="name || '?'" :size="54" :src="game.myPhoto" />
          <img v-else class="default-avatar" src="static/default-avatar-v4.webp" alt="" />
          <span class="cam">📷</span>
        </button>
        <div class="identity">
          <input
            id="name"
            class="name-in"
            v-model="name"
            maxlength="24"
            placeholder="Adın"
            autocomplete="nickname"
            @change="saveName"
          />
          <span class="level-line">Seviye {{ level }}</span>
          <span class="xp-track"><i :style="{ width: levelPct + '%' }"></i></span>
        </div>
      </div>
      <div class="currency-bar" aria-label="Altın bakiyesi">
        <img src="static/ic-coin-v6.webp" alt="" />
        <strong>{{ coins }}</strong>
        <button @click="profileTab = 'shop'" aria-label="Mağazayı aç">+</button>
      </div>
      <div class="header-actions">
        <button class="icon" @click="askNotifications" aria-label="Bildirimler">
          <img src="static/ic-bell.webp" alt="" />
        </button>
        <button class="icon" @click="tab = 'square'" aria-label="Mesajlar">
          <img src="static/ic-mail-v6.webp" alt="" />
        </button>
        <button class="icon" @click="$emit('settings')" aria-label="Ayarlar">
          <img src="static/ic-settings.webp" alt="" />
        </button>
      </div>
    </div>

    <!-- ========== PLAY ========== -->
    <section v-if="tab === 'play'" class="play">
      <h1 class="sr-only">Vampir Köylü</h1>
      <img
        class="home-logo"
        src="static/darkspire-logo.webp"
        alt="Darkspire · Vampir Köylü"
      />

      <div class="hero-actions">
        <button class="panel-btn play-btn" :disabled="busy" @click="newRoom">
          ▶ Oyun Kur
        </button>
        <button
          class="panel-btn join-open"
          :aria-expanded="showJoin ? 'true' : 'false'"
          aria-controls="join-form"
          @click="showJoin = !showJoin"
        >
          <svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="9" cy="8" r="3" />
            <circle cx="17" cy="9" r="2.5" />
            <path d="M2 20c0-4 2.7-6.5 7-6.5s7 2.5 7 6.5H2Zm14-5.8c3.5 0 6 2.2 6 5.8h-4" />
          </svg>
          Odaya Katıl
        </button>
      </div>

      <div id="join-form" class="join" v-if="showJoin">
        <input
          class="field code"
          v-model="code"
          maxlength="4"
          placeholder="ODA KODU"
          autocapitalize="characters"
          autocomplete="off"
          @keyup.enter="joinRoom"
        />
        <button
          class="join-btn"
          :disabled="code.length !== 4"
          @click="joinRoom"
        >
          Katıl
        </button>
      </div>

      <div class="quick">
        <button class="art-tile" :disabled="busy" @click="tutorial">
          <img src="static/tile-tutorial.webp" alt="" />
          <span class="label">Öğretici oyun</span>
        </button>
        <button class="art-tile" @click="profileTab = 'top'">
          <img src="static/tile-rank.webp" alt="" />
          <span class="label">Sıralama</span>
        </button>
        <button class="art-tile" @click="profileTab = 'shop'">
          <img src="static/tile-shop-v2.webp" alt="" loading="lazy" />
          <span class="label">Mağaza</span>
        </button>
        <button class="art-tile" @click="tasksOpen = true">
          <img src="static/tile-badges-v2.webp" alt="" loading="lazy" />
          <span class="label">Görevler</span>
        </button>
      </div>

      <p class="champion" v-if="champion" @click="profileTab = 'top'">
        👑 Geçen haftanın şampiyonu: <b>{{ champion.name }}</b> ({{
          champion.wins
        }}
        galibiyet)
      </p>

      <div class="my-rooms" v-if="rooms.length">
        <h4>Odalarım</h4>
        <div class="room-row" v-for="r in rooms" :key="r.code">
          <b class="rc">{{ r.code }}</b>
          <small class="muted">
            {{ r.mode === "human" ? "🎙️ anlatıcılı" : "🤖 otomatik" }}
          </small>
          <button class="btn small primary" @click="reopen(r)">Aç</button>
          <button class="x" @click="forget(r)" aria-label="Sil">✕</button>
        </div>
      </div>

      <details class="rules">
        <summary>Nasıl oynanır?</summary>
        <p>
          Köyde gizli <b>vampirler</b> var. Herkes rolünü sadece kendi
          telefonunda görür.
        </p>
        <p>
          🌙 <b>Gece</b> herkes telefonuna bakar. Vampirler birlikte bir kurban
          seçer, 🩺 Doktor birini korur, 👁️ Gözcü birinin vampir olup olmadığını
          öğrenir. Diğerleri de (iz bırakmamak için) şüphelendiği birini seçer.
        </p>
        <p>
          ☀️ <b>Gündüz</b> gece ne olduğu açıklanır. Konuşun, tartışın ve
          şüphelendiğiniz kişiye oy verin. En çok oyu alan asılır; eşitlikte
          kimse asılmaz. Ölenlerin rolü açıklanır.
        </p>
        <p>
          🏁 Bütün vampirler ölürse <b>köylüler</b>, vampirler köylülerin
          sayısına ulaşırsa <b>vampirler</b> kazanır.
        </p>
        <p class="muted">4–20 oyuncu. Oyunu kuran kişi başlatır.</p>
      </details>

    </section>

    <!-- ========== TOWN SQUARE ========== -->
    <section v-else-if="tab === 'square'">
      <OnlineList />
      <LobbyChat />
    </section>

    <!-- new room sheet -->
    <div class="sheet-bg" v-if="creating" @click.self="creating = false">
      <div class="sheet create">
        <h3>Yeni oda</h3>
        <button class="mode" :disabled="busy" @click="create('auto')">
          <span class="ic">🤖</span>
          <span>
            <b>Uygulama anlatsın</b>
            <small>Anlatıcıya gerek yok: gece, oylama ve sonuç otomatik.</small>
          </span>
        </button>
        <button class="mode" :disabled="busy" @click="create('human')">
          <span class="ic">🎙️</span>
          <span>
            <b>Ben anlatıcıyım</b>
            <small
              >Sen oynamazsın; her şeyi görürsün ve oyunu sen
              ilerletirsin.</small
            >
          </span>
        </button>
        <details class="more">
          <summary>Kendi kodun ve şifre (isteğe bağlı)</summary>
          <input
            class="field code-in"
            v-model="wanted"
            maxlength="4"
            placeholder="Kendi kodun (isteğe bağlı, ör. CUMA)"
            autocapitalize="characters"
            autocomplete="off"
          />
          <p class="hint muted">
            Kendi kodunu seçersen her hafta aynı linkle toplanabilirsiniz.
          </p>
          <input
            class="field"
            v-model="roomPass"
            maxlength="20"
            placeholder="🔒 Şifre (isteğe bağlı)"
            autocomplete="off"
          />
        </details>
        <button class="btn ghost" @click="creating = false">Vazgeç</button>
      </div>
    </div>

    <Profile
      v-if="profileTab"
      :initial-tab="profileTab"
      @close="profileTab = null"
    />

    <div class="sheet-bg" v-if="tasksOpen" @click.self="tasksOpen = false">
      <div class="sheet feature-sheet">
        <img src="static/tile-badges-v2.webp" alt="" />
        <h2>Görevler</h2>
        <p>Oynadıkça bu hedefleri tamamlarsın.</p>
        <div class="task-row" v-for="task in tasks" :key="task.title">
          <div><b>{{ task.title }}</b><small>{{ task.current }}/{{ task.goal }}</small></div>
          <span class="task-track"><i :style="{ width: (100 * task.current / task.goal) + '%' }"></i></span>
        </div>
        <button class="btn ghost" @click="tasksOpen = false">Kapat</button>
      </div>
    </div>

    <div class="sheet-bg" v-if="clanOpen" @click.self="clanOpen = false">
      <div class="sheet feature-sheet">
        <img src="static/nav-clan-v6.webp" alt="" />
        <h2>Klan</h2>
        <p>Klanlar yakında açılacak.</p>
        <button class="btn ghost" @click="clanOpen = false">Kapat</button>
      </div>
    </div>

    <!-- bottom tabs -->
    <nav class="tabs">
      <button :class="{ on: tab === 'play' }" @click="tab = 'play'">
        <img src="static/nav-home-v6.webp" alt="" />
        Ana Menü
      </button>
      <button :class="{ on: tab === 'square' }" @click="tab = 'square'">
        <img src="static/nav-rooms-v6.webp" alt="" />
        Odalar
        <i class="badge" v-if="others">{{ others }}</i>
      </button>
      <button @click="profileTab = 'me'">
        <img src="static/nav-profile-v6.webp" alt="" />
        Profil
      </button>
      <button @click="clanOpen = true">
        <img src="static/nav-clan-v6.webp" alt="" />
        Klan
      </button>
      <button @click="profileTab = 'badges'">
        <img src="static/nav-collection-v6.webp" alt="" />
        Koleksiyon
      </button>
    </nav>
  </div>
</template>

<script>
import {
  game,
  setName,
  createRoom,
  join,
  toast,
  setMyPhoto,
  savedRooms,
  forgetRoom,
  fetchLeaderboard,
} from "../game";
import { unlockVoice } from "../voice";
import { askNotifications } from "../notifications";
import Profile from "./Profile";
import Avatar from "./Avatar";
import OnlineList from "./OnlineList";
import LobbyChat from "./LobbyChat";
import { lobby } from "../lobby";
import { pickPhoto } from "../photo";
import { progress, levelFor, xpForLevel } from "../progress";

export default {
  components: { Profile, Avatar, OnlineList, LobbyChat },
  data() {
    return {
      profileTab: null,
      clanOpen: false,
      tasksOpen: false,
      tab: "play",
      creating: false,
      lobby,
      game,
      progress,
      showJoin: false,
      wanted: "",
      roomPass: "",
      champion: null,
      rooms: savedRooms(),
      name: game.name,
      code: "",
      busy: false,
    };
  },
  computed: {
    level() {
      return levelFor(this.progress.totals.xp);
    },
    levelPct() {
      const start = xpForLevel(this.level);
      const end = xpForLevel(this.level + 1);
      return Math.min(
        100,
        Math.round((100 * (this.progress.totals.xp - start)) / (end - start)),
      );
    },
    coins() {
      return (this.progress.totals.coins || 0).toLocaleString("tr-TR");
    },
    tasks() {
      const games = this.progress.totals.games || 0;
      const wins = this.progress.totals.wins || 0;
      return [
        { title: "İlk oyununu tamamla", current: Math.min(games, 1), goal: 1 },
        { title: "Üç oyun oyna", current: Math.min(games, 3), goal: 3 },
        { title: "İlk galibiyetini kazan", current: Math.min(wins, 1), goal: 1 },
        { title: "On oyun oyna", current: Math.min(games, 10), goal: 10 },
      ];
    },
    others() {
      return this.lobby.online.filter((p) => p.pub !== this.lobby.me).length;
    },
  },
  async mounted() {
    const result = await fetchLeaderboard("week");
    this.champion = result.champion || null;
  },
  watch: {
    "game.name"(value) {
      // the name typed on the welcome screen
      if (value && !this.name) this.name = value;
    },
    code(value) {
      const clean = value.toUpperCase().replace(/[^A-Z]/g, "");
      if (clean !== value) this.code = clean;
    },
    wanted(value) {
      const clean = value.toUpperCase().replace(/[^A-Z]/g, "");
      if (clean !== value) this.wanted = clean;
    },
  },
  methods: {
    askNotifications,
    async choosePhoto() {
      if (
        game.myPhoto &&
        !confirm("Fotoğrafını değiştirmek ister misin? (İptal: kaldır)")
      ) {
        setMyPhoto("");
        toast("Profil fotoğrafı kaldırıldı.", "info");
        return;
      }
      const data = await pickPhoto();
      if (data) {
        setMyPhoto(data);
        toast("Profil fotoğrafın kaydedildi 📷", "success");
      }
    },
    saveName() {
      setName(this.name);
    },
    needName() {
      this.saveName();
      if (!game.name) {
        toast("Önce adını yaz.", "warning");
        document.getElementById("name").focus();
        return true;
      }
      return false;
    },
    newRoom() {
      unlockVoice();
      if (this.needName()) return;
      this.creating = true;
    },
    async create(mode, code) {
      unlockVoice();
      if (mode === "auto" && this.needName()) return;
      if (mode === "human") this.saveName();
      const wanted = (code || this.wanted || "").toUpperCase();
      if (wanted && !/^[A-Z]{4}$/.test(wanted)) {
        toast("Oda kodu 4 harf olmalı (Türkçe karakter olmadan).", "warning");
        return;
      }
      this.busy = true;
      try {
        await createRoom(
          mode,
          wanted || undefined,
          false,
          this.roomPass.trim() || undefined,
        );
      } catch (e) {
        toast(
          e.message === "code"
            ? "Bu kod kullanılamıyor."
            : "Şu an oda kurulamadı, biraz sonra tekrar dene.",
          "warning",
        );
      }
      this.busy = false;
      this.creating = false;
    },
    async tutorial() {
      unlockVoice();
      if (this.needName()) return;
      this.busy = true;
      try {
        await createRoom("auto", undefined, true);
      } catch (e) {
        toast("Şu an açılamadı, biraz sonra tekrar dene.", "warning");
      }
      this.busy = false;
    },
    reopen(r) {
      this.create(r.mode, r.code);
    },
    forget(r) {
      forgetRoom(r.code);
      this.rooms = savedRooms();
    },
    joinRoom() {
      unlockVoice();
      if (this.needName()) return;
      join(this.code);
    },
  },
};
</script>

<style scoped lang="scss">
@import "../vars";

.home {
  padding-bottom: calc(76px + env(safe-area-inset-bottom));
}
.me-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: 36px 36px;
  align-items: center;
  gap: 3px 8px;
  .profile-strip {
    grid-column: 1;
    grid-row: 1 / 3;
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    height: 72px;
    padding: 4px 8px 4px 4px;
    border: 1px solid $line;
    border-radius: 36px 10px 10px 36px;
    background: linear-gradient(90deg, rgba(41, 10, 24, 0.95), rgba(9, 8, 15, 0.92));
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
  }
  .identity {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .name-in {
    width: 100%;
    min-width: 0;
    height: 24px;
    border: 0;
    background: transparent;
    color: $text;
    padding: 0;
    font-size: 16px;
    font-weight: 800;
    outline: none;
    text-overflow: ellipsis;
  }
  .level-line {
    color: $gold;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .xp-track {
    display: block;
    width: min(100%, 150px);
    height: 5px;
    border: 1px solid $line;
    border-radius: 6px;
    background: #17070f;
    overflow: hidden;
    i {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, #ae5d1d, #ffd58c);
    }
  }
}
.currency-bar {
  grid-column: 2;
  grid-row: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 33px;
  min-width: 112px;
  padding: 2px 3px 2px 5px;
  border: 1px solid rgba(233, 189, 112, 0.65);
  border-radius: 18px;
  background: rgba(14, 9, 13, 0.94);
  box-shadow: inset 0 1px rgba(255, 217, 138, 0.14), 0 4px 12px rgba(0, 0, 0, 0.5);
  img { width: 27px; height: 27px; object-fit: contain; }
  strong { flex: 1; text-align: center; font-size: 14px; font-variant-numeric: tabular-nums; }
  button {
    display: grid;
    place-items: center;
    width: 27px;
    height: 27px;
    padding: 0;
    border: 1px solid rgba(233, 189, 112, 0.6);
    border-radius: 50%;
    background: linear-gradient(#5c2b1c, #241015);
    color: #ffdb96;
    font-size: 21px;
    line-height: 1;
    cursor: pointer;
  }
}
.header-actions {
  grid-column: 2;
  grid-row: 2;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 5px;
}
.photo-btn {
  position: relative;
  border: 0;
  background: none;
  padding: 0;
  cursor: pointer;
  .default-avatar {
    display: block;
    width: 54px;
    height: 54px;
    object-fit: contain;
  }
  .cam {
    position: absolute;
    right: -4px;
    bottom: -4px;
    font-size: 14px;
  }
}
.icon {
  flex: none;
  width: 32px;
  height: 32px;
  background: radial-gradient(circle at 35% 25%, #44221b, #0d080d 75%);
  border: 1px solid rgba(233, 189, 112, 0.56);
  border-radius: 50%;
  padding: 5px;
  cursor: pointer;
  transition: transform 0.12s;
  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5));
  }
  &:active {
    transform: scale(0.9);
  }
}
.play {
  padding-top: 10px;
  padding-bottom: 20px;
}
.home-logo {
  display: block;
  width: min(86vw, 420px);
  height: auto;
  margin: 0 auto 12px;
  filter: drop-shadow(0 8px 20px rgba(0, 0, 0, 0.8));
}
.hero-actions {
  display: grid;
  gap: 3px;
  margin-bottom: 12px;
}
.panel-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: min(78vw, 360px);
  height: clamp(58px, 16vw, 72px);
  margin: 0 auto;
  border: 0;
  background: url("../assets/btn-crimson-v4.webp") center / 100% 100% no-repeat;
  color: #f3dcae;
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(18px, 5vw, 22px);
  font-weight: 700;
  letter-spacing: 0.01em;
  text-shadow: 0 2px 0 #542009, 0 3px 5px rgba(0, 0, 0, 0.9);
  cursor: pointer;
  filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.55));
  transition: transform 0.12s, opacity 0.2s;
  &:active {
    transform: scale(0.96);
  }
  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
}
.button-icon {
  width: 21px;
  height: 21px;
  fill: $gold;
  stroke: $gold;
  stroke-width: 1.4;
}
.play-btn {
  color: #ffe1a7;
  font-size: clamp(21px, 5.8vw, 28px);
  filter: drop-shadow(0 0 10px rgba(220, 19, 37, 0.78));
}
.join-open {
  color: #efcc8c;
  width: min(70vw, 320px);
  height: clamp(52px, 14vw, 64px);
  background-image: url("../assets/btn-amber-v4.webp");
  filter: drop-shadow(0 0 7px rgba(185, 119, 28, 0.48));
}
.join {
  display: flex;
  gap: 8px;
  max-width: 360px;
  margin: 0 auto 8px;
  .code {
    flex: 1;
    margin: 0;
    text-align: center;
    letter-spacing: 0.3em;
    font-weight: 800;
    text-transform: uppercase;
  }
  .join-btn {
    margin: 0;
    width: min(39vw, 158px);
    min-height: 50px;
    padding: 0 12px;
    border: 0;
    background: url("../assets/panel.webp") center / 100% 100% no-repeat;
    color: #f3dcae;
    font: inherit;
    font-size: clamp(13px, 3.5vw, 17px);
    font-weight: 800;
    text-shadow: 0 2px 3px rgba(0, 0, 0, 0.9);
    cursor: pointer;
    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }
}
.quick {
  display: grid;
  grid-template-columns: repeat(2, min(41vw, 160px));
  justify-content: center;
  gap: 8px;
  margin: 8px 0;
}
.art-tile {
  position: relative;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  aspect-ratio: 1;
  transition: transform 0.12s, filter 0.18s;
  &:hover {
    filter: brightness(1.12);
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.55));
  }
  .label {
    position: absolute;
    left: 11%;
    right: 11%;
    top: 60%;
    bottom: 14%;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-family: Georgia, "Times New Roman", serif;
    font-weight: 700;
    font-size: min(4.2vw, 17px);
    line-height: 1.05;
    color: #f6e0b0;
    text-shadow:
      0 2px 0 #5a2a08,
      0 3px 6px rgba(0, 0, 0, 0.8);
  }
  &:active {
    transform: scale(0.96);
  }
  &:disabled {
    opacity: 0.6;
  }
}
.tile-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 8px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(16, 18, 34, 0.75);
  color: $text;
  font: inherit;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  span {
    font-size: 26px;
  }
  &:active {
    transform: scale(0.97);
  }
}
.champion {
  text-align: center;
  font-size: 14px;
  color: $muted;
  cursor: pointer;
  b {
    color: $gold;
  }
}
.my-rooms {
  margin-top: 10px;
  h4 {
    margin: 6px 0;
    color: $muted;
    font-size: 13px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
}
.room-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  margin-bottom: 6px;
  border-radius: 12px;
  background: rgba(16, 18, 34, 0.7);
  .rc {
    font-size: 18px;
    letter-spacing: 0.15em;
    color: $gold;
  }
  small {
    flex: 1;
  }
  .btn {
    margin: 0;
    width: auto;
  }
  .x {
    border: 0;
    background: none;
    color: $muted;
    font-size: 16px;
    cursor: pointer;
  }
}
.rules {
  max-width: 320px;
  margin: 30px auto 0;
  padding: 8px 12px;
  border: 1px solid $line;
  border-radius: 10px;
  background: rgba(16, 7, 15, 0.8);
  summary {
    cursor: pointer;
    font-weight: 700;
    font-size: 13px;
    color: $gold;
    text-align: center;
  }
  p {
    line-height: 1.45;
  }
}
@media (min-width: 360px) {
  .quick {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    width: min(100%, 480px);
    gap: 4px;
    margin: clamp(96px, 15vh, 130px) auto 0;
  }
  .art-tile .label {
    font-size: clamp(10px, 2.8vw, 14px);
  }
  .rules {
    margin-top: 28vh;
  }
}
@media (min-width: 360px) and (max-height: 700px) {
  .quick { margin-top: 24px; }
}
.create {
  .mode {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    text-align: left;
    padding: 14px;
    margin-bottom: 10px;
    border-radius: 16px;
    border: 1px solid rgba(233, 180, 76, 0.45);
    background: rgba(233, 180, 76, 0.08);
    color: $text;
    font: inherit;
    cursor: pointer;
    .ic {
      font-size: 34px;
    }
    b {
      display: block;
      font-size: 17px;
    }
    small {
      color: $muted;
      font-size: 13px;
    }
    &:active {
      transform: scale(0.98);
    }
  }
  .more {
    margin: 4px 0 10px;
    summary {
      color: $muted;
      font-size: 14px;
      cursor: pointer;
      margin-bottom: 8px;
    }
  }
  .hint {
    font-size: 13px;
    margin: 4px 0 8px;
  }
}
.feature-sheet {
  text-align: center;
  > img {
    display: block;
    width: 72px;
    height: 72px;
    object-fit: contain;
    margin: 0 auto 4px;
  }
  h2 { margin: 0 0 6px; }
  p { margin: 0 0 14px; color: $muted; font-size: 14px; }
  > .btn { max-width: 320px; margin: 14px auto 0; }
}
.task-row {
  text-align: left;
  padding: 10px 12px;
  margin: 7px 0;
  border: 1px solid $line;
  border-radius: 12px;
  background: rgba(28, 7, 17, 0.9);
  > div { display: flex; justify-content: space-between; gap: 10px; font-size: 14px; }
  small { color: $gold; white-space: nowrap; }
}
.task-track {
  display: block;
  height: 5px;
  margin-top: 8px;
  overflow: hidden;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.1);
  i { display: block; height: 100%; background: linear-gradient(90deg, #b46125, #ffd887); }
}
.tabs {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100;
  display: flex;
  justify-content: space-around;
  padding: 4px 4px calc(4px + env(safe-area-inset-bottom));
  background: linear-gradient(180deg, rgba(46, 5, 12, 0.96), rgba(10, 3, 9, 0.98));
  border-top: 1px solid rgba(233, 180, 76, 0.6);
  button {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: none;
    color: #dbbd8e;
    font: inherit;
    font-size: clamp(10px, 2.7vw, 12px);
    font-weight: 600;
    padding: 4px 0;
    cursor: pointer;
    img {
      width: 28px;
      height: 28px;
      object-fit: contain;
      filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.8));
    }
    &.on {
      color: #ffe0a7;
      border-color: rgba(233, 180, 76, 0.55);
      background: linear-gradient(180deg, rgba(124, 15, 31, 0.92), rgba(42, 5, 15, 0.94));
      box-shadow: inset 0 1px rgba(255, 216, 143, 0.2), 0 0 12px rgba(183, 38, 46, 0.3);
      text-shadow: 0 0 6px rgba(233, 180, 76, 0.5);
    }
  }
  .badge {
    position: absolute;
    top: 2px;
    left: 56%;
    min-width: 18px;
    height: 18px;
    border-radius: 9px;
    background: #2fbf71;
    color: white;
    font-style: normal;
    font-size: 11px;
    line-height: 18px;
    padding: 0 4px;
  }
}
</style>
