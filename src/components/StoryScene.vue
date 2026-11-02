<template>
  <div class="scene" :class="['t-' + e.type, size, { play: playing }]">
    <!-- backgrounds -->
    <div class="bg town" v-if="dayLike"></div>
    <div class="bg sky" v-if="nightLike">
      <div class="clouds"></div>
      <span v-for="i in 14" :key="'s' + i" class="star" :style="star(i)"></span>
    </div>
    <div class="bg blood" v-if="bloody"></div>

    <!-- actors -->
    <div class="stage">
      <template v-if="e.type === 'start'">
        <span
          v-for="i in 5"
          :key="i"
          class="card-fan"
          :style="{ '--i': i - 3, animationDelay: i * 0.12 + 's' }"
          >🃏</span
        >
      </template>

      <template v-else-if="e.type === 'night'">
        <span class="moon">🌙</span>
        <span class="owl">🦉</span>
      </template>

      <template v-else-if="e.type === 'quiet'">
        <span class="moon small">🌙</span>
        <span class="zzz">💤</span>
      </template>

      <template v-else-if="e.type === 'kill'">
        <span v-for="i in 3" :key="'b' + i" class="bat" :style="bat(i)"
          >🦇</span
        >
        <span class="vampire">🧛</span>
        <span class="victim">
          <Avatar :name="e.name" :size="avatarSize" />
          <span class="drop">🩸</span>
        </span>
      </template>

      <template v-else-if="e.type === 'shot'">
        <span class="bow">🏹</span>
        <span class="arrow">➶</span>
        <span class="victim">
          <Avatar :name="e.name" :size="avatarSize" />
        </span>
      </template>

      <template v-else-if="e.type === 'poison'">
        <span class="potion-big">🧪</span>
        <span v-for="i in 5" :key="'bub' + i" class="bubble" :style="spark(i)"
          >🫧</span
        >
        <span class="victim">
          <Avatar :name="e.name" :size="avatarSize" />
        </span>
      </template>

      <template v-else-if="e.type === 'grief' || e.type === 'lovers'">
        <span class="heart" :class="{ broken: e.type === 'grief' }">{{
          e.type === "grief" ? "💔" : "💘"
        }}</span>
        <span v-for="i in 6" :key="'h' + i" class="spark" :style="spark(i)">{{
          e.type === "grief" ? "🖤" : "💗"
        }}</span>
      </template>

      <template v-else-if="e.type === 'defense'">
        <span class="speech">🗣️</span>
        <span class="scale">⚖️</span>
      </template>

      <template v-else-if="e.type === 'saved'">
        <span class="vampire left">🧛</span>
        <span class="shield">🛡️</span>
        <span class="doctor">🩺</span>
      </template>

      <template v-else-if="e.type === 'day'">
        <span class="sun">☀️</span>
        <span v-for="i in 3" :key="'bird' + i" class="bird" :style="bird(i)"
          >🐦</span
        >
      </template>

      <template v-else-if="e.type === 'votes'">
        <div class="bars">
          <div v-for="(t, i) in topVotes" :key="t.name" class="bar-row">
            <span class="nm">{{ t.name }}</span>
            <span class="track">
              <span
                class="fill"
                :style="{
                  width: (100 * t.count) / maxVotes + '%',
                  animationDelay: i * 0.2 + 's',
                }"
              ></span>
            </span>
            <b>{{ t.count }}</b>
          </div>
          <div v-if="e.pass" class="bar-row pass">
            <span class="nm">Pas</span>
            <span class="track">
              <span
                class="fill"
                :style="{ width: (100 * e.pass) / maxVotes + '%' }"
              ></span>
            </span>
            <b>{{ e.pass }}</b>
          </div>
          <div v-if="!topVotes.length && !e.pass" class="empty">🤐</div>
        </div>
      </template>

      <template v-else-if="e.type === 'lastwords'">
        <span class="spot"></span>
        <span class="victim center">
          <Avatar :name="e.name" :size="avatarSize" />
        </span>
        <span class="speech">💬</span>
      </template>

      <template v-else-if="e.type === 'hang'">
        <span class="rope">🪢</span>
        <span class="victim swing">
          <Avatar :name="e.name" :size="avatarSize" dead />
        </span>
        <span class="crow">🐦‍⬛</span>
      </template>

      <template v-else-if="e.type === 'nohang' || e.type === 'tie'">
        <span class="scale">⚖️</span>
      </template>

      <template v-else-if="e.type === 'punish'">
        <span class="victim center">
          <Avatar :name="e.name" :size="avatarSize" dead />
        </span>
        <span class="gavel">🔨</span>
      </template>

      <template v-else-if="e.type === 'revive'">
        <span class="victim center rise">
          <Avatar :name="e.name" :size="avatarSize" />
        </span>
        <span v-for="i in 6" :key="'sp' + i" class="spark" :style="spark(i)"
          >✨</span
        >
      </template>

      <template v-else-if="e.type === 'win'">
        <template v-if="e.winner === 'vampir'">
          <span class="moon red">🌕</span>
          <span class="vampire big">🧛</span>
          <span v-for="i in 5" :key="'vb' + i" class="bat" :style="bat(i)"
            >🦇</span
          >
        </template>
        <template v-else-if="e.winner === 'deli'">
          <span class="trophy">🤡</span>
        </template>
        <template v-else>
          <span class="trophy">🏆</span>
        </template>
        <span
          v-for="i in 18"
          :key="'c' + i"
          class="confetti"
          :style="confetti(i)"
          >{{ e.winner === "vampir" ? "🩸" : ["🎉", "🎊", "⭐"][i % 3] }}</span
        >
      </template>

      <template v-else-if="e.type === 'mvp'">
        <span class="trophy">⭐</span>
        <span
          v-for="i in 12"
          :key="'m' + i"
          class="confetti"
          :style="confetti(i)"
          >✨</span
        >
      </template>

      <template v-else-if="e.type === 'penalty'">
        <span class="dice">🎲</span>
        <span class="dice two">🎲</span>
      </template>
    </div>

    <!-- caption -->
    <div class="caption">
      <div class="title">{{ title }}</div>
      <div class="sub" v-if="sub">{{ sub }}</div>
      <ul class="penalty-list" v-if="e.type === 'penalty' && size === 'full'">
        <li v-for="(x, i) in e.items" :key="i">
          <b>{{ x.name }}:</b> {{ x.text }}
        </li>
      </ul>
    </div>
  </div>
