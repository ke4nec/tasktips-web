<template>
  <main class="not-found">
    <h1>页面不存在</h1>
    <p><RouterLink to="/app/">返回首页</RouterLink></p>
  </main>
</template>

<style scoped>
.not-found {
  max-width: 640px;
  margin: 10vh auto;
  padding: 0 24px;
  font-family:
    system-ui,
    -apple-system,
    "Segoe UI",
    sans-serif;
}
</style>
