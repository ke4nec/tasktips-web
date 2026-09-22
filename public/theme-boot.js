(function () {
  var theme = "light";
  try {
    var cached = localStorage.getItem("tasktips:theme-preference");
    if (cached === "light" || cached === "dark") {
      theme = cached;
    } else if (cached !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      theme = "dark";
    }
  } catch {}
  document.documentElement.dataset.theme = theme;
})();