</template>

<script>
import Avatar from "./Avatar";

export const ROLE_NAMES = {
  vampir: "Vampir",
  koylu: "Köylü",
  doktor: "Doktor",
  gozcu: "Gözcü",
  avci: "Avcı",
  cadi: "Cadı",
  deli: "Deli",
  muhtar: "Muhtar",
  kurtadam: "Kurt Adam",
};

/** one line describing an event (also read aloud by the story player) */
export function captionFor(e) {
  const role = e.role ? ` (${ROLE_NAMES[e.role]})` : "";
  switch (e.type) {
    case "start":
      return [`Oyun başladı`, `${e.players} oyuncu, ${e.vampires} vampir`];
    case "night":
      return [`${e.round}. Gece`, "Köy uyuyor, vampirler uyanıyor…"];
    case "kill":
      return [`${e.name} öldürüldü`, `Vampirlerin kurbanı oldu${role}`];
    case "saved":
      return [
        "Doktor kurtardı!",
        "Vampirler saldırdı ama kurban hayatta kaldı",
      ];
    case "quiet":
      return ["Sessiz bir gece", "Bu gece kimse ölmedi"];
    case "day":
      return [`${e.round}. Gün`, "Köy uyanıyor ve tartışma başlıyor"];
    case "votes":
      return [
        "Oylama",
        e.tally && e.tally.length
          ? e.tally.map((t) => `${t.name} ${t.count}`).join(" · ")
          : "Kimse oy vermedi",
      ];
    case "lastwords":
      return [`${e.name} son sözlerini söylüyor`, "Köy kararını verdi"];
    case "hang":
      return [
        `${e.name} asıldı`,
        e.role ? `O bir ${ROLE_NAMES[e.role]}` : "Köyün kararı uygulandı",
      ];
    case "nohang":
      return ["Kimse asılmadı", "Köy karar veremedi"];
    case "tie":
      return ["Oylar eşit!", "Bugün kimse asılmadı"];
    case "punish":
      return [
        `${e.name} köyden kovuldu`,
        (e.how === "kick"
          ? "Oyunu bozdu"
          : e.how === "rule"
          ? "Kuralları çiğnedi"
          : "Anlatıcının kararı") + role,
      ];
    case "revive":
      return [`${e.name} hayata döndü!`, "Anlatıcının mucizesi"];
    case "win":
      if (e.winner === "deli")
        return ["Deli kazandı! 🤡", "Köy, Deli'yi asarak tuzağa düştü"];
      return e.winner === "vampir"
        ? ["Vampirler kazandı!", "Köy karanlığa gömüldü"]
        : ["Köylüler kazandı!", "Bütün vampirler yok edildi"];
    case "shot":
      return [`${e.by} ateş etti!`, `${e.name} vuruldu${role}`];
    case "poison":
      return [`${e.name} zehirlendi`, `Cadının iksiri işini gördü${role}`];
    case "grief":
      return [
        `${e.name} kederden öldü 💔`,
        `Sevdiği ${e.other} ölünce yaşayamadı${role}`,
      ];
    case "lovers":
      return ["İki kalp birleşti 💘", "Köyde gizli bir aşk var…"];
    case "defense":
      return [
        "Savunma zamanı",
        (e.names || []).join(" ve ") + " kendini savunuyor",
      ];
    case "mvp":
      return [`⭐ Oyunun yıldızı: ${e.name}`, `${e.votes} oyla seçildi`];
    case "penalty":
      return ["Ceza zamanı! 🎲", (e.items || []).map((x) => x.name).join(", ")];
  }
  return [e.text || "", ""];
}

