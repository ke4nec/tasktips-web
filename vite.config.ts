import { fileURLToPath, URL } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";
import { precachePlugin } from "./scripts/build-sw.ts";

// Web 开发端口固定 5174，避免与管理后台 5173 冲突（设计文档 §11.2）。
// /api 代理到本地云端 API，便于联调；生产由同源反代承载，不走该代理。
export default defineConfig({
  plugins: [vue(), precachePlugin()],
  // 与生产一致部署在 /app/ 下，开发服务器同样以该 base 提供页面，
  // 使路由 base 与资源路径在 dev/build/preview 保持一致。
  base: "/app/",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  clearScreen: false,
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:18080",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5174,
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
  },
});
