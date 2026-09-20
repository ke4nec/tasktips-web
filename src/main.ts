import { createPinia } from "pinia";
import { createApp } from "vue";

import App from "@/App.vue";
import { registerSW } from "@/app/pwa";
import { router } from "@/app/router";
import { installSessionE2EHook, useSessionStore } from "@/stores/session";
import { useThemeStore } from "@/stores/theme";
import "@/styles/base.css";
import "@/styles/theme.css";
import "@/styles/components.css";

const app = createApp(App);
app.use(createPinia());
app.use(router);
// 主题尽早应用，与 index.html 内联首帧引导衔接；跟随系统时监听变化。
useThemeStore().initTheme();
installSessionE2EHook();
// 启动恢复浏览器会话（§8.3）：ready() 缓存同一次恢复，路由守卫等待同一 Promise。
await useSessionStore()
  .ready()
  .catch(() => false);
app.mount("#app");
// 离线应用资源（仅生产）：Service Worker 注册在 /app/ 作用域。
void registerSW();