export default {
  components: { Avatar },
  props: {
    e: { type: Object, required: true },
    size: { type: String, default: "card" },
    playing: { type: Boolean, default: true },
  },
  computed: {
    lines() {
      return captionFor(this.e);
    },
    title() {
      return this.lines[0];
    },
    sub() {
      return this.lines[1];
    },
    nightLike() {
      return (
        ["night", "quiet", "saved", "kill", "start"].includes(this.e.type) ||
        (this.e.type === "win" && this.e.winner === "vampir")
      );
    },
    dayLike() {
      return (
        [
          "day",
          "votes",
          "lastwords",
          "hang",
          "nohang",
          "tie",
          "punish",
          "revive",
          "penalty",
          "mvp",
        ].includes(this.e.type) ||
        (this.e.type === "win" && this.e.winner !== "vampir")
      );
    },
    bloody() {
      return (
        ["kill", "hang", "punish"].includes(this.e.type) ||
        (this.e.type === "win" && this.e.winner === "vampir")
      );
    },
    avatarSize() {
      return this.size === "full" ? 120 : 56;
    },
    topVotes() {
      return (this.e.tally || []).slice(0, this.size === "full" ? 6 : 3);
    },
    maxVotes() {
      const all = (this.e.tally || [])
        .map((t) => t.count)
        .concat(this.e.pass || 0);
      return Math.max(1, ...all);
    },
  },
  methods: {
    seed(i) {
      return ((this.e.n || 1) * 37 + i * 101) % 97;
    },
    star(i) {
      const s = this.seed(i);
      return {
        left: ((s * 7) % 100) + "%",
        top: ((s * 3) % 55) + "%",
        animationDelay: (s % 10) / 5 + "s",
      };
    },
    bat(i) {
      return {
        top: 12 + i * 13 + "%",
        animationDelay: i * 0.35 + "s",
      };
    },
    bird(i) {
      return { top: 14 + i * 9 + "%", animationDelay: i * 0.6 + "s" };
    },
    spark(i) {
      return { left: 30 + i * 7 + "%", animationDelay: i * 0.25 + "s" };
    },
    confetti(i) {
      const s = this.seed(i);
      return {
        left: ((s * 11) % 100) + "%",
        animationDelay: (s % 20) / 10 + "s",
        animationDuration: 2.5 + (s % 10) / 5 + "s",
      };
    },
  },
};
</script>

<style scoped lang="scss">
@import "../vars";

