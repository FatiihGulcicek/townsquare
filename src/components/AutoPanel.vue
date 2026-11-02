<template>
  <div class="auto" v-if="auto.active">
    <!-- status panel -->
    <div class="panel" :class="['phase-' + auto.phase, { collapsed }]">
      <div class="head" @click="collapsed = !collapsed">
        <font-awesome-icon :icon="headIcon" />
        <strong>{{ headTitle }}</strong>
        <span class="timer" v-if="auto.phase === 'day'">{{ dayClock }}</span>
        <font-awesome-icon
          class="chevron"
          :icon="collapsed ? 'chevron-up' : 'chevron-down'"
        />
      </div>

      <div class="body" v-if="!collapsed">
        <!-- lobby -->
        <template v-if="auto.phase === 'lobby'">
          <p>
            {{ $t("{count} players in the room", { count: auto.count }) }}
            ({{ auto.min }}–{{ auto.max }}).
            <span v-if="setupText">{{ setupText }}</span>
          </p>
          <template v-if="auto.isOwner">
            <div class="settings">
              <label>
                {{ $t("Day length") }}
                <select
                  :value="auto.settings.dayMinutes"
                  @change="setting('dayMinutes', $event.target.value)"
                >
                  <option v-for="m in [3, 5, 8, 12, 20]" :key="m" :value="m">
                    {{ $t("{count} min", { count: m }) }}
                  </option>
                </select>
              </label>
              <label>
                {{ $t("Time to choose") }}
                <select
                  :value="auto.settings.choiceSeconds"
                  @change="setting('choiceSeconds', $event.target.value)"
                >
                  <option v-for="s in [30, 60, 90, 180]" :key="s" :value="s">
                    {{ $t("{count} sec", { count: s }) }}
                  </option>
                </select>
              </label>
            </div>
            <ul class="roster">
              <li v-for="(player, index) in players" :key="index">
                <span>{{ index + 1 }}. {{ player.name }}</span>
                <font-awesome-icon
                  v-if="index !== auto.seat"
                  icon="times-circle"
                  @click="kick(index)"
                />
              </li>
            </ul>
            <div class="buttons">
              <div class="button" @click="share">
                <font-awesome-icon icon="copy" /> {{ $t("Invite") }}
              </div>
              <div class="button" @click="act('shuffle')">
                <font-awesome-icon icon="random" /> {{ $t("Shuffle seats") }}
              </div>
              <div
                class="button townsfolk"
                :class="{ disabled: auto.count < auto.min }"
                @click="start"
              >
                <font-awesome-icon icon="play" /> {{ $t("Start game") }}
              </div>
            </div>
          </template>
          <template v-else>
            <p class="muted">
              {{
                $t("{name} will start the game when everyone is here.", {
                  name: auto.ownerName || "?",
                })
              }}
            </p>
            <div class="buttons">
              <div class="button" @click="share">
                <font-awesome-icon icon="copy" /> {{ $t("Invite") }}
              </div>
            </div>
          </template>
        </template>

        <!-- watching -->
        <p v-else-if="!auto.seated && auto.phase !== 'over'" class="muted">
          {{ $t("The game is already running. You are watching.") }}
        </p>

        <template v-else-if="auto.phase === 'setup'">
          <p>{{ $t("Look at your character. The night begins soon.") }}</p>
        </template>

        <template v-else-if="auto.phase === 'night'">
          <p v-if="auto.prompt">
            {{ $t("Your phone has something for you.") }}
          </p>
          <p v-else-if="auto.alive">
            {{ $t("Done. Close your eyes and wait for the morning.") }}
          </p>
          <p v-else>{{ $t("You are dead. Wait for the morning.") }}</p>
        </template>

        <template v-else-if="auto.phase === 'day'">
          <p v-if="auto.block && auto.block.index !== null">
            ⚖️
            {{
              $t("On the block: {name} ({count} votes)", {
                name: auto.block.name,
                count: auto.block.votes,
              })
            }}
          </p>
          <p v-else-if="auto.block">
            ⚖️
            {{
              $t("Tie: nobody is on the block ({count} votes)", {
                count: auto.block.votes,
              })
            }}
          </p>
          <p v-else class="muted">
            {{ $t("Talk, then nominate someone you suspect.") }}
          </p>
          <div class="buttons" v-if="!auto.voting">
            <div
              class="button demon"
              v-if="auto.canNominate"
              @click="picker = 'nominate'"
            >
              <font-awesome-icon icon="hand-point-right" />
              {{ $t("Nominate") }}
            </div>
            <div
              class="button"
              :class="{ townsfolk: auto.iAmReady }"
              v-if="auto.alive"
              @click="act('ready', { value: !auto.iAmReady })"
            >
              <font-awesome-icon icon="cloud-moon" />
              {{ auto.iAmReady ? $t("Waiting for night") : $t("End the day") }}
              ({{ auto.ready }}/{{ auto.readyNeeded }})
            </div>
            <div
              class="button mini"
              v-if="auto.canSlay"
              @click="picker = 'slay'"
            >
              <font-awesome-icon icon="skull" />
              {{ $t("Slayer shot") }}
            </div>
            <div class="button mini" v-if="auto.isOwner" @click="endDayNow">
              {{ $t("End day now") }}
            </div>
          </div>
          <p v-else class="muted">{{ $t("Voting in progress…") }}</p>
        </template>

        <template v-else-if="auto.phase === 'dusk'">
          <p>{{ $t("The day is over. Night falls soon.") }}</p>
        </template>

        <template v-else-if="auto.phase === 'over'">
          <p class="winner" :class="auto.winner">
            {{
              auto.winner === "good"
                ? $t("The good team wins!")
                : $t("The evil team wins!")
            }}
          </p>
          <p class="muted">{{ auto.reason }}</p>
          <ul class="reveal">
            <li
              v-for="(r, i) in auto.reveal"
              :key="i"
              :class="[teamOf(r.role), { dead: !r.alive }]"
            >
              <span>{{ r.name }}</span>
              <em>
                {{ roleName(r.role) }}
                <small v-if="r.shown && r.shown !== r.role">
                  ({{ $t("thought: {role}", { role: roleName(r.shown) }) }})
                </small>
              </em>
            </li>
          </ul>
          <div class="buttons" v-if="auto.isOwner">
            <div class="button townsfolk" @click="act('newGame')">
              <font-awesome-icon icon="redo-alt" /> {{ $t("New game") }}
            </div>
          </div>
        </template>

        <p class="last" v-if="lastLine">{{ lastLine }}</p>
      </div>
    </div>

    <!-- what the storyteller asks / tells this player -->
    <transition name="fade">
      <div class="sheet" v-if="prompt && !hideSheet">
        <div class="card" :class="prompt.kind">
          <div class="title">
            <span class="mini-token" v-if="promptRole">
              <Token :role="promptRole" />
            </span>
            <div>
              <h3>{{ prompt.title }}</h3>
              <small v-if="promptRole">{{ promptRole.name }}</small>
            </div>
            <span class="countdown" v-if="promptRemaining">
              {{ promptRemaining }}
            </span>
          </div>
          <p class="text">{{ prompt.text }}</p>
          <ul class="lines" v-if="prompt.lines.length">
            <li v-for="(line, i) in prompt.lines" :key="i">{{ line }}</li>
          </ul>
          <div class="tokens" v-if="promptRoles.length">
            <span v-for="r in promptRoles" :key="r.id" class="mini-token big">
              <Token :role="r" />
              <em>{{ r.name }}</em>
            </span>
          </div>
          <template v-if="prompt.kind === 'choose'">
            <div class="grid">
              <button
                v-for="(player, index) in players"
                :key="index"
                :disabled="!canPick(index)"
                :class="{
                  selected: selected.includes(index),
                  dead: player.isDead,
                }"
                @click="toggle(index)"
              >
                {{ player.name }}
                <small v-if="index === auto.seat">({{ $t("you") }})</small>
              </button>
            </div>
            <div
              class="button townsfolk wide"
              :class="{ disabled: selected.length !== prompt.count }"
              @click="answer"
            >
              {{
                selected.length === prompt.count
                  ? $t("Confirm")
                  : $t("Choose {count} more", {
                      count: prompt.count - selected.length,
                    })
              }}
            </div>
            <div
              class="button wide"
              v-if="!prompt.required"
              @click="act('ack', { promptId: prompt.id })"
            >
              {{ $t("Skip") }}
            </div>
          </template>
          <div
            v-else
            class="button townsfolk wide"
            @click="act('ack', { promptId: prompt.id })"
          >
            {{ auto.pending > 1 ? $t("Next") : $t("Got it") }}
          </div>
        </div>
      </div>
    </transition>

    <!-- picking a player for a nomination / slayer shot -->
    <transition name="fade">
      <div class="sheet" v-if="picker">
        <div class="card">
          <div class="title">
            <h3>
              {{
                picker === "nominate"
                  ? $t("Whom do you nominate?")
                  : $t("Whom do you shoot?")
              }}
            </h3>
          </div>
          <p class="text" v-if="picker === 'slay'">
            {{
              $t(
                "Everybody sees this. If you really are the Slayer and hit the Demon, the Demon dies. Once per game.",
              )
            }}
          </p>
          <div class="grid">
            <button
              v-for="(player, index) in players"
              :key="index"
              :disabled="!canTarget(index)"
              :class="{ dead: player.isDead }"
              @click="target(index)"
            >
              {{ player.name }}
            </button>
          </div>
          <div class="button wide" @click="picker = null">
            {{ $t("Cancel") }}
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script>
import { mapState } from "vuex";
import Token from "./Token";
import { autoState, autoAction } from "../auto";
import { revealState } from "../reveal";
import { notify } from "../notify";
import { unlockVoice } from "../voice";

