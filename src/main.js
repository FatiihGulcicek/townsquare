import Vue from "vue";
import App from "./App";
import { registerServiceWorker } from "./pwa";
import { setupPush } from "./push";
import "@fontsource/cinzel/700.css";

registerServiceWorker();
// refresh the push subscription when notifications were already allowed
setupPush();
Vue.config.productionTip = false;

new Vue({ render: (h) => h(App) }).$mount("#app");