.scene {
  position: relative;
  overflow: hidden;
  border-radius: 14px;
  background: #070815;
  color: white;
  isolation: isolate;
  &.card {
    height: 190px;
  }
  &.full {
    position: absolute;
    inset: 0;
    border-radius: 0;
  }
  &:not(.play) * {
    animation-play-state: paused !important;
  }
}

/* ---------- backgrounds ---------- */
.bg {
  position: absolute;
  inset: 0;
  z-index: -1;
}
.town {
  overflow: hidden;
  animation: kenburns 9s ease-out both;
  /* larger than the scene so the artist's credit corner stays hidden */
  &::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: -25%;
    bottom: -25%;
    background: url("../assets/background.jpg") 40% 30% / cover no-repeat;
  }
  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      180deg,
      rgba(255, 190, 90, 0.25),
      rgba(5, 6, 12, 0.75)
    );
  }
}
.sky {
  background: linear-gradient(180deg, #000 0%, #01162e 55%, #002746 100%);
  .clouds {
    position: absolute;
    inset: 0;
    width: 300%;
    background: url("../assets/clouds.png") repeat-x center / auto 100%;
    opacity: 0.3;
    animation: drift 40s linear infinite;
  }
}
.blood {
  background: radial-gradient(
    circle at 50% 70%,
    rgba(170, 0, 20, 0.55),
    transparent 70%
  );
  animation: pulse 2.4s ease-in-out infinite;
}
.star {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: white;
  animation: twinkle 2s ease-in-out infinite;
}

/* ---------- actors ---------- */
.stage {
  position: absolute;
  inset: 0;
  font-size: 34px;
  .full & {
    font-size: 72px;
  }
  > * {
    position: absolute;
  }
}
.card-fan {
  left: 50%;
  top: 22%;
  transform-origin: 50% 160%;
  animation: fan 1s cubic-bezier(0.2, 1.4, 0.4, 1) both;
}
.moon {
  right: 14%;
  top: 8%;
  animation: rise 2.5s ease-out both;
  filter: drop-shadow(0 0 18px rgba(255, 240, 180, 0.8));
  &.small {
    right: 40%;
  }
  &.red {
    filter: hue-rotate(-40deg) saturate(3) drop-shadow(0 0 30px red);
  }
}
.owl {
  left: 12%;
  bottom: 18%;
  animation: blink 3s steps(1) infinite;
}
.zzz {
  left: 40%;
  top: 34%;
  animation: float 2.5s ease-in-out infinite;
}
.bat {
  left: -15%;
  animation: fly 3s linear infinite;
  font-size: 0.8em;
}
.vampire {
  left: 12%;
  bottom: 22%;
  animation: lunge 2.2s ease-in-out infinite;
  &.left {
    left: 6%;
  }
  &.big {
    left: 50%;
    bottom: 30%;
    transform: translateX(-50%);
    font-size: 1.6em;
    animation: hover 3s ease-in-out infinite;
  }
}
.victim {
  right: 14%;
  bottom: 24%;
  animation: faint 3s ease-in forwards;
  &.center {
    left: 50%;
    right: auto;
    transform: translateX(-50%);
    bottom: 30%;
    animation: none;
  }
  &.swing {
    left: 50%;
    right: auto;
    top: 26%;
    bottom: auto;
    transform-origin: 50% -60%;
    animation: swing 2.4s ease-in-out infinite;
  }
  &.rise {
    animation: ascend 2.5s ease-out both;
  }
  .drop {
    position: absolute;
    right: -10px;
    top: 50%;
    font-size: 0.6em;
    animation: drip 1.6s ease-in infinite;
  }
}
.shield {
  left: 46%;
  bottom: 22%;
  animation: shield 1.8s ease-out both;
  filter: drop-shadow(0 0 20px rgba(120, 200, 255, 0.9));
}
.doctor {
  right: 12%;
  bottom: 22%;
  animation: float 2.5s ease-in-out infinite;
}
.sun {
  left: 50%;
  top: 10%;
  transform: translateX(-50%);
  animation: sunrise 3s ease-out both;
  filter: drop-shadow(0 0 30px rgba(255, 200, 80, 0.9));
}
.bird {
  left: -10%;
  font-size: 0.55em;
  animation: fly 6s linear infinite;
}
.bars {
  left: 8%;
  right: 8%;
  top: 14%;
  font-size: 14px;
  .full & {
    top: 22%;
    font-size: 20px;
  }
  .bar-row {
    display: grid;
    grid-template-columns: 30% 1fr 28px;
    align-items: center;
    gap: 8px;
    margin: 6px 0;
  }
  .nm {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 700;
  }
  .track {
    height: 14px;
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.15);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #ff6a6f, $blood);
    transform-origin: left;
    animation: grow 1.2s cubic-bezier(0.2, 1, 0.3, 1) both;
  }
  .pass .fill {
    background: #888;
  }
  .empty {
    text-align: center;
    font-size: 40px;
  }
}
.spot {
  left: 50%;
  top: -20%;
  width: 70%;
  height: 140%;
  transform: translateX(-50%);
  background: radial-gradient(
    ellipse at 50% 70%,
    rgba(255, 240, 200, 0.35),
    transparent 60%
  );
  animation: pulse 2s ease-in-out infinite;
}
.speech {
  left: 60%;
  top: 18%;
  animation: float 1.6s ease-in-out infinite;
}
.rope {
  left: 50%;
  top: 2%;
  transform: translateX(-50%);
}
.crow {
  right: 10%;
  top: 12%;
  font-size: 0.7em;
  animation: hover 2s ease-in-out infinite;
}
.scale {
  left: 50%;
  top: 22%;
  transform: translateX(-50%);
  font-size: 1.5em;
  animation: wobble 2s ease-in-out infinite;
}
.gavel {
  left: 56%;
  top: 14%;
  transform-origin: 80% 80%;
  animation: strike 1.2s ease-in infinite;
}
.spark {
  bottom: 20%;
  font-size: 0.5em;
  animation: ascend-spark 2s ease-out infinite;
}
.trophy {
  left: 50%;
  top: 16%;
  transform: translateX(-50%);
  font-size: 1.5em;
  animation: bounce 1.6s ease-in-out infinite;
}
.confetti {
  top: -10%;
  font-size: 0.5em;
  animation: fall 3s linear infinite;
}
.dice {
  left: 36%;
  top: 22%;
  animation: roll 1.4s cubic-bezier(0.3, 1.4, 0.5, 1) infinite;
  &.two {
    left: 54%;
    animation-delay: 0.3s;
  }
}