const TEAM_NAMES = ["Townsfolk", "Outsider", "Minion", "Demon"];

export default {
  components: { Token },
  data() {
    return {
      auto: autoState,
      reveal: revealState,
      collapsed: false,
      selected: [],
      picker: null,
      now: Date.now(),
    };
  },
  computed: {
    ...mapState(["session"]),
    ...mapState("players", ["players"]),
    prompt() {
      return this.auto.prompt;
    },
    hideSheet() {
      // the "You are X" card goes first
      return this.reveal.open;
    },
    headIcon() {
      return (
        {
          lobby: "users",
          setup: "theater-masks",
          night: "cloud-moon",
          day: "sun",
          dusk: "cloud-moon",
          over: "flag-checkered",
        }[this.auto.phase] || "broadcast-tower"
      );
    },
    headTitle() {
      const a = this.auto;
      switch (a.phase) {
        case "lobby":
          return this.$t("Automatic storyteller · waiting room");
        case "setup":
          return this.$t("The game begins");
        case "night":
          return this.$t("Night {count}", { count: a.night });
        case "day":
          return this.$t("Day {count}", { count: a.day });
        case "dusk":
          return this.$t("Dusk");
        case "over":
          return this.$t("Game over");
      }
      return "";
    },
    setupText() {
      if (!this.auto.setup) return "";
      return this.auto.setup
        .map((n, i) => n + " " + this.$t(TEAM_NAMES[i]))
        .join(" · ");
    },
    elapsed() {
      return Math.max(0, this.now - this.auto.receivedAt);
    },
    dayClock() {
      const ms = Math.max(0, this.auto.dayRemaining - this.elapsed);
      const s = Math.round(ms / 1000);
      return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    },
    promptRemaining() {
      if (!this.prompt || !this.prompt.remaining) return "";
      const s = Math.max(
        0,
        Math.round((this.prompt.remaining - this.elapsed) / 1000),
      );
      return s + " sn";
    },
    promptRole() {
      return this.prompt && this.prompt.role
        ? this.getRole(this.prompt.role)
        : null;
    },
    promptRoles() {
      return this.prompt
        ? this.prompt.roles.map((id) => this.getRole(id)).filter(Boolean)
        : [];
    },
    lastLine() {
      const log = this.auto.log || [];
      return log.length ? log[log.length - 1] : "";
    },
  },
  watch: {
    "auto.prompt.id"() {
      this.selected = [];
    },
    "auto.phase"(phase) {
      this.picker = null;
      if (phase !== "lobby") this.collapsed = false;
    },
  },
  mounted() {
    this.clock = setInterval(() => (this.now = Date.now()), 1000);
  },
  beforeDestroy() {
    clearInterval(this.clock);
  },
  methods: {
    getRole(id) {
      return (
        this.$store.state.roles.get(id) ||
        this.$store.getters.rolesJSONbyId.get(id) ||
        null
      );
    },
    roleName(id) {
      const role = this.getRole(id);
      return role ? role.name : id;
    },
    teamOf(id) {
      const role = this.getRole(id);
      return role ? role.team : "";
    },
    act(action, params) {
      unlockVoice();
      autoAction(action, params);
    },
    setting(key, value) {
      this.act("settings", {
        ...this.auto.settings,
        [key]: parseInt(value, 10),
      });
    },
    start() {
      if (this.auto.count < this.auto.min) {
        notify(
          "At least {count} players are needed",
          { count: this.auto.min },
          {
            type: "warning",
          },
        );
        return;
      }
      if (
        confirm(
          this.$t("Start the game with {count} players?", {
            count: this.auto.count,
          }),
        )
      ) {
        this.act("start");
      }
    },
    kick(index) {
      const player = this.players[index];
      if (
        player &&
        confirm(this.$t("Remove {name} from the room?", { name: player.name }))
      ) {
        this.act("kick", { target: index });
      }
    },
    endDayNow() {
      if (confirm(this.$t("End the day now?"))) this.act("endDay");
    },
    share() {
      this.$root.$children[0].$refs.menu.copySessionUrl();
    },
    canPick(index) {
      const p = this.prompt;
      const player = this.players[index];
      if (!p || !player) return false;
      if (p.alive && player.isDead) return false;
      if (!p.self && index === this.auto.seat) return false;
      return true;
    },
    toggle(index) {
      if (!this.canPick(index)) return;
      const at = this.selected.indexOf(index);
      if (at >= 0) {
        this.selected.splice(at, 1);
      } else {
        if (this.selected.length >= this.prompt.count) this.selected.shift();
        this.selected.push(index);
      }
    },
    answer() {
      if (this.selected.length !== this.prompt.count) return;
      this.act("answer", {
        promptId: this.prompt.id,
        targets: this.selected.slice(),
      });
      this.selected = [];
    },
    canTarget(index) {
      const player = this.players[index];
      if (!player) return false;
      if (this.picker === "nominate")
        return !this.auto.nominees.includes(index);
      return index !== this.auto.seat && !player.isDead;
    },
    target(index) {
      const action = this.picker;
      this.picker = null;
      const player = this.players[index];
      if (action === "slay") {
        if (
          !confirm(
            this.$t("Shoot {name}? Everybody will see it.", {
              name: player.name,
            }),
          )
        ) {
          return;
        }
      }
      this.act(action, { target: index });
    },
  },
};
</script>

