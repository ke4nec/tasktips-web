import { createRouter, createWebHistory } from "vue-router";

import HomePage from "@/pages/HomePage.vue";
import NotFoundPage from "@/pages/NotFoundPage.vue";

// 应用部署在 /app/（设计文档 §3.1、§11.2）：history base 剥离前缀后，
// 路由 path "/" 即线上 URL "/app/"。根路径 "/" → "/app/" 的跳转由反代层
// （Caddy）完成，不属于客户端路由。完整路由表
// （login/register/projects/p/:projectId/.../settings）在 P1 应用壳阶段补齐，
// 本阶段先验证路由基座可用。
export const router = createRouter({
  history: createWebHistory("/app/"),
  routes: [
    { path: "/", name: "home", component: HomePage },
    { path: "/:pathMatch(.*)*", name: "not-found", component: NotFoundPage },
  ],
});