.bow {
  left: 10%;
  bottom: 26%;
  animation: float 2s ease-in-out infinite;
}
.arrow {
  left: 22%;
  bottom: 34%;
  font-size: 0.8em;
  animation: arrow 1.4s ease-in infinite;
}
.potion-big {
  left: 14%;
  bottom: 24%;
  font-size: 1.3em;
  animation: wobble-p 1.6s ease-in-out infinite;
}
.bubble {
  bottom: 30%;
  font-size: 0.5em;
  animation: ascend-spark 2.2s ease-out infinite;
}
.heart {
  left: 50%;
  top: 20%;
  transform: translateX(-50%);
  font-size: 1.6em;
  animation: beat 1.2s ease-in-out infinite;
  &.broken {
    animation: shake 0.6s ease-in-out infinite;
  }
}
@keyframes arrow {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(55vw);
    opacity: 0;
  }
}
@keyframes wobble-p {
  50% {
    transform: rotate(-15deg);
  }
}
@keyframes beat {
  50% {
    transform: translateX(-50%) scale(1.2);
  }
}
@keyframes shake {
  25% {
    transform: translateX(-54%) rotate(-6deg);
  }
  75% {
    transform: translateX(-46%) rotate(6deg);
  }
}

/* ---------- caption ---------- */
.caption {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 26px 12px 10px;
  background: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.85));
  .title {
    font-family: "Cinzel", Georgia, serif;
    font-weight: 700;
    font-size: 16px;
    color: $gold;
    animation: slide-up 0.6s ease-out both;
  }
  .sub {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.85);
    animation: slide-up 0.6s 0.2s ease-out both;
  }
  .full & {
    padding: 60px 22px calc(40px + env(safe-area-inset-bottom));
    .title {
      font-size: 30px;
    }
    .sub {
      font-size: 18px;
      margin-top: 4px;
    }
  }
}
.penalty-list {
  margin: 10px 0 0;
  padding-left: 18px;
  font-size: 15px;
  max-height: 32vh;
  overflow: auto;
  li {
    margin: 4px 0;
  }
}