<style scoped lang="scss">
@import "../vars.scss";

.panel {
  position: fixed;
  z-index: 60;
  right: 16px;
  bottom: 16px;
  width: min(400px, 94vw);
  padding: 10px 14px;
  border-radius: 16px;
  background: rgba(8, 10, 18, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-left: 4px solid $townsfolk;
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  color: white;
  font-size: 92%;
  &.phase-night,
  &.phase-dusk {
    border-left-color: #8e7cff;
  }
  &.phase-day {
    border-left-color: #ffb347;
  }
  &.phase-over {
    border-left-color: $fabled;
  }
}

.head {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  strong {
    flex: 1;
    font-family: "Cormorant Garamond", Georgia, serif;
    font-size: 125%;
  }
  .timer {
    font-variant-numeric: tabular-nums;
    font-weight: bold;
    color: #ffb347;
  }
  .chevron {
    opacity: 0.6;
  }
}

.body {
  max-height: 55vh;
  overflow-y: auto;
  p {
    margin: 8px 0;
    line-height: 1.35;
  }
}

.muted {
  opacity: 0.75;
}

.last {
  font-size: 88%;
  opacity: 0.7;
  font-style: italic;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 6px;
}

.settings {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  label {
    display: flex;
    flex-direction: column;
    font-size: 85%;
    opacity: 0.9;
    flex: 1;
  }
  select {
    margin-top: 3px;
    padding: 6px;
    border-radius: 8px;
    background: #1b1f30;
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.2);
    font-size: 15px;
  }
}

