<template>
  <transition name="coach">
    <div
      class="coach"
      :class="{ lobby: game.state && game.state.phase === 'lobby' }"
      v-if="step && !hidden[step.key]"
      :key="step.key"
    >
      <span class="owl">🦉</span>
      <div class="bubble">
        <b>Rehber</b>
        <p>{{ step.text }}</p>
        <button @click="hide(step.key)">Anladım</button>
      </div>
    </div>
  </transition>
</template>

<script>
import { game } from "../game";

export default {
  data() {
    return { game, hidden: {} };
  },
  computed: {
    step() {
      const s = game.state;
      if (!s) return null;
      const me = s.me;
      const voted = s.votes && s.votes[me.pid];
      if (s.phase === "lobby") {
        return {
          key: "lobby",
          text: "Hoş geldin! Beş bot seninle oynayacak. Hazır olduğunda Oyunu başlat düğmesine dokun.",
        };
      }
      if (s.phase === "roles" && !me.role) {
        return {
          key: "card",
          text: "Masadan bir kart seç. Kart senin rolünü belirler; kimseye gösterme!",
        };
      }
      if (s.phase === "roles") {
        return {
          key: "role",
          text: "Sen Gözcüsün! Her gece bir kişinin vampir olup olmadığını öğrenirsin. Gece birazdan başlıyor.",
        };
      }
      if (me.seated && !me.alive && s.phase !== "over") {
        return {
          key: "dead",
          text: "Öldün! Ama oyun bitmedi: 👻 Hayalet tahmini ile vampirleri tahmin etmeyi deneyebilirsin. Botlu oyunlarda ödül verilmez.",
        };
      }
      if (s.phase === "night" && s.night && !s.night.done) {
        return {
          key: "night" + s.round,
          text: "Gece oldu. Şüphelendiğin birine dokun; vampir olup olmadığını hemen göreceksin.",
        };
      }
      if (s.phase === "night") {
        return {
          key: "nightdone" + s.round,
          text: "Sonucu gördün! Unutmamak için oyuncuya dokunup 🔴 Şüpheli ya da 🟢 Temiz diye not al. Sabahı bekle.",
        };
      }
      if ((s.phase === "day" || s.phase === "runoff") && !voted) {
        return {
          key: "day" + s.round,
          text: "Gündüz! Gece olanlar açıklandı. 💬 sohbetten botlara soru sor (adlarını yazarsan cevap verirler). Sonra vampir sandığın kişiye dokunarak oy ver.",
        };
      }
      if (s.phase === "day") {
        return {
          key: "voted" + s.round,
          text: "Oyunu verdin. Herkes oy verince en çok oyu alan asılır. İpucu: Gözcü olduğunu söylemek botları ikna eder ama vampirler de seni hedef alır!",
        };
      }
      if (s.phase === "lastwords" || s.phase === "dusk") {
        return {
          key: "dusk" + s.round,
          text: "Köy kararını verdi. Asılanın rolü açıklanır: tahminin doğru muydu?",
        };
      }
      if (s.phase === "over") {
        return {
          key: "over",
          text: "Oyun bitti! Oyunun yıldızını seç, 🎬 hikâyeyi izle. Artık arkadaşlarınla gerçek bir oyun kurabilirsin 🎉",
        };
      }
      return null;
    },
  },
  methods: {
    hide(key) {
      this.$set(this.hidden, key, true);
    },
  },
};
</script>

<style scoped lang="scss">
@import "../vars";
.coach {
  position: fixed;
  z-index: 125;
  left: 10px;
  right: 10px;
  bottom: calc(86px + env(safe-area-inset-bottom));
  max-width: 540px;
  margin: 0 auto;
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.coach.lobby {
  top: calc(66px + env(safe-area-inset-top));
  bottom: auto;
}
.owl {
  font-size: 40px;
  animation: bob 2.4s ease-in-out infinite;
}
.bubble {
  flex: 1;
  background: rgba(20, 22, 40, 0.97);
  border: 1px solid $gold;
  border-radius: 16px 16px 16px 4px;
  padding: 10px 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  b {
    color: $gold;
    font-size: 13px;
  }
  p {
    margin: 4px 0 8px;
    font-size: 15px;
    line-height: 1.4;
  }
  button {
    border: 0;
    border-radius: 14px;
    padding: 6px 14px;
    background: $gold;
    color: #1a1204;
    font-weight: 700;
  }
}
@keyframes bob {
  50% {
    transform: translateY(-6px);
  }
}
.coach-enter-active,
.coach-leave-active {
  transition: all 0.3s;
}
.coach-enter,
.coach-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
</style>