/* ---------- keyframes ---------- */
@keyframes kenburns {
  from {
    transform: scale(1.25) translateY(4%);
  }
  to {
    transform: scale(1.05);
  }
}
@keyframes drift {
  to {
    transform: translateX(-66%);
  }
}
@keyframes twinkle {
  50% {
    opacity: 0.2;
  }
}
@keyframes pulse {
  50% {
    opacity: 0.55;
  }
}
@keyframes fan {
  from {
    transform: translateX(-50%) rotate(0deg) translateY(40px);
    opacity: 0;
  }
  to {
    transform: translateX(-50%) rotate(calc(var(--i) * 14deg));
    opacity: 1;
  }
}
@keyframes rise {
  from {
    transform: translateY(60px);
    opacity: 0;
  }
}
@keyframes sunrise {
  from {
    transform: translate(-50%, 120px);
    opacity: 0;
  }
  to {
    transform: translate(-50%, 0);
    opacity: 1;
  }
}
@keyframes blink {
  0%,
  92% {
    opacity: 1;
  }
  96% {
    opacity: 0.3;
  }
}
@keyframes float {
  50% {
    transform: translateY(-10px);
  }
}
@keyframes hover {
  50% {
    transform: translate(-50%, -12px);
  }
}
@keyframes fly {
  from {
    transform: translateX(0) translateY(0);
  }
  50% {
    transform: translateX(65vw) translateY(-14px);
  }
  to {
    transform: translateX(130vw) translateY(0);
  }
}
@keyframes lunge {
  0%,
  100% {
    transform: translateX(0);
  }
  45% {
    transform: translateX(40%) scale(1.15);
  }
}
@keyframes faint {
  0%,
  40% {
    transform: none;
    opacity: 1;
    filter: none;
  }
  to {
    transform: rotate(80deg) translateY(10px);
    opacity: 0.55;
    filter: grayscale(1);
  }
}
@keyframes drip {
  from {
    transform: translateY(0);
    opacity: 1;
  }
  to {
    transform: translateY(30px);
    opacity: 0;
  }
}
@keyframes shield {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  60% {
    transform: scale(1.4);
    opacity: 1;
  }
  to {
    transform: scale(1);
  }
}
@keyframes grow {
  from {
    transform: scaleX(0);
  }
}
@keyframes swing {
  0%,
  100% {
    transform: translateX(-50%) rotate(-8deg);
  }
  50% {
    transform: translateX(-50%) rotate(8deg);
  }
}
@keyframes wobble {
  0%,
  100% {
    transform: translateX(-50%) rotate(-10deg);
  }
  50% {
    transform: translateX(-50%) rotate(10deg);
  }
}
@keyframes strike {
  0%,
  60% {
    transform: rotate(-35deg);
  }
  75% {
    transform: rotate(15deg);
  }
  100% {
    transform: rotate(-35deg);
  }
}
@keyframes ascend {
  from {
    transform: translate(-50%, 40px);
    opacity: 0;
    filter: grayscale(1);
  }
  to {
    transform: translate(-50%, 0);
    opacity: 1;
  }
}
@keyframes ascend-spark {
  from {
    transform: translateY(0);
    opacity: 1;
  }
  to {
    transform: translateY(-120px);
    opacity: 0;
  }
}
@keyframes bounce {
  50% {
    transform: translate(-50%, -16px) scale(1.08);
  }
}
@keyframes fall {
  to {
    transform: translateY(120vh) rotate(360deg);
  }
}
@keyframes roll {
  0% {
    transform: rotate(0) translateY(-30px);
  }
  60% {
    transform: rotate(540deg) translateY(0);
  }
  100% {
    transform: rotate(720deg) translateY(0);
  }
}
@keyframes slide-up {
  from {
    transform: translateY(10px);
    opacity: 0;
  }
}
</style>
