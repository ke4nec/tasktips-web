/* TaskTips Web Service Worker（设计文档 §11.2）。
 *
 * - 注册作用域 /app/，只处理该路径下的 GET 请求，不碰 /api/ 与管理后台。
 * - 版本化应用外壳缓存：发版时递增 CACHE_VERSION；旧版本在激活后清理。
 * - 不缓存认证响应、API 响应与带凭据下载；API 直接联网，由应用层决定本地/远端。
 * - 不自动 reload：新版本下载后通知页面，由用户在保存完成后手动刷新。
 */
const CACHE_VERSION = "tasktips-web-v1";
const APP_BASE = "/app/";
const SHELL = [
  `${APP_BASE}`,
  `${APP_BASE}index.html`,
  `${APP_BASE}manifest.webmanifest`,
  `${APP_BASE}favicon.svg`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      ),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(APP_BASE)) return;
  // 导航请求：网络优先，离线回退应用壳。
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(`${APP_BASE}index.html`, copy));
          return response;
        })
        .catch(() => caches.match(`${APP_BASE}index.html`)),
    );
    return;
  }
  // 版本化静态资源：缓存优先命中，后台更新。
  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => hit);
      return hit || network;
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "get-version" && event.ports[0]) {
    event.ports[0].postMessage(CACHE_VERSION);
  }
});
