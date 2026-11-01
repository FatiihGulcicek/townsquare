<template>
  <div class="intro">
    <img src="static/apple-icon.png" alt="" class="logo" />
    <h1 class="wordmark">Kasaba Meydanı</h1>
    <p class="tagline">
      {{ $t("A virtual town square and grimoire for your online games") }}
    </p>
    <div class="actions">
      <div class="button townsfolk" @click="$parent.$refs.menu.hostSession()">
        <font-awesome-icon icon="broadcast-tower" />
        {{ $t("Host (Storyteller)") }}
      </div>
      <div class="button" @click="$parent.$refs.menu.joinSession()">
        <font-awesome-icon icon="chair" />
        {{ $t("Join (Player)") }}
      </div>
    </div>
    <div class="install" v-if="!pwa.isStandalone && (pwa.canInstall || pwa.isIOS)">
      <span class="link" @click="installApp">
        <font-awesome-icon icon="file-upload" />
        {{ $t("Add to home screen") }}
      </span>
      <p v-if="showIOSHelp" class="ios-help">
        {{
          $t(
            "In Safari, tap the Share button and choose \"Add to Home Screen\"."
          )
        }}
      </p>
    </div>
    <p class="hint">
      {{ $t("Add players through the") }}
      <span class="link" @click="toggleMenu"
        ><font-awesome-icon icon="cog" /> {{ $t("Menu") }}</span
      >
      (<b>A</b>) · {{ $t("join with") }} <b>J</b>
    </p>
    <div class="footer">
      {{
        $t(
          "Community made and free. Not affiliated with The Pandemonium Institute; \"Blood on the Clocktower\" is a trademark of Steven Medway and The Pandemonium Institute. Based on the open source"
        )
      }}
      <a href="https://github.com/bra1n/townsquare" target="_blank" rel="noopener"
        >townsquare</a
      >
      (GPL-3.0).
    </div>
  </div>
</template>

<script>
import { mapMutations } from "vuex";
import { pwaState, install } from "../pwa";

export default {
  data() {
    return {
      pwa: pwaState,
      showIOSHelp: false,
    };
  },
  methods: {
    async installApp() {
      if (pwaState.canInstall) {
        await install();
      } else {
        this.showIOSHelp = !this.showIOSHelp;
      }
    },
    ...mapMutations(["toggleMenu"]),
  },
};
</script>

<style scoped lang="scss">
@import "../vars.scss";

.intro {
  text-align: center;
  width: min(92vw, 620px);
  position: absolute;
  z-index: 3;
  padding: 28px 28px 18px;
  background: linear-gradient(
    180deg,
    rgba(10, 14, 34, 0.82),
    rgba(4, 6, 15, 0.9)
  );
  border: 1px solid rgba(233, 180, 76, 0.45);
  border-radius: 18px;
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(4px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  animation: intro-in 600ms ease-out both;
}

.logo {
  width: min(30vw, 150px);
  margin-top: -100px;
  border-radius: 50%;
  border: 3px solid black;
  box-shadow: 0 0 10px black;
}

.wordmark {
  font-family: "Cinzel", Georgia, serif;
  font-weight: 700;
  font-size: clamp(28px, 6vw, 46px);
  line-height: 1.1;
  letter-spacing: 1px;
  background: linear-gradient(180deg, #f6d58a, #c08a2e);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  margin: 0;
}

.tagline {
  margin: 0;
  color: #cfd6ee;
  font-size: 95%;
}

.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 6px;
  .button {
    margin: 0;
    font-size: 95%;
  }
}

.link {
  cursor: pointer;
  color: #e9b44c;
  white-space: nowrap;
  &:hover {
    color: #fff;
  }
}

.install {
  font-size: 90%;
  .ios-help {
    margin: 6px 0 0;
    opacity: 0.85;
  }
}

.hint {
  margin: 4px 0 0;
  font-size: 85%;
  opacity: 0.8;
}

.footer {
  font-size: 62%;
  opacity: 0.6;
  line-height: 1.4;
  a {
    color: inherit;
  }
}

@keyframes intro-in {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.98);
  }
}
</style>
