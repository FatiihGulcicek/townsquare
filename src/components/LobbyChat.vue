<template>
  <div class="card lchat">
    <h3>💬 Meydan sohbeti</h3>
    <div class="msgs" ref="list">
      <p class="muted small" v-if="!visible.length">
        Henüz kimse yazmadı. Selam ver!
      </p>
      <div
        v-for="m in visible"
        :key="m.n"
        class="msg"
        :class="{ mine: m.from === lobby.me, picked: menu === m.n }"
        @click="pick(m, $event)"
      >
        <b>{{ m.name }}</b>
        <span>{{ m.text }}</span>
        <div class="actions" v-if="menu === m.n" @click.stop>
          <button @click="block(m)">🚫 Engelle</button>
          <button @click="report(m)">⚠️ Şikâyet et</button>
          <button @click="menu = null">Vazgeç</button>
        </div>
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
    <p class="muted tip" v-if="visible.some((m) => m.from !== lobby.me)">
      Rahatsız eden olursa mesajına dokun: engelle ya da şikâyet et.
    </p>
  </div>
</template>

<script>
import { game } from "../game";
import { lobby, lobbyChat, isBlocked, blockUser, reportUser } from "../lobby";

export default {
  data() {
    return { lobby, game, text: "", menu: null };
  },
  computed: {
    visible() {
      return lobby.chat.filter((m) => !isBlocked(m.from));
    },
  },
  watch: {
    "visible.length"() {
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
    pick(m, event) {
      if (m.from === lobby.me) return;
      if (event && event.target.closest && event.target.closest(".actions"))
        return;
      this.menu = this.menu === m.n ? null : m.n;
    },
    block(m) {
      this.menu = null;
      if (
        !confirm(
          `${m.name} engellensin mi? Mesajlarını ve davetlerini görmeyeceksin.`,
        )
      )
        return;
      blockUser(m.from, m.name);
      this.menu = null;
    },
    report(m) {
      this.menu = null;
      if (
        !confirm(
          `${m.name} şikâyet edilsin mi? 3 kişi şikâyet ederse 1 saat yazamaz.`,
        )
      )
        return;
      reportUser(m.from, m.n);
      this.menu = null;
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
  background: rgba(71, 17, 37, 0.74);
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
    background: rgba(114, 68, 28, 0.72);
  }
  &:not(.mine) {
    cursor: pointer;
  }
  &.picked {
    outline: 1px solid $gold;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
    button {
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(0, 0, 0, 0.35);
      color: $text;
      border-radius: 16px;
      padding: 6px 10px;
      font-size: 13px;
      min-height: 34px;
    }
  }
}
.tip {
  font-size: 12px;
  margin: 6px 0 0;
}
.compose {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  input {
    flex: 1;
    min-height: 44px;
    border-radius: 22px;
    border: 1px solid $line;
    background: rgba(13, 4, 10, 0.88);
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
