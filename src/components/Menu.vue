<template>
  <div id="controls">
    <span
      class="nomlog-summary"
      v-show="session.voteHistory.length && session.sessionId"
      @click="toggleModal('voteHistory')"
      :title="
        $t(
          session.voteHistory.length == 1
            ? '{count} recent nomination'
            : '{count} recent nominations',
          { count: session.voteHistory.length },
        )
      "
    >
      <font-awesome-icon icon="book-dead" />
      {{ session.voteHistory.length }}
    </span>
    <span
      class="session"
      :class="{
        spectator: session.isSpectator,
        reconnecting: session.isReconnecting,
      }"
      v-if="session.sessionId"
      @click="leaveSession"
      :title="
        $t('{count} other players in this session', {
          count: session.playerCount,
        }) + (session.ping ? ' (' + session.ping + 'ms)' : '')
      "
    >
      <font-awesome-icon icon="broadcast-tower" />
      {{ session.playerCount }}
    </span>
    <div class="menu" :class="{ open: grimoire.isMenuOpen }">
      <font-awesome-icon icon="cog" @click="toggleMenu" />
      <ul>
        <li class="tabs" :class="tab">
          <font-awesome-icon icon="book-open" @click="tab = 'grimoire'" />
          <font-awesome-icon icon="broadcast-tower" @click="tab = 'session'" />
          <font-awesome-icon
            icon="users"
            v-if="!session.isSpectator"
            @click="tab = 'players'"
          />
          <font-awesome-icon icon="theater-masks" @click="tab = 'characters'" />
          <font-awesome-icon icon="question" @click="tab = 'help'" />
        </li>

        <template v-if="tab === 'grimoire'">
          <!-- Grimoire -->
          <li class="headline">{{ $t("Grimoire") }}</li>
          <li @click="toggleGrimoire" v-if="players.length">
            <template v-if="!grimoire.isPublic">{{ $t("Hide") }}</template>
            <template v-if="grimoire.isPublic">{{ $t("Show") }}</template>
            <em>[G]</em>
          </li>
          <li @click="toggleNight" v-if="!session.isSpectator">
            <template v-if="!grimoire.isNight">{{
              $t("Switch to Night")
            }}</template>
            <template v-if="grimoire.isNight">{{
              $t("Switch to Day")
            }}</template>
            <em>[S]</em>
          </li>
          <li @click="toggleNightOrder" v-if="players.length">
            {{ $t("Night order") }}
            <em>
              <font-awesome-icon
                :icon="[
                  'fas',
                  grimoire.isNightOrder ? 'check-square' : 'square',
                ]"
              />
            </em>
          </li>
          <li v-if="players.length">
            {{ $t("Zoom") }}
            <em>
              <font-awesome-icon
                @click="setZoom(grimoire.zoom - 1)"
                icon="search-minus"
              />
              {{ Math.round(100 + grimoire.zoom * 10) }}%
              <font-awesome-icon
                @click="setZoom(grimoire.zoom + 1)"
                icon="search-plus"
              />
            </em>
          </li>
          <li v-if="!edition.isOfficial" @click="imageOptIn">
            <small>{{ $t("Show Custom Images") }}</small>
            <em
              ><font-awesome-icon
                :icon="[
                  'fas',
                  grimoire.isImageOptIn ? 'check-square' : 'square',
                ]"
            /></em>
          </li>
          <li @click="toggleMuted">
            {{ $t("Mute Sounds") }}
            <em
              ><font-awesome-icon
                :icon="['fas', grimoire.isMuted ? 'volume-mute' : 'volume-up']"
            /></em>
          </li>
          <li @click="toggleLocale">
            {{ $t("Language") }}
            <em>{{ currentLanguage }}</em>
          </li>
        </template>

        <template v-if="tab === 'session'">
          <!-- Session -->
          <li class="headline" v-if="session.sessionId">
            {{ session.isSpectator ? $t("Playing") : $t("Hosting") }}
          </li>
          <li class="headline" v-else>
            {{ $t("Live Session") }}
          </li>
          <template v-if="!session.sessionId">
            <li @click="hostSession">
              {{ $t("Host (Storyteller)") }}<em>[H]</em>
            </li>
            <li @click="joinSession">{{ $t("Join (Player)") }}<em>[J]</em></li>
          </template>
          <template v-else>
            <li v-if="session.ping">
              {{
                session.isSpectator
                  ? $t("Delay to host")
                  : $t("Delay to players")
              }}
              <em>{{ session.ping }}ms</em>
            </li>
            <li v-if="session.isSpectator" @click="askPlayerName(true)">
              {{ $t("Your name") }}
              <em>{{ session.playerName || "—" }}</em>
            </li>
            <li @click="copySessionUrl">
              {{ $t("Copy player link") }}
              <em><font-awesome-icon icon="copy" /></em>
            </li>
            <li v-if="!session.isSpectator" @click="distributeRoles">
              {{ $t("Send Characters") }}
              <em><font-awesome-icon icon="theater-masks" /></em>
            </li>
            <li
              v-if="session.voteHistory.length || !session.isSpectator"
              @click="toggleModal('voteHistory')"
            >
              {{ $t("Vote history") }}<em>[V]</em>
            </li>
            <li @click="leaveSession">
              {{ $t("Leave Session") }}
              <em>{{ session.sessionId }}</em>
            </li>
          </template>
        </template>

        <template v-if="tab === 'players' && !session.isSpectator">
          <!-- Users -->
          <li class="headline">{{ $t("Players") }}</li>
          <li @click="addPlayer" v-if="players.length < 20">
            {{ $t("Add") }}<em>[A]</em>
          </li>
          <li @click="randomizeSeatings" v-if="players.length > 2">
            {{ $t("Randomize") }}
            <em><font-awesome-icon icon="dice" /></em>
          </li>
          <li @click="clearPlayers" v-if="players.length">
            {{ $t("Remove all") }}
            <em><font-awesome-icon icon="trash-alt" /></em>
          </li>
        </template>

        <template v-if="tab === 'characters'">
          <!-- Characters -->
          <li class="headline">{{ $t("Characters") }}</li>
          <li v-if="!session.isSpectator" @click="toggleModal('edition')">
            {{ $t("Select Edition") }}
            <em>[E]</em>
          </li>
          <li
            @click="toggleModal('roles')"
            v-if="!session.isSpectator && players.length > 4"
          >
            {{ $t("Choose & Assign") }}
            <em>[C]</em>
          </li>
          <li v-if="!session.isSpectator" @click="toggleModal('homebrew')">
            {{ $t("Homebrew characters") }}
            <em><font-awesome-icon icon="user-edit" /></em>
          </li>
          <li v-if="!session.isSpectator" @click="toggleModal('fabled')">
            {{ $t("Add Fabled") }}
            <em><font-awesome-icon icon="dragon" /></em>
          </li>
          <li @click="clearRoles" v-if="players.length">
            {{ $t("Remove all") }}
            <em><font-awesome-icon icon="trash-alt" /></em>
          </li>
        </template>

        <template v-if="tab === 'help'">
          <!-- Help -->
          <li class="headline">{{ $t("Help") }}</li>
          <li @click="toggleModal('reference')">
            {{ $t("Reference Sheet") }}
            <em>[R]</em>
          </li>
          <li @click="toggleModal('nightOrder')">
            {{ $t("Night Order Sheet") }}
            <em>[N]</em>
          </li>
          <li
            v-if="!pwa.isStandalone && (pwa.canInstall || pwa.isIOS)"
            @click="installApp"
          >
            {{ $t("Add to home screen") }}
            <em><font-awesome-icon icon="file-upload" /></em>
          </li>
        </template>
      </ul>
    </div>
  </div>
