<template>
  <div v-if="events.length">
    <div class="card reel">
      <div class="head">
        <h3>📜 Olanlar</h3>
        <button class="btn small primary" @click="openPlayer(0)">
          ▶ Hikâyeyi izle
        </button>
      </div>
      <div class="strip" ref="strip">
        <button
          v-for="(e, i) in events"
          :key="e.n"
          class="item"
          @click="openPlayer(i)"
        >
          <StoryScene :e="e" size="card" :playing="visible.includes(i)" />
        </button>
      </div>
    </div>

    <!-- full screen player (outside the card: its blur would trap position:fixed) -->
    <transition name="fade">
      <div class="player" v-if="playerOpen" @click="tap">
        <div class="progress">
          <span v-for="(e, i) in events" :key="e.n" class="seg">
            <span
              class="fill"
              :class="{ done: i < index, active: i === index }"
              :style="
                i === index
                  ? {
                      animationDuration: duration(e) + 'ms',
                      animationPlayState: paused ? 'paused' : 'running',
                    }
                  : {}
              "
              @animationend="next"
            ></span>
          </span>
        </div>
        <button class="close" @click.stop="closePlayer">✕</button>
        <button class="pause" @click.stop="paused = !paused">
          {{ paused ? "▶" : "⏸" }}
        </button>
        <StoryScene
          :key="current.n"
          :e="current"
          size="full"
          :playing="!paused"
        />
      </div>
    </transition>
  </div>
</template>

<script>
import StoryScene, { captionFor } from "./StoryScene";
import { game } from "../game";
import { speak } from "../voice";
import { play } from "../sfx";

const SOUND = {
  night: "night",
  day: "day",
  kill: "death",
  hang: "death",
  punish: "death",
  saved: "turn",
  win: "win",
  penalty: "pop",
  start: "turn",
};

export default {
  components: { StoryScene },
  data() {
    return { game, playerOpen: false, index: 0, paused: false, visible: [] };
  },
  computed: {
    events() {
      return (game.state && game.state.events) || [];
    },
    current() {
      return this.events[this.index] || this.events[0];
    },
  },
  watch: {
    "events.length"() {
      this.$nextTick(() => {
        const strip = this.$refs.strip;
        if (strip)
          strip.scrollTo({ left: strip.scrollWidth, behavior: "smooth" });
        this.observe();
      });
    },
    index() {
      this.announce();
    },
  },
  mounted() {
    this.$nextTick(() => {
      const strip = this.$refs.strip;
      if (strip) strip.scrollLeft = strip.scrollWidth;
      this.observe();
    });
  },
  beforeDestroy() {
    if (this.io) this.io.disconnect();
  },
  methods: {
    /** only animate the cards on screen (saves battery) */
    observe() {
      if (!("IntersectionObserver" in window) || !this.$refs.strip) {
        this.visible = this.events.map((_, i) => i);
        return;
      }
      if (this.io) this.io.disconnect();
      this.io = new IntersectionObserver(
        (entries) => {
          const set = new Set(this.visible);
          entries.forEach((entry) => {
            const i = [...this.$refs.strip.children].indexOf(entry.target);
            if (entry.isIntersecting) set.add(i);
            else set.delete(i);
          });
          this.visible = [...set];
        },
        { root: this.$refs.strip, threshold: 0.3 },
      );
      [...this.$refs.strip.children].forEach((el) => this.io.observe(el));
    },
    duration(e) {
      if (e.type === "votes" || e.type === "penalty") return 6500;
      if (e.type === "win") return 6000;
      return 4500;
    },
    openPlayer(i) {
      this.index = i;
      this.paused = false;
      this.playerOpen = true;
      this.announce();
    },
    closePlayer() {
      this.playerOpen = false;
      try {
        window.speechSynthesis && window.speechSynthesis.cancel();
      } catch (e) {
        // ignore
      }
    },
    announce() {
      if (!this.playerOpen) return;
      const [title, sub] = captionFor(this.current);
      try {
        window.speechSynthesis && window.speechSynthesis.cancel();
      } catch (e) {
        // ignore
      }
      speak(title + ". " + (sub || ""));
      if (SOUND[this.current.type]) play(SOUND[this.current.type]);
    },
    next() {
      if (this.index < this.events.length - 1) this.index++;
      else this.closePlayer();
    },
    prev() {
      if (this.index > 0) this.index--;
      else this.announce();
    },
    tap(event) {
      const x = event.clientX / window.innerWidth;
      if (x < 0.3) this.prev();
      else this.next();
    },
  },
};
</script>

<style scoped lang="scss">
@import "../vars";

.reel {
  padding-bottom: 10px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  h3 {
    margin: 0;
  }
  .btn {
    margin: 0;
  }
}
.strip {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  padding: 10px 2px 4px;
  -webkit-overflow-scrolling: touch;
  &::-webkit-scrollbar {
    display: none;
  }
}
.item {
  flex: 0 0 72%;
  max-width: 280px;
  scroll-snap-align: center;
  border: 0;
  padding: 0;
  background: none;
  border-radius: 14px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
  cursor: pointer;
  text-align: left;
}

.player {
  position: fixed;
  inset: 0;
  z-index: 380;
  background: black;
}
.progress {
  position: absolute;
  z-index: 5;
  left: 8px;
  right: 8px;
  top: calc(8px + env(safe-area-inset-top));
  display: flex;
  gap: 3px;
  .seg {
    flex: 1;
    height: 3px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.3);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    width: 0;
    background: white;
    &.done {
      width: 100%;
    }
    &.active {
      animation: progress linear forwards;
    }
  }
}
.close,
.pause {
  position: absolute;
  z-index: 6;
  top: calc(20px + env(safe-area-inset-top));
  border: 0;
  background: rgba(0, 0, 0, 0.35);
  color: white;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  font-size: 18px;
}
.close {
  right: 12px;
}
.pause {
  right: 60px;
}
@keyframes progress {
  from {
    width: 0;
  }
  to {
    width: 100%;
  }
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter,
.fade-leave-to {
  opacity: 0;
}
</style>