.roster {
  list-style: none;
  padding: 0;
  margin: 8px 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 10px;
  li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    svg {
      cursor: pointer;
      opacity: 0.6;
    }
  }
}

.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
  .button {
    margin: 0;
    flex: 1 1 auto;
    justify-content: center;
    min-height: 40px;
    &.mini {
      flex: 0 1 auto;
      font-size: 85%;
    }
  }
}

.winner {
  font-family: "Cormorant Garamond", Georgia, serif;
  font-size: 160%;
  text-align: center;
  &.good {
    color: #6fa8ff;
  }
  &.evil {
    color: #ff5a4f;
  }
}

.reveal {
  list-style: none;
  padding: 0;
  margin: 6px 0;
  li {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 3px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    em {
      font-style: normal;
      text-align: right;
    }
    &.townsfolk em {
      color: $townsfolk;
    }
    &.outsider em {
      color: $outsider;
    }
    &.minion em {
      color: $minion;
    }
    &.demon em {
      color: $demon;
    }
    &.dead span {
      text-decoration: line-through;
      opacity: 0.6;
    }
  }
}

.sheet {
  position: fixed;
  inset: 0;
  z-index: 250;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.72);
  @media (min-width: 700px) {
    align-items: center;
  }
}

.card {
  width: 100%;
  max-width: 520px;
  max-height: 92vh;
  overflow-y: auto;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
  border-radius: 18px 18px 0 0;
  background: #0d1020;
  border-top: 3px solid #8e7cff;
  color: white;
  @media (min-width: 700px) {
    border-radius: 18px;
  }
  &.info {
    border-top-color: $fabled;
  }
}