</template>

<script>
import { mapMutations, mapState } from "vuex";
import { languages, setLocale } from "../i18n";
import { pwaState, install } from "../pwa";

export default {
  computed: {
    currentLanguage() {
      const lang = languages.find((l) => l.id === this.$i18n.locale);
      return lang ? lang.name : this.$i18n.locale;
    },
    ...mapState(["grimoire", "session", "edition"]),
    ...mapState("players", ["players"]),
  },
  data() {
    return {
      pwa: pwaState,
      tab: "grimoire",
    };
  },
  mounted() {
    this._outside = (event) => {
      if (this.grimoire.isMenuOpen && !this.$el.contains(event.target)) {
        this.$store.commit("toggleMenu");
      }
    };
    document.addEventListener("pointerdown", this._outside);
  },
  beforeDestroy() {
    document.removeEventListener("pointerdown", this._outside);
  },
  methods: {
    async installApp() {
      if (pwaState.canInstall) {
        await install();
      } else {
        alert(
          this.$t(
            'In Safari, tap the Share button and choose "Add to Home Screen".',
          ),
        );
      }
    },
    toggleLocale() {
      const index = languages.findIndex((l) => l.id === this.$i18n.locale);
      setLocale(languages[(index + 1) % languages.length].id);
    },
    setBackground() {
      const background = prompt(this.$t("Enter custom background URL"));
      if (background || background === "") {
        this.$store.commit("setBackground", background);
      }
    },
    hostSession() {
      if (this.session.sessionId) return;
      const sessionId = prompt(
        this.$t("Enter a channel number / name for your session"),
        Math.round(Math.random() * 10000),
      );
      if (sessionId) {
        this.$store.commit("session/clearVoteHistory");
        this.$store.commit("session/setSpectator", false);
        this.$store.commit("session/setSessionId", sessionId);
        this.copySessionUrl();
      }
    },
    copySessionUrl() {
      const url = window.location.href.split("#")[0];
      const link = url + "#" + this.session.sessionId;
      navigator.clipboard.writeText(link);
    },
    distributeRoles() {
      if (this.session.isSpectator) return;
      const popup = this.$t(
        "Do you want to distribute assigned characters to all SEATED players?",
      );
      if (confirm(popup)) {
        this.$store.commit("session/distributeRoles", true);
        setTimeout(
          (() => {
            this.$store.commit("session/distributeRoles", false);
          }).bind(this),
          2000,
        );
      }
    },
    imageOptIn() {
      const popup = this.$t(
        "Are you sure you want to allow custom images? A malicious script file author might track your IP address this way.",
      );
      if (this.grimoire.isImageOptIn || confirm(popup)) {
        this.toggleImageOptIn();
      }
    },
    joinSession() {
      if (this.session.sessionId) return this.leaveSession();
      let sessionId = prompt(
        this.$t(
          "Enter the channel number / name of the session you want to join",
        ),
      );
      if (sessionId && sessionId.match(/^https?:\/\//i)) {
        sessionId = sessionId.split("#").pop();
      }
      if (sessionId) {
        this.askPlayerName();
        // the table comes from the Storyteller, drop anything left over locally
        this.$store.commit("players/clear");
        this.$store.commit("session/clearVoteHistory");
        this.$store.commit("session/setSpectator", true);
        this.$store.commit("toggleGrimoire", false);
        this.$store.commit("session/setSessionId", sessionId);
      }
    },
    askPlayerName(force = false) {
      if (this.session.playerName && !force) return;
      const name = prompt(
        this.$t("Your name (the Storyteller sees it at the table)"),
        this.session.playerName || "",
      );
      if (name && name.trim()) {
        this.$store.commit("session/setPlayerName", name.trim().substr(0, 30));
      }
    },
    leaveSession() {
      if (
        confirm(this.$t("Are you sure you want to leave the active live game?"))
      ) {
        this.$store.commit("session/setSpectator", false);
        this.$store.commit("session/setSessionId", "");
      }
    },
    addPlayer() {
      if (this.session.isSpectator) return;
      if (this.players.length >= 20) return;
      const name = prompt(this.$t("Player name"));
      if (name) {
        this.$store.commit("players/add", name);
      }
    },
    randomizeSeatings() {
      if (this.session.isSpectator) return;
      if (confirm(this.$t("Are you sure you want to randomize seatings?"))) {
        this.$store.dispatch("players/randomize");
      }
    },
    clearPlayers() {
      if (this.session.isSpectator) return;
      if (confirm(this.$t("Are you sure you want to remove all players?"))) {
        // abort vote if in progress
        if (this.session.nomination) {
          this.$store.commit("session/nomination");
        }
        this.$store.commit("players/clear");
      }
    },
    clearRoles() {
      if (
        confirm(this.$t("Are you sure you want to remove all player roles?"))
      ) {
        this.$store.dispatch("players/clearRoles");
      }
    },
    toggleNight() {
      this.$store.commit("toggleNight");
      if (this.grimoire.isNight) {
        this.$store.commit("session/setMarkedPlayer", -1);
      }
    },
    ...mapMutations([
      "toggleGrimoire",
      "toggleMenu",
      "toggleImageOptIn",
      "toggleMuted",
      "toggleNightOrder",
      "toggleStatic",
      "setZoom",
      "toggleModal",
    ]),
  },
};
</script>

<style scoped lang="scss">
@import "../vars.scss";

// success animation
@keyframes greenToWhite {
  from {
    color: green;
  }
  to {
    color: white;
  }
}

// Controls
#controls {
  position: absolute;
  right: 3px;
  top: 3px;
  text-align: right;
  padding-right: 50px;
  z-index: 75;

  svg {
    filter: drop-shadow(0 0 5px rgba(0, 0, 0, 1));
    &.success {
      animation: greenToWhite 1s normal forwards;
      animation-iteration-count: 1;
    }
  }

  > span {
    display: inline-block;
    cursor: pointer;
    z-index: 5;
    margin-top: 7px;
    margin-left: 10px;
  }

  span.nomlog-summary {
    color: $townsfolk;
  }

  span.session {
    color: $demon;
    &.spectator {
      color: $townsfolk;
    }
    &.reconnecting {
      animation: blink 1s infinite;
    }
  }
}

