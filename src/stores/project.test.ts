import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

import { useProjectStore } from "@/stores/project";
import { useSessionStore } from "@/stores/session";

describe("项目空间（MockApi）", () => {
  beforeEach(async () => {
    localStorage.clear();
    setActivePinia(createPinia());
    await useSessionStore().mockLoginQuick();
  });

  it("登录后加载项目并记住选择", async () => {
    const projects = useProjectStore();
    await projects.load();
    expect(projects.projects.map((item) => item.name)).toContain("我的任务");
    const entry = projects.entryProject();
    expect(entry?.id).toBe("demo");
  });

  it("空列表时补齐默认项目", async () => {
    const projects = useProjectStore();
    projects.reset();
    expect(projects.projects).toHaveLength(0);
    await projects.ensureDefaultProject();
    expect(projects.projects.map((item) => item.name)).toContain("我的任务");
  });

  it("新建与重命名", async () => {
    const projects = useProjectStore();
    await projects.load();
    const created = await projects.create("阅读与学习");
    expect(created.name).toBe("阅读与学习");
    const renamed = await projects.rename(created.id, "阅读");
    expect(renamed.name).toBe("阅读");
    expect(projects.projects.find((item) => item.id === created.id)?.name).toBe("阅读");
  });

  it("空名称拒绝", async () => {
    const projects = useProjectStore();
    await projects.load();
    await expect(projects.create("   ")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
