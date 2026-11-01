<template>
  <div
    class="guide"
    v-if="step"
    :class="[
      'tone-' + (step.tone || 'tip'),
      { minimized, player: !isStoryteller },
    ]"
  >
    <div class="pill" v-if="minimized" @click="setMinimized(false)">
      <font-awesome-icon icon="question" />
      {{ step.title }}
    </div>
    <template v-else>
      <div class="head">
        <span class="badge" v-if="step.badge">{{ step.badge }}</span>
        <strong>{{ step.title }}</strong>
        <font-awesome-icon
          class="minimize"
          icon="window-minimize"
          :title="$t('Hide')"
          @click="setMinimized(true)"
        />
      </div>
      <p :class="{ clamped: !expanded }" @click="expanded = !expanded">
        {{ step.text }}
      </p>
      <div class="actions" v-if="step.actions && step.actions.length">
        <span
          v-for="action in step.actions"
          :key="action.id"
          class="button"
          :class="{ townsfolk: action.primary }"
          @click="run(action.id)"
        >
          <font-awesome-icon v-if="action.icon" :icon="action.icon" />
          {{ action.label }}
        </span>
      </div>
    </template>
  </div>
</template>

<script>
import { mapState } from "vuex";

function readJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value === null || value === undefined ? fallback : value;
  } catch (e) {
    return fallback;
  }
}

