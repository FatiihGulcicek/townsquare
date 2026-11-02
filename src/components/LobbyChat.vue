<template>
  <div class="card lchat">
    <h3>💬 Meydan sohbeti</h3>
    <div class="msgs" ref="list">
      <p class="muted small" v-if="!lobby.chat.length">
        Henüz kimse yazmadı. Selam ver!
      </p>
      <div
        v-for="m in lobby.chat"
        :key="m.n"
        class="msg"
        :class="{ mine: m.from === lobby.me }"
      >
        <b>{{ m.name }}</b>
        <span>{{ m.text }}</span>
      </div>
    </div>
    <form class="compose" @submit.prevent="send" v-if="game.name">
      <input
        v-model="text"
        maxlength="200"
        placeholder="Herkese yaz…"
        enterkeyhint="send"
      />
      <button type="submit" :disabled="!text.trim()">Gönder</button>
    </form>
    <p class="muted small" v-else>Yazmak için yukarıya adını gir.</p>
  </div>
</template>

<script>
import { game } from "../game";
import { lobby, lobbyChat } from "../lobby";

export default {
  data() {
    return { lobby, game, text: "" };
  },
  watch: {
    "lobby.chat.length"() {
      this.$nextTick(this.scroll);
    },
  },
  mounted() {
    this.scroll();
  },
  methods: {
    scroll() {
      const el = this.$refs.list;
      if (el) el.scrollTop = el.scrollHeight;
    },
    send() {
      const text = this.text.trim();
      if (!text) return;
      lobbyChat(text);
      this.text = "";
    },
  },
};
</script>

<style scoped lang="scss">
@import "../vars";
h3 {
  margin: 0 0 8px;
  font-size: 18px;
}
.msgs {
  max-height: 260px;
  overflow-y: auto;
  padding-right: 4px;
}
.msg {
  margin: 6px 0;
  padding: 7px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  max-width: 88%;
  font-size: 15px;
  line-height: 1.35;
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
}
.compose {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  input {
    flex: 1;
    min-height: 44px;
    border-radius: 22px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(0, 0, 0, 0.4);
    color: $text;
    padding: 0 14px;
    font-size: 16px;
    outline: none;
  }
  button {
    border: 0;
    border-radius: 22px;
    padding: 0 14px;
    background: $gold;
    color: #1a1204;
    font-weight: 700;
    &:disabled {
      opacity: 0.4;
    }
  }
}
.small {
  font-size: 14px;
}
</style>
