import { createPinia } from "pinia";
import { createApp } from "vue";

import App from "@/App.vue";
import { router } from "@/app/router";
import { installSessionE2EHook } from "@/stores/session";
import { useThemeStore } from "@/stores/theme";
import "@/styles/base.css";
import "@/styles/theme.css";
import "@/styles/components.css";

const app = createApp(App);
app.use(createPinia());
app.use(router);
// 主题尽早应用，与 theme-boot 首帧引导衔接；跟随系统时监听变化。
useThemeStore().initTheme();
installSessionE2EHook();
app.mount("#app");
