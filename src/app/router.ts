import { createRouter, createWebHistory } from "vue-router";
import { h } from "vue";

import ShellHost from "@/components/layout/ShellHost.vue";
import ClassificationPage from "@/pages/ClassificationPage.vue";
import EditorPage from "@/pages/EditorPage.vue";
import HistoryPage from "@/pages/HistoryPage.vue";
import LoginPage from "@/pages/LoginPage.vue";
import NotFoundPage from "@/pages/NotFoundPage.vue";
import ProjectsPage from "@/pages/ProjectsPage.vue";
import RegisterPage from "@/pages/RegisterPage.vue";
import SettingsPage from "@/pages/SettingsPage.vue";
import SnapshotsPage from "@/pages/SnapshotsPage.vue";
import SyncPage from "@/pages/SyncPage.vue";
import TrashPage from "@/pages/TrashPage.vue";
import ViewPage from "@/pages/ViewPage.vue";
import { VIEW_IDS } from "@/app/views";
import { useProjectStore } from "@/stores/project";
import { useSessionStore } from "@/stores/session";

// 应用部署在 /app/（设计文档 §3.1、§11.2），路由与文档路由表一一对应。
// 子视图（标签页、冲突、恢复）不设一级路由，用 query 表达（§14.2）。
const VIEW_PATTERN = VIEW_IDS.join("|");

export const router = createRouter({
  history: createWebHistory("/app/"),
  routes: [
    // 根入口智能恢复：上次可访问项目 → 单项目直接进入 → 否则项目选择（§3.2）。
    // 占位组件永不渲染：beforeEnter 直接返回目标位置。
    {
      path: "/",
      component: { render: () => h("div") },
      beforeEnter: async () => {
        const projects = useProjectStore();
        if (projects.projects.length === 0) {
          try {
            await projects.load();
          } catch {
            return "/projects";
          }
        }
        const entry = projects.entryProject();
        return entry
          ? { name: "project-view", params: { projectId: entry.id, view: "today" } }
          : "/projects";
      },
    },
    { path: "/login", name: "login", component: LoginPage, meta: { public: true } },
    { path: "/register", name: "register", component: RegisterPage, meta: { public: true } },
    { path: "/projects", name: "projects", component: ProjectsPage },
    {
      path: "/p/:projectId",
      component: ShellHost,
      children: [
        {
          path: "",
          redirect: (to) => ({
            name: "project-view",
            params: { projectId: to.params.projectId, view: "today" },
          }),
        },
        {
          path: `:view(${VIEW_PATTERN})`,
          name: "project-view",
          component: ViewPage,
        },
        { path: "todo/:todoId", name: "todo-detail", component: EditorPage },
        { path: "classification", name: "classification", component: ClassificationPage },
        { path: "trash", name: "trash", component: TrashPage },
        { path: "sync", name: "sync", component: SyncPage },
        { path: "history", name: "history", component: HistoryPage },
        { path: "snapshots", name: "snapshots", component: SnapshotsPage },
      ],
    },
    {
      path: "/settings",
      component: ShellHost,
      children: [{ path: "", name: "settings", component: SettingsPage }],
    },
    { path: "/:pathMatch(.*)*", name: "not-found", component: NotFoundPage },
  ],
  // 前进后退恢复滚动位置（设计文档 §3.1；列表筛选/选中态由 P3 store 保持）。
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition;
    if (to.hash) return { el: to.hash };
    return { top: 0 };
  },
});

// 未登录进入业务页一律回登录（P2 替换为真实会话校验与 redirect 回跳）。
// 守卫先等待一次性的会话恢复：真实 HTTP 的 Cookie 刷新存在网络延迟，
// 若不等待，整页刷新会被误判为未登录（§8.3）。
router.beforeEach(async (to) => {
  const session = useSessionStore();
  await session.ready();
  if (!to.meta.public && !session.isAuthenticated) {
    return { name: "login", query: { redirect: to.fullPath } };
  }
  if ((to.name === "login" || to.name === "register") && session.isAuthenticated) {
    return { name: "projects" };
  }
  return true;
});
