<template>
  <div class="chat-wrap" v-if="s">
    <button class="fab" @click="toggle" :class="{ open }" aria-label="Sohbet">
      💬
      <span class="unread" v-if="!open && unread">{{
        unread > 9 ? "9+" : unread
      }}</span>
    </button>
    <transition name="slide">
      <div class="panel" v-if="open">
        <div class="tabs">
          <button
            v-for="ch in channels"
            :key="ch"
            :class="{ active: channel === ch }"
            @click="channel = ch"
          >
            {{ labels[ch] }}
          </button>
          <button class="close" @click="toggle">✕</button>
        </div>
        <div class="messages" ref="list">
          <p class="empty muted" v-if="!messages.length">Henüz mesaj yok.</p>
          <div
            v-for="m in messages"
            :key="m.n"
            class="msg"
            :class="{ sys: m.sys, mine: m.from === s.me.pid }"
          >
            <template v-if="m.sys">{{ m.text }}</template>
            <template v-else>
              <b>{{ m.name }}</b>
              <span>{{ m.text }}</span>
            </template>
          </div>
        </div>
        <form class="compose" @submit.prevent="send" v-if="canWrite">
          <input
            v-model="text"
            maxlength="200"
            :placeholder="placeholder"
            enterkeyhint="send"
          />
          <button type="submit" :disabled="!text.trim()">Gönder</button>
        </form>
        <p class="locked muted" v-else>{{ lockedText }}</p>
      </div>
    </transition>
  </div>
</template>

<script>
import { game, chat } from "../game";

const LABELS = { town: "Köy", vampir: "🧛 Vampirler", dead: "💀 Ölüler" };

export default {
  data() {
    return {
      game,
      open: false,
      channel: "town",
      text: "",
      seen: 0,
      labels: LABELS,
    };
  },
  computed: {
    s() {
      return game.state;
    },
    channels() {
      if (!this.s) return [];
      return ["town", "vampir", "dead"].filter((c) => this.s.chat[c]);
    },
    messages() {
      if (!this.s) return [];
      return (this.s.chat[this.channel] || []).slice(-40);
    },
    latest() {
      let n = 0;
      this.channels.forEach((c) =>
        (this.s.chat[c] || []).forEach((m) => {
          if (!m.sys && m.n > n) n = m.n;
        }),
      );
      return n;
    },
    unread() {
      let count = 0;
      this.channels.forEach((c) =>
        (this.s.chat[c] || []).forEach((m) => {
          if (!m.sys && m.n > this.seen && m.from !== this.s.me.pid) count++;
        }),
      );
      return count;
    },
    canWrite() {
      return !!this.s && this.s.canWrite.includes(this.channel);
    },
    placeholder() {
      return this.channel === "vampir"
        ? "Sadece vampirler görür…"
        : this.channel === "dead"
        ? "Sadece ölüler görür…"
        : "Herkese yaz…";
    },
    lockedText() {
      if (this.channel !== "town") return "Şu an bu kanala yazamazsın.";
      if (this.s.phase === "night") return "Gece köy uyur, konuşmak yasak.";
      if (this.s.phase === "lastwords")
        return "Sadece asılacak kişi konuşabilir.";
      if (this.s.me.seated && !this.s.me.alive)
        return "Ölüler köyle konuşamaz; Ölüler kanalını kullan.";
      return "Şu an yazamazsın.";
    },
  },
  watch: {
    channels(list) {
      if (list.length && !list.includes(this.channel)) this.channel = "town";
    },
    messages() {
      if (this.open) this.markSeen();
      this.$nextTick(this.scroll);
    },
  },
  methods: {
    toggle() {
      this.open = !this.open;
      if (this.open) {
        this.markSeen();
        this.$nextTick(this.scroll);
      }
    },
    markSeen() {
      this.seen = this.latest;
    },
    scroll() {
      const el = this.$refs.list;
      if (el) el.scrollTop = el.scrollHeight;
    },
    send() {
      const text = this.text.trim();
      if (!text) return;
      chat(this.channel, text);
      this.text = "";
    },
  },
};
</script>

<style scoped lang="scss">
@import "../vars";

.fab {
  position: fixed;
  right: 16px;
  bottom: calc(16px + env(safe-area-inset-bottom));
  z-index: 120;
  width: 58px;
  height: 58px;
  border-radius: 50%;
  border: 1px solid rgba(233, 180, 76, 0.6);
  background: linear-gradient(160deg, #2a2340, #120f1e);
  font-size: 26px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  cursor: pointer;
  &.open {
    display: none;
  }
}
.unread {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 22px;
  height: 22px;
  border-radius: 11px;
  background: $blood;
  color: white;
  font-size: 12px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
}
.panel {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 130;
  height: min(70vh, 560px);
  max-width: 560px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  background: #0c0e1b;
  border-top: 2px solid $gold;
  border-radius: 18px 18px 0 0;
  box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.7);
}
.tabs {
  display: flex;
  gap: 6px;
  padding: 10px 10px 6px;
  border-bottom: 1px solid $line;
  button {
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.05);
    color: $text;
    border-radius: 20px;
    padding: 7px 12px;
    font-size: 14px;
    cursor: pointer;
    &.active {
      background: rgba(233, 180, 76, 0.2);
      border-color: $gold;
    }
  }
  .close {
    margin-left: auto;
    border: 0;
    background: none;
    font-size: 18px;
  }
}
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  -webkit-overflow-scrolling: touch;
}
.msg {
  margin: 6px 0;
  padding: 7px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  max-width: 88%;
  line-height: 1.35;
  font-size: 15px;
  word-wrap: break-word;
  b {
    display: block;
    font-size: 12px;
    color: $gold;
  }
  &.mine {
    margin-left: auto;
    background: rgba(123, 108, 255, 0.25);
  }
  &.sys {
    max-width: 100%;
    background: none;
    color: $muted;
    font-style: italic;
    font-size: 13px;
    text-align: center;
  }
}
.compose {
  display: flex;
  gap: 8px;
  padding: 8px 10px calc(10px + env(safe-area-inset-bottom));
  border-top: 1px solid $line;
  input {
    flex: 1;
    min-height: 46px;
    border-radius: 23px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(0, 0, 0, 0.4);
    color: $text;
    padding: 0 16px;
    font-size: 16px;
    outline: none;
  }
  button {
    border: 0;
    border-radius: 23px;
    padding: 0 16px;
    background: $gold;
    color: #1a1204;
    font-weight: 700;
    font-size: 15px;
    &:disabled {
      opacity: 0.4;
    }
  }
}
.locked {
  padding: 12px 14px calc(14px + env(safe-area-inset-bottom));
  margin: 0;
  border-top: 1px solid $line;
  font-size: 14px;
  text-align: center;
}
.empty {
  text-align: center;
  margin-top: 30px;
}
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease;
}
.slide-enter,
.slide-leave-to {
  transform: translateY(100%);
}
</style>
