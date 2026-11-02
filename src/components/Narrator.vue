<template>
  <span style="display: none"></span>
</template>

<script>
import { mapState } from "vuex";
import { speak as say } from "../voice";
import { autoState } from "../auto";

// the automatic storyteller narrates by itself
const speak = (text) => {
  if (!autoState.active) say(text);
};

/*
 * Renderless component that narrates the game out loud:
 * night and day, deaths, nominations, votes and their results.
 */
export default {
  data() {
    return { nightDeaths: [] };
  },
  computed: {
    ...mapState(["grimoire", "session"]),
    ...mapState("players", ["players"]),
    isNight() {
      return this.grimoire.isNight;
    },
    deadNames() {
      return this.players.filter((p) => p.isDead).map((p) => p.name);
    },
    nominationKey() {
      const n = this.session.nomination;
      return n ? n.join("-") : "";
    },
    voteCount() {
      return this.session.voteHistory.length;
    },
  },
  watch: {
    isNight(night) {
      if (!this.session.sessionId && !this.players.length) return;
      if (night) {
        this.nightDeaths = [];
        speak("Gece çöktü. Kasaba uyusun, herkes gözlerini kapatsın.");
      } else {
        const deaths = this.nightDeaths.filter((n) =>
          this.deadNames.includes(n),
        );
        let text = "Günaydın kasaba! Gün doğdu, herkes gözlerini açsın.";
        if (deaths.length === 1) {
          text += " Ne yazık ki bu gece " + deaths[0] + " öldü.";
        } else if (deaths.length > 1) {
          text += " Bu gece ölenler: " + deaths.join(", ") + ".";
        } else {
          text += " Bu gece kimse ölmedi.";
        }
        this.nightDeaths = [];
        speak(text);
      }
    },
    deadNames(now, before) {
      const fresh = now.filter((n) => !(before || []).includes(n));
      if (!fresh.length) return;
      if (this.isNight) {
        // announced at dawn, together with the other night deaths
        this.nightDeaths.push(...fresh);
      } else {
        speak(fresh.join(", ") + (fresh.length > 1 ? " öldüler." : " öldü."));
      }
    },
    nominationKey(key) {
      if (!key) return;
      const [a, b] = this.session.nomination;
      const nominator = this.players[a];
      const nominee = this.players[b];
      if (!nominator || !nominee) return;
      speak(
        nominator.name +
          ", " +
          nominee.name +
          " adlı oyuncuyu aday gösterdi. Savunmalar dinlensin.",
      );
    },
    "session.isVoteInProgress"(inProgress) {
      if (inProgress) {
        speak("Oylama başlıyor. Ellerinizi hazırlayın.");
      }
    },
    voteCount(count, before) {
      if (count <= before) return;
      const last = this.session.voteHistory[count - 1];
      if (!last) return;
      const votes = last.votes.length;
      const enough = votes >= last.majority;
      speak(
        last.nominee +
          " için " +
          votes +
          " oy çıktı. " +
          (enough
            ? "En az " + last.majority + " oy gerekiyordu, bu yeterli."
            : "En az " + last.majority + " oy gerekiyordu, bu yetmedi."),
      );
    },
  },
};
</script>
