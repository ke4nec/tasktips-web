import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

import { router } from "@/app/router";
import { useSessionStore } from "@/stores/session";

beforeEach(() => {
  setActivePinia(createPinia());
  useSessionStore().mockLogout();
});

describe("应用路由表", () => {
  it("未登录访问业务页回登录并携带 redirect", async () => {
    await router.push("/projects");
    expect(router.currentRoute.value.name).toBe("login");
    expect(router.currentRoute.value.query.redirect).toBe("/projects");
  });

  it("登录后可进入业务页", async () => {
    useSessionStore().mockLogin("user@example.com");
    await router.push("/projects");
    expect(router.currentRoute.value.name).toBe("projects");
  });

  it("已登录访问登录页回到项目空间", async () => {
    useSessionStore().mockLogin("user@example.com");
    await router.push("/login");
    expect(router.currentRoute.value.name).toBe("projects");
  });

  it("项目入口默认进入今日视图", async () => {
    useSessionStore().mockLogin("user@example.com");
    await router.push("/p/demo");
    expect(router.currentRoute.value.name).toBe("project-view");
    expect(router.currentRoute.value.params.view).toBe("today");
  });

  it("非法视图进入 not-found", async () => {
    useSessionStore().mockLogin("user@example.com");
    await router.push("/p/demo/unknown-view");
    expect(router.currentRoute.value.name).toBe("not-found");
  });

  it("命名路由可解析：详情 / 分类标签页 / 设置", () => {
    const detail = router.resolve({
      name: "todo-detail",
      params: { projectId: "demo", todoId: "x" },
    });
    expect(detail.path).toBe("/p/demo/todo/x");
    const tags = router.resolve({
      name: "classification",
      params: { projectId: "demo" },
      query: { tab: "tags" },
    });
    expect(tags.fullPath).toBe("/p/demo/classification?tab=tags");
    const settings = router.resolve({ name: "settings" });
    expect(settings.path).toBe("/settings");
  });
});
