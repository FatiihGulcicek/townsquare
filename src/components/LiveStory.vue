<template>
  <transition name="live">
    <div class="live" v-if="current" @click="next">
      <div class="progress">
        <span
          class="fill"
          :key="current.n"
          :style="{ animationDuration: duration + 'ms' }"
          @animationend="next"
        ></span>
      </div>
      <button class="skip" @click.stop="skipAll">
        {{
          game.liveQueue.length > 1 ? `Geç (${game.liveQueue.length})` : "Geç"
        }}
      </button>
      <StoryScene :key="'s' + current.n" :e="current" size="full" />
    </div>
  </transition>
</template>

<script>
import StoryScene from "./StoryScene";
import { game } from "../game";
import { play } from "../sfx";

const SOUND = {
  start: "turn",
  night: "night",
  day: "day",
  kill: "death",
  hang: "death",
  punish: "death",
  saved: "turn",
  revive: "turn",
  win: "win",
  penalty: "pop",
  votes: "vote",
};
// a little shorter than in the story player: the game goes on meanwhile
const DURATION = {
  votes: 4500,
  win: 5500,
  penalty: 6000,
  day: 2800,
  night: 3000,
};

export default {
  components: { StoryScene },
  data() {
    return { game };
  },
  computed: {
    current() {
      return game.liveQueue[0] || null;
    },
    duration() {
      return (this.current && DURATION[this.current.type]) || 3800;
    },
  },
  watch: {
    current(e) {
      if (!e) return;
      let sound = SOUND[e.type];
      if (e.type === "win" && game.state && game.state.me.role) {
        const team = game.state.roles[game.state.me.role].team;
        sound = team === e.winner ? "win" : "lose";
      }
      if (sound) play(sound);
    },
  },
  methods: {
    next() {
      game.liveQueue.shift();
    },
    skipAll() {
      game.liveQueue.splice(0);
    },
  },
};
</script>

<style scoped lang="scss">
.live {
  position: fixed;
  inset: 0;
  z-index: 360;
  background: black;
  cursor: pointer;
}
.progress {
  position: absolute;
  z-index: 5;
  left: 10px;
  right: 10px;
  top: calc(8px + env(safe-area-inset-top));
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.3);
  overflow: hidden;
  .fill {
    display: block;
    height: 100%;
    width: 0;
    background: white;
    animation: progress linear forwards;
  }
}
.skip {
  position: absolute;
  z-index: 6;
  right: 12px;
  top: calc(20px + env(safe-area-inset-top));
  border: 1px solid rgba(255, 255, 255, 0.4);
  background: rgba(0, 0, 0, 0.45);
  color: white;
  border-radius: 18px;
  padding: 7px 14px;
  font-size: 14px;
  font-weight: 700;
}
@keyframes progress {
  to {
    width: 100%;
  }
}
.live-enter-active,
.live-leave-active {
  transition: opacity 0.4s;
}
.live-enter,
.live-leave-to {
  opacity: 0;
}
</style>
