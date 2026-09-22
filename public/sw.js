// 构建时填入内容版本与完整资源清单；安装不完整时保留上一版本。
const CACHE_VERSION = "__CACHE_VERSION__";
const SHELL = ["__PRECACHE_MANIFEST__"];
const APP_BASE = "/app/";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("tasktips-web-") && key !== CACHE_VERSION)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(APP_BASE)
  )
    return;
  // HTML 与资源属于同一版本，避免新 HTML 引用尚未缓存的资源。
  if (request.mode === "navigate") {
    event.respondWith(
      caches
        .open(CACHE_VERSION)
        .then(async (cache) => (await cache.match(`${APP_BASE}index.html`)) || fetch(request)),
    );
  } else if (SHELL.includes(url.pathname)) {
    event.respondWith(
      caches
        .open(CACHE_VERSION)
        .then(
          async (cache) => (await cache.match(request, { ignoreSearch: true })) || fetch(request),
        ),
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "activate-update") event.waitUntil(self.skipWaiting());
  if (event.data === "get-version" && event.ports[0]) event.ports[0].postMessage(CACHE_VERSION);
});