export default {
  data() {
    return {
      minimized: readJSON("guideMinimized", false),
      nightCount: readJSON("nightCount", 0),
      bluffsSkipped: readJSON("bluffsSkipped", false),
      expanded: false,
    };
  },
  computed: {
    ...mapState(["grimoire", "session", "edition"]),
    ...mapState("players", ["players", "bluffs"]),
    isStoryteller() {
      return !this.session.isSpectator;
    },
    live() {
      return !!this.session.sessionId && this.isStoryteller;
    },
    nonTravelers() {
      return this.players.filter((p) => p.role.team !== "traveler");
    },
    sentRoles() {
      // re-evaluated whenever characters are sent
      // eslint-disable-next-line no-unused-expressions
      this.session.rolesSentVersion;
      const data = readJSON("sentRoles", {});
      return data.sessionId === this.session.sessionId ? data.roles || {} : {};
    },
    step() {
      const t = this.$t;
      if (!this.players.length) return null;
      if (!this.isStoryteller) return this.playerStep;
      const seated = this.players.filter((p) => p.id).length;
      const night = this.nightCount;

      // 1. not enough players yet
      if (this.nonTravelers.length < 5) {
        return {
          title: t("Waiting for players"),
          badge: `${this.nonTravelers.length}/5`,
          text: this.live
            ? t(
                "{count} players are seated. At least 5 are needed: share the player link.",
                { count: seated },
              )
            : t("Add at least 5 players to the table."),
          actions: this.live
            ? [
                {
                  id: "share",
                  label: t("Share player link"),
                  icon: "copy",
                  primary: true,
                },
                { id: "add", label: t("Add seat"), icon: "users" },
              ]
            : [
                {
                  id: "add",
                  label: t("Add seat"),
                  icon: "users",
                  primary: true,
                },
              ],
        };
      }

      // game over?
      if (night > 0) {
        const demons = this.players.filter((p) => p.role.team === "demon");
        const alive = this.players.filter(
          (p) => !p.isDead && p.role.team !== "traveler",
        );
        if (demons.length && demons.every((p) => p.isDead)) {
          return {
            tone: "good",
            title: t("The Demon is dead"),
            text: t(
              "If no other player became the Demon, good wins. Reveal the characters and start a new game.",
            ),
            actions: [
              {
                id: "newGame",
                label: t("New game"),
                icon: "redo-alt",
                primary: true,
              },
            ],
          };
        }
        if (alive.length <= 2 && demons.some((p) => !p.isDead)) {
          return {
            tone: "evil",
            title: t("Only 2 players are alive"),
            text: t(
              "The Demon is still alive, so evil wins. Reveal the characters and start a new game.",
            ),
            actions: [
              {
                id: "newGame",
                label: t("New game"),
                icon: "redo-alt",
                primary: true,
              },
            ],
          };
        }
      }

      // 2. hand out characters
      if (this.nonTravelers.some((p) => !p.role.id)) {
        return {
          title: t("Hand out the characters"),
          badge: "1",
          text: t(
            "Pick the characters for this game and assign them randomly. You can change the edition first.",
          ),
          actions: [
            {
              id: "roles",
              label: t("Choose & Assign"),
              icon: "theater-masks",
              primary: true,
            },
            { id: "edition", label: t("Select Edition"), icon: "book-open" },
          ],
        };
      }

      // 3. characters assigned but not delivered yet
      if (
        this.live &&
        this.players.some(
          (p) => p.id && p.role.id && this.sentRoles[p.id] !== p.role.id,
        )
      ) {
        return {
          title: t("Send the characters"),
          badge: "2",
          text: t("Seated players see their character as soon as you send it."),
          actions: [
            {
              id: "send",
              label: t("Send Characters"),
              icon: "theater-masks",
              primary: true,
            },
          ],
        };
      }

      // 4. demon bluffs before the first night
      const demonInPlay = this.players.some((p) => p.role.team === "demon");
      const bluffCount = this.bluffs.filter((b) => b && b.id).length;
      if (night === 0 && demonInPlay && bluffCount < 3 && !this.bluffsSkipped) {
        return {
          title: t("Choose the Demon bluffs"),
          badge: "3",
          text: t(
            "Pick 3 good characters that are not in play ({count}/3). You show them to the Demon on the first night.",
            { count: bluffCount },
          ),
          actions: [
            {
              id: "bluff",
              label: t("Choose bluff"),
              icon: "theater-masks",
              primary: true,
            },
            { id: "skipBluffs", label: t("Skip"), icon: "times" },
          ],
        };
      }

      // 5. first night
      if (night === 0 && !this.grimoire.isNight) {
        return {
          title: t("Start the first night"),
          badge: "4",
          text: t(
            "Everyone closes their eyes. Follow the night order and wake the characters one by one.",
          ),
          actions: [
            {
              id: "night",
              label: t("Switch to Night"),
              icon: "cloud-moon",
              primary: true,
            },
            {
              id: "nightOrder",
              label: t("Night Order Sheet"),
              icon: "address-card",
            },
          ],
        };
      }

      if (this.grimoire.isNight) {
        return {
          tone: "night",
          title: t("Night {count}", { count: Math.max(1, night) }),
          text: t(
            "Wake the characters in the order of the night order sheet and talk to them privately. Mark who dies tonight by tapping their token.",
          ),
          actions: [
            {
              id: "nightOrder",
              label: t("Night Order Sheet"),
              icon: "address-card",
              primary: true,
            },
            { id: "day", label: t("Switch to Day"), icon: "sun" },
          ],
        };
      }

      if (this.session.nomination) return null; // the vote panel takes over

      return {
        tone: "day",
        title: t("Day {count}", { count: Math.max(1, night) }),
        text: t(
          "Announce who died tonight. Players discuss; to nominate, tap the nominator's name → Nomination, then pick the nominee. The player with the most votes (at least half of the living) is executed.",
        ),
        actions: [
          {
            id: "night",
            label: t("Switch to Night"),
            icon: "cloud-moon",
            primary: true,
          },
          { id: "voteHistory", label: t("Vote history"), icon: "book-dead" },
        ],
      };
    },
    playerStep() {
      const t = this.$t;
      if (this.session.nomination) return null;
      const me = this.players.find((p) => p.id === this.session.playerId);
      if (!me) {
        return {
          title: t("Waiting for a seat"),
          text: t("The Storyteller's table will seat you in a moment."),
        };
      }
      if (!me.role.id) {
        return {
          title: t("Waiting for your character"),
          text: t("The Storyteller is handing out the characters."),
          actions: [
            {
              id: "reference",
              label: t("Character Reference"),
              icon: "address-card",
            },
          ],
        };
      }
      if (me.isDead) {
        return {
          tone: "evil",
          title: t("You are dead, but still in the game"),
          text: t(
            "You can keep talking and use your one ghost vote once before the game ends.",
          ),
        };
      }
      if (this.grimoire.isNight) {
        return {
          tone: "night",
          title: t("Night"),
          text: t(
            "Close your eyes. The Storyteller may wake you to use your ability.",
          ),
        };
      }
      return {
        tone: "day",
        title: t("Day"),
        text: t(
          "Talk, share (or hide) information and find the Demon. Ask the Storyteller to nominate someone you suspect.",
        ),
        actions: [
          {
            id: "reference",
            label: t("Character Reference"),
            icon: "address-card",
          },
        ],
      };
    },
  },
  watch: {
    "grimoire.isNight"(night) {
      if (night && this.isStoryteller) {
        this.nightCount++;
        localStorage.setItem("nightCount", this.nightCount);
      }
    },
    step(next, prev) {
      // a new step deserves attention even if the guide was minimized
      if (next && prev && next.title !== prev.title && next.badge) {
        this.setMinimized(false);
      }
    },
  },
  mounted() {
    document.body.classList.add("has-guide");
  },
  beforeDestroy() {
    document.body.classList.remove("has-guide");
  },
  methods: {
    setMinimized(value) {
      this.minimized = value;
      localStorage.setItem("guideMinimized", JSON.stringify(value));
    },
    run(id) {
      if (id === "skipBluffs") {
        this.bluffsSkipped = true;
        localStorage.setItem("bluffsSkipped", "true");
        return;
      }
      if (id === "newGame") {
        if (
          !confirm(
            this.$t(
              "Start a new game? Characters, deaths and votes are reset.",
            ),
          )
        ) {
          return;
        }
        this.nightCount = 0;
        this.bluffsSkipped = false;
        localStorage.setItem("nightCount", 0);
        localStorage.removeItem("bluffsSkipped");
        localStorage.removeItem("sentRoles");
      }
      this.$emit("action", id);
    },
  },
};
</script>