@keyframes blink {
  50% {
    opacity: 0.5;
    color: gray;
  }
}

.menu {
  width: 220px;
  transform-origin: 200px 22px;
  transition: transform 500ms cubic-bezier(0.68, -0.55, 0.27, 1.55);
  transform: rotate(-90deg);
  position: absolute;
  right: 0;
  top: 0;

  &.open {
    transform: rotate(0deg);
  }

  > svg {
    cursor: pointer;
    background: rgba(0, 0, 0, 0.5);
    border: 3px solid black;
    width: 40px;
    height: 50px;
    margin-bottom: -8px;
    border-bottom: 0;
    border-radius: 10px 10px 0 0;
    padding: 5px 5px 15px;
  }

  a {
    color: white;
    text-decoration: none;
    &:hover {
      color: red;
    }
  }

  ul {
    display: flex;
    list-style-type: none;
    padding: 0;
    margin: 0;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 0 10px black;
    border: 3px solid black;
    border-radius: 10px 0 10px 10px;

    li {
      padding: 2px 5px;
      color: white;
      text-align: left;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 30px;

      &.tabs {
        display: flex;
        padding: 0;
        svg {
          flex-grow: 1;
          flex-shrink: 0;
          height: 35px;
          border-bottom: 3px solid black;
          border-right: 3px solid black;
          padding: 5px 0;
          cursor: pointer;
          transition: color 250ms;
          &:hover {
            color: red;
          }
          &:last-child {
            border-right: 0;
          }
        }
        &.grimoire .fa-book-open,
        &.players .fa-users,
        &.characters .fa-theater-masks,
        &.session .fa-broadcast-tower,
        &.help .fa-question {
          background: linear-gradient(
            to bottom,
            $townsfolk 0%,
            rgba(0, 0, 0, 0.5) 100%
          );
        }
      }

      &:not(.headline):not(.tabs):hover {
        cursor: pointer;
        color: red;
      }

      em {
        flex-grow: 0;
        font-style: normal;
        margin-left: 10px;
        font-size: 80%;
      }
    }

    .headline {
      font-family: "Cormorant Garamond", Georgia, serif;
      font-weight: 700;
      letter-spacing: 1px;
      padding: 0 10px;
      text-align: center;
      justify-content: center;
      background: linear-gradient(
        to right,
        $townsfolk 0%,
        rgba(0, 0, 0, 0.5) 20%,
        rgba(0, 0, 0, 0.5) 80%,
        $demon 100%
      );
    }
  }
}