.title {
  display: flex;
  align-items: center;
  gap: 10px;
  h3 {
    margin: 0;
    font-family: "Cormorant Garamond", Georgia, serif;
    font-size: 150%;
  }
  small {
    opacity: 0.75;
  }
  > div {
    flex: 1;
  }
  .countdown {
    font-weight: bold;
    color: #ffb347;
    font-variant-numeric: tabular-nums;
  }
}

.mini-token {
  display: inline-block;
  width: 54px;
  height: 54px;
  flex-shrink: 0;
  ::v-deep .token {
    width: 100%;
    height: 100%;
    font-size: 40%;
    cursor: default;
  }
  &.big {
    width: 76px;
    height: auto;
    text-align: center;
    ::v-deep .token {
      width: 76px;
      height: 76px;
    }
    em {
      display: block;
      font-style: normal;
      font-size: 80%;
      margin-top: 2px;
    }
  }
}

.text {
  font-size: 112%;
  line-height: 1.4;
  margin: 12px 0;
}

.lines {
  margin: 0 0 10px;
  padding-left: 18px;
  li {
    margin: 3px 0;
  }
}

.tokens {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
  margin: 10px 0 12px;
  button {
    min-height: 46px;
    padding: 6px 8px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.06);
    color: white;
    font-size: 15px;
    cursor: pointer;
    &.selected {
      background: rgba(142, 124, 255, 0.45);
      border-color: #b3a6ff;
      font-weight: bold;
    }
    &.dead {
      opacity: 0.65;
      text-decoration: line-through;
    }
    &:disabled {
      opacity: 0.25;
      cursor: default;
    }
  }
}

.button.wide {
  width: 100%;
  justify-content: center;
  margin: 6px 0 0;
  min-height: 46px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter,
.fade-leave-to {
  opacity: 0;
}
</style>