<style lang="scss" scoped>
@import "../vars.scss";

.guide {
  position: fixed;
  z-index: 60;
  right: 16px;
  bottom: 16px;
  width: min(380px, 92vw);
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(8, 10, 18, 0.93);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-left: 4px solid $townsfolk;
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  color: white;
  font-size: 90%;
  &.tone-night {
    border-left-color: #8e7cff;
  }
  &.tone-day {
    border-left-color: #ffb347;
  }
  &.tone-good {
    border-left-color: #2ecc71;
  }
  &.tone-evil {
    border-left-color: $demon;
  }
  &.minimized {
    width: auto;
    padding: 0;
    border: 0;
    background: none;
    box-shadow: none;
  }
}

.pill {
  cursor: pointer;
  padding: 8px 14px;
  border-radius: 20px;
  background: rgba(8, 10, 18, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
  font-weight: bold;
  white-space: nowrap;
  svg {
    margin-right: 6px;
    color: $townsfolk;
  }
}

.head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 110%;
  strong {
    flex: 1;
    font-family: "Cormorant Garamond", Georgia, serif;
    font-size: 115%;
  }
  .badge {
    min-width: 26px;
    height: 26px;
    padding: 0 6px;
    border-radius: 13px;
    background: $townsfolk;
    font-weight: bold;
    font-size: 85%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .minimize {
    cursor: pointer;
    opacity: 0.6;
    width: 18px;
    &:hover {
      opacity: 1;
    }
  }
}

p {
  margin: 6px 0 10px;
  line-height: 1.4;
  color: #d6dbee;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  .button {
    margin: 0;
    padding: 2px 6px;
    font-size: 95%;
    svg {
      margin-right: 4px;
    }
  }
}

@media (max-width: 767.98px) {
  .guide {
    left: 8px;
    right: 8px;
    width: auto;
    bottom: calc(8px + env(safe-area-inset-bottom));
    font-size: 95%;
    &.minimized {
      left: auto;
    }
  }
  p {
    font-size: 92%;
    &.clamped {
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
  }
  .actions .button {
    flex: 1 1 auto;
    text-align: center;
    padding: 6px 6px;
  }
}
</style>
