// a build id lets open apps notice that a new version was deployed
const BUILD = String(Date.now());
process.env.VUE_APP_BUILD = BUILD;

class VersionFile {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap("VersionFile", (compilation) => {
      compilation.hooks.processAssets.tap(
        { name: "VersionFile", stage: compilation.constructor.PROCESS_ASSETS_STAGE_ADDITIONAL },
        () => {
          const { RawSource } = compiler.webpack.sources;
          compilation.emitAsset("version.json", new RawSource(JSON.stringify({ build: BUILD })));
        },
      );
    });
  }
}

module.exports = {
  publicPath: "/",
  configureWebpack: {
    plugins: [new VersionFile()],
    // a game with artwork: the size hints are expected
    performance: { hints: false },
  },
};
