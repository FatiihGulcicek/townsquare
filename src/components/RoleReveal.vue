<template>
  <transition name="reveal">
    <div
      class="role-reveal"
      v-if="state.open && role"
      :class="[alignment, role.team]"
      @click.self="close"
    >
      <div class="card">
        <div class="eyebrow">{{ $t("You are") }}</div>
        <div class="token-wrap">
          <Token :role="role" />
        </div>
        <h2>{{ role.name }}</h2>
        <div class="team">
          <span class="team-name">{{ teamName }}</span>
          <span class="dot">•</span>
          <span class="alignment">{{ alignmentName }}</span>
        </div>
        <p class="ability">{{ role.ability }}</p>
        <p class="secret">
          {{ $t("Keep it secret! Only you can see this.") }}
        </p>
        <button class="button" @click="close">{{ $t("Got it") }}</button>
        <button
          class="button townsfolk notif"
          v-if="canAskNotifications"
          @click="enableNotifications"
        >
          <font-awesome-icon icon="bell" />
          {{ $t("Notify me when it's my turn") }}
        </button>
        <p class="hint" v-else-if="needsHomeScreen">
          {{
            $t(
              "Tip: add the app to your home screen to get notifications when it's your turn.",
            )
          }}
        </p>
      </div>
    </div>
  </transition>
</template>

<script>
import { mapState } from "vuex";
import Token from "./Token";
import { revealState } from "../reveal";
import { requestPermission, notify } from "../notify";
import { setupPush, pushSupported } from "../push";
import { pwaState } from "../pwa";

const TEAMS = {
  townsfolk: "Townsfolk",
  outsider: "Outsider",
  minion: "Minion",
  demon: "Demon",
  traveler: "Traveller",
  fabled: "Fabled",
};

export default {
  components: { Token },
  data() {
    return {
      state: revealState,
      permission:
        typeof Notification !== "undefined"
          ? Notification.permission
          : "unsupported",
    };
  },
  computed: {
    ...mapState(["session"]),
    ...mapState("players", ["players"]),
    me() {
      if (!this.session.isSpectator) return null;
      return this.players.find((p) => p.id === this.session.playerId) || null;
    },
    role() {
      return this.me && this.me.role && this.me.role.id ? this.me.role : null;
    },
    alignment() {
      if (!this.role) return "";
      return ["minion", "demon"].includes(this.role.team) ? "evil" : "good";
    },
    alignmentName() {
      if (this.role && this.role.team === "traveler") {
        return this.$t("Good or Evil");
      }
      return this.$t(this.alignment === "evil" ? "Evil" : "Good");
    },
    teamName() {
      return this.$t(TEAMS[this.role.team] || this.role.team);
    },
    canAskNotifications() {
      return pushSupported() && this.permission === "default";
    },
    needsHomeScreen() {
      return pwaState.isIOS && !pwaState.isStandalone;
    },
  },
  watch: {
    role(role) {
      if (!role) return;
      // show each character only once per game, even after reloads
      const key = this.session.sessionId + ":" + role.id;
      let seen = "";
      try {
        seen = localStorage.getItem("revealedRole") || "";
      } catch (e) {
        // ignore
      }
      if (seen !== key) {
        this.state.open = true;
        try {
          localStorage.setItem("revealedRole", key);
        } catch (e) {
          // ignore
        }
      }
    },
  },
  methods: {
    close() {
      this.state.open = false;
    },
    async enableNotifications() {
      this.permission = await requestPermission();
      if (this.permission === "granted") {
        const subscription = await setupPush();
        notify(
          subscription
            ? "Notifications are on, even when the app is closed"
            : "Notifications are on",
          null,
          { type: "success" },
        );
      }
    },
  },
};
</script>

<style scoped lang="scss">
@import "../vars.scss";

.role-reveal {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: radial-gradient(
    circle at 50% 40%,
    rgba(20, 30, 60, 0.92),
    rgba(0, 0, 0, 0.96)
  );
  &.evil {
    background: radial-gradient(
      circle at 50% 40%,
      rgba(80, 10, 10, 0.92),
      rgba(0, 0, 0, 0.96)
    );
  }
}

.card {
  width: 100%;
  max-width: 420px;
  max-height: 100%;
  overflow-y: auto;
  text-align: center;
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.eyebrow {
  font-family: "Cinzel", PiratesBay, serif;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  font-size: 0.95em;
  opacity: 0.8;
}

.token-wrap {
  width: min(60vw, 240px);
  height: min(60vw, 240px);
  margin: 6px auto;
  animation: pop 0.7s cubic-bezier(0.2, 1.4, 0.4, 1);
  ::v-deep .token {
    width: 100%;
    height: 100%;
    font-size: 100%;
    cursor: default;
    box-shadow: 0 0 40px rgba(255, 255, 255, 0.25);
  }
}
.evil .token-wrap ::v-deep .token {
  box-shadow: 0 0 40px rgba(255, 40, 40, 0.45);
}

h2 {
  font-family: "Cormorant Garamond", PiratesBay, serif;
  font-size: 2.4em;
  line-height: 1.1;
  margin: 0;
}
.townsfolk h2 {
  color: $townsfolk;
}
.outsider h2 {
  color: $outsider;
}
.minion h2 {
  color: $minion;
}
.demon h2 {
  color: $demon;
}
.traveler h2 {
  color: $traveler;
}

.team {
  font-size: 1.05em;
  opacity: 0.9;
  .dot {
    margin: 0 6px;
    opacity: 0.6;
  }
}

.ability {
  font-size: 1.15em;
  line-height: 1.4;
  margin: 10px 0 4px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
}

.secret,
.hint {
  font-size: 0.9em;
  opacity: 0.75;
  margin: 2px 0;
}

.button {
  width: 100%;
  max-width: 320px;
  justify-content: center;
  margin: 4px 0;
  font-size: 1.1em;
}

@keyframes pop {
  0% {
    transform: scale(0.3) rotate(-30deg);
    opacity: 0;
  }
  100% {
    transform: scale(1) rotate(0);
    opacity: 1;
  }
}

.reveal-enter-active,
.reveal-leave-active {
  transition: opacity 0.3s;
}
.reveal-enter,
.reveal-leave-to {
  opacity: 0;
}
</style>
