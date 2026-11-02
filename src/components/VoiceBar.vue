<template>
  <div class="voice" v-if="s">
    <template v-if="!vc.on">
      <button class="fab join" :disabled="vc.joining" @click="join">
        🎙️<span>{{ vc.joining ? "…" : "Sesli" }}</span>
      </button>
    </template>
    <div class="bar" v-else>
      <button
        class="mic"
        :class="{ off: vc.muted || !canSpeak }"
        @click="toggle"
      >
        {{ vc.muted ? "🔇" : "🎙️" }}
      </button>
      <div class="info">
        <b>{{ title }}</b>
        <small>{{ hint }}</small>
      </div>
      <button class="leave" @click="leave" aria-label="Sesliden çık">✕</button>
    </div>
  </div>
</template>

<script>
import { game, toast } from "../game";
import { voiceChat, joinVoice, leaveVoice, toggleMute } from "../voicechat";

export default {
  data() {
    return { game, vc: voiceChat };
  },
  computed: {
    s() {
      return game.state;
    },
    voice() {
      return (
        (this.s && this.s.voice) || { members: [], sendTo: [], hearFrom: [] }
      );
    },
    canSpeak() {
      return this.voice.sendTo.length > 0;
    },
    connectedCount() {
      return Object.keys(this.vc.connected).length;
    },
    title() {
      const n = this.voice.members.length;
      return `Sesli sohbet · ${n} kişi`;
    },
    hint() {
      const s = this.s;
      if (this.s.me.muted) return "🔇 Susturuldun, kimse seni duymuyor";
      if (this.vc.muted) return "Mikrofonun kapalı";
      if (!this.canSpeak) {
        if (s.phase === "night")
          return "Gece: köy susuyor, kimse seni duymuyor";
        if (s.phase === "lastwords") return "Sadece asılacak kişi konuşuyor";
        if (s.me.seated && !s.me.alive)
          return "Ölüsün: sadece ölüler seni duyar";
        return this.voice.members.length > 1
          ? "Bağlanıyor…"
          : "Henüz kimse yok";
      }
      if (s.phase === "night") return "🧛 Sadece vampirler duyuyor";
      if (s.me.seated && !s.me.alive) return "💀 Sadece ölüler duyuyor";
      return `${this.connectedCount} kişiye bağlı · konuşabilirsin`;
    },
  },
  watch: {
    "vc.error"(error) {
      if (error) toast(error, "warning", 7000);
    },
  },
  methods: {
    join() {
      joinVoice();
    },
    leave() {
      leaveVoice();
    },
    toggle() {
      toggleMute();
    },
  },
};
</script>

<style scoped lang="scss">
@import "../vars";
.fab {
  position: fixed;
  left: 16px;
  bottom: calc(16px + env(safe-area-inset-bottom));
  z-index: 120;
  height: 58px;
  min-width: 58px;
  padding: 0 16px;
  border-radius: 29px;
  border: 1px solid rgba(233, 180, 76, 0.6);
  background: linear-gradient(160deg, #2a2340, #120f1e);
  color: $text;
  font-size: 22px;
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  span {
    font-size: 15px;
    font-weight: 700;
  }
}
.bar {
  position: fixed;
  left: 12px;
  right: 86px;
  bottom: calc(14px + env(safe-area-inset-bottom));
  z-index: 120;
  max-width: 460px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 30px;
  background: rgba(14, 16, 30, 0.95);
  border: 1px solid rgba(233, 180, 76, 0.5);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
}
.mic {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 0;
  font-size: 22px;
  background: $good;
  flex-shrink: 0;
  &.off {
    background: #444;
  }
}
.info {
  flex: 1;
  min-width: 0;
  b {
    display: block;
    font-size: 14px;
  }
  small {
    display: block;
    font-size: 12px;
    color: $muted;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
.leave {
  border: 0;
  background: none;
  color: $muted;
  font-size: 18px;
  padding: 6px;
}
</style>
