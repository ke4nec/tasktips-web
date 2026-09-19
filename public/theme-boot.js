/**
 * 首帧主题引导：在 CSS 生效前同步设置 <html data-theme>，
 * 避免深色用户在应用 JS 启动前看到一帧浅色/白色背景。
 *
 * 移植自桌面端 public/theme-boot.js，偏好键保持一致
 * （tasktips:theme-preference，便于同浏览器多端体验统一）；
 * 无缓存时默认跟随系统（设计文档 §3：支持浅色、深色和跟随系统）。
 */
(function () {
  var theme = "light";
  try {
    var cached = localStorage.getItem("tasktips:theme-preference");
    if (cached === "light" || cached === "dark") {
      theme = cached;
    } else if (cached !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      theme = "dark";
    }
  } catch {
    // localStorage 不可用（隐私模式等）：保持浅色默认
  }
  document.documentElement.dataset.theme = theme;
})();