// Phones: wider panel, bigger touch targets, respects the notch / status bar
@media (max-width: 767.98px) {
  #controls {
    top: calc(6px + env(safe-area-inset-top));
    right: calc(6px + env(safe-area-inset-right));
    padding-right: 52px;
    > span {
      margin-top: 12px;
      font-size: 110%;
    }
  }
  .menu {
    width: min(88vw, 340px);
    transform-origin: calc(100% - 22px) 22px;
    transform: scale(0.6);
    opacity: 0;
    pointer-events: none;
    transition:
      transform 220ms ease,
      opacity 180ms ease;

    > svg {
      pointer-events: all;
      width: 44px;
      height: 44px;
      margin-bottom: 0;
      padding: 9px;
      border: 2px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(6px);
    }

    &.open {
      transform: none;
      opacity: 1;
      pointer-events: all;
      > svg {
        border-color: rgba(255, 255, 255, 0.35);
      }
    }

    ul {
      margin-top: 8px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 16px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.7);
      background: rgba(10, 12, 20, 0.92);
      backdrop-filter: blur(10px);
      max-height: calc(100dvh - 80px - env(safe-area-inset-top));
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;

      li {
        background: transparent;
        min-height: 48px;
        padding: 6px 16px;
        font-size: 108%;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        &:last-child {
          border-bottom: 0;
        }
        em {
          font-size: 90%;
          opacity: 0.85;
        }
        &.tabs {
          position: sticky;
          top: 0;
          z-index: 2;
          padding: 6px;
          gap: 4px;
          background: rgba(10, 12, 20, 0.97);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          svg {
            height: 44px;
            padding: 10px 0;
            border: 0;
            border-radius: 10px;
            opacity: 0.6;
            &:hover {
              color: white;
            }
            &:last-child {
              border-right: 0;
            }
          }
          &.grimoire .fa-book-open,
          &.players .fa-users,
          &.characters .fa-theater-masks,
          &.session .fa-broadcast-tower,
          &.help .fa-question {
            opacity: 1;
            background: linear-gradient(180deg, $townsfolk, #0b2a6b);
          }
        }
        &:not(.headline):not(.tabs):active {
          background: rgba(255, 255, 255, 0.08);
        }
        &:not(.headline):not(.tabs):hover {
          color: white;
        }
      }

      .headline {
        min-height: 40px;
        font-size: 115%;
        background: linear-gradient(
          to right,
          rgba(31, 101, 255, 0.35) 0%,
          transparent 30%,
          transparent 70%,
          rgba(206, 1, 0, 0.35) 100%
        );
      }
    }
  }
}
</style>
