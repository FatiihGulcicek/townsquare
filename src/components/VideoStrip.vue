<template>
  <div class="videos" v-if="tiles.length">
    <div
      v-for="t in tiles"
      :key="t.pid"
      class="tile"
      :class="{ me: t.me, talking: vc.speaking[t.pid], big: big === t.pid }"
      @click="big = big === t.pid ? null : t.pid"
    >
      <VideoView :stream="t.stream" :mirror="t.me" />
      <span class="name">{{ t.name }}</span>
    </div>
  </div>
</template>

<script>
import { game } from "../game";
import { voiceChat, visibleVideos } from "../voicechat";

const VideoView = {
  props: { stream: Object, mirror: Boolean },
  render(h) {
    return h("video", {
      attrs: { autoplay: true, playsinline: true, muted: true },
      domProps: { muted: true },
      class: { mirror: this.mirror },
    });
  },
  mounted() {
    this.attach();
  },
  watch: {
    stream() {
      this.attach();
    },
  },
  methods: {
    attach() {
      const el = this.$el;
      if (el.srcObject !== this.stream) el.srcObject = this.stream;
      el.play && el.play().catch(() => {});
    },
  },
};

export default {
  components: { VideoView },
  data() {
    return { vc: voiceChat, game, big: null };
  },
  computed: {
    tiles() {
      // depends on these so it recomputes
      void this.vc.videos;
      void (this.game.state && this.game.state.voice);
      const s = this.game.state;
      if (!s || !this.vc.on) return [];
      const nameOf = (pid) => {
        if (pid === "st") return "Anlatıcı";
        const p = s.players.find((x) => x.pid === pid);
        return p ? p.name : "";
      };
      const list = visibleVideos().map((v) => ({
        ...v,
        name: nameOf(v.pid),
        me: false,
      }));
      if (this.vc.camOn && this.vc.localVideo) {
        list.unshift({
          pid: s.voice.me,
          stream: this.vc.localVideo,
          name: "Sen",
          me: true,
        });
      }
      return list;
    },
  },
};
</script>

<style scoped lang="scss">
@import "../vars";
.videos {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 8px 0 4px;
  margin-top: 8px;
  &::-webkit-scrollbar {
    display: none;
  }
}
.tile {
  position: relative;
  flex: 0 0 auto;
  width: 104px;
  height: 138px;
  border-radius: 14px;
  overflow: hidden;
  background: #111;
  border: 2px solid rgba(255, 255, 255, 0.15);
  transition:
    width 0.25s,
    height 0.25s;
  &.talking {
    border-color: #3ddc84;
    box-shadow: 0 0 14px rgba(61, 220, 132, 0.6);
  }
  &.big {
    width: 220px;
    height: 292px;
  }
  ::v-deep video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    &.mirror {
      transform: scaleX(-1);
    }
  }
  .name {
    position: absolute;
    left: 6px;
    bottom: 5px;
    font-size: 12px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.6);
  }
}
</style>
