// P1 项目占位：单Mock项目，仅支撑应用壳导航与面包屑。
// P2 接入真实项目（获取/新建/切换/上次项目恢复）后替换为 IndexedDB + API 实现。
export interface MockProject {
  id: string;
  name: string;
}

export const MOCK_PROJECTS: MockProject[] = [{ id: "demo", name: "我的任务" }];

export const DEFAULT_PROJECT_ID = MOCK_PROJECTS[0].id;

export function mockProject(projectId: string | undefined): MockProject {
  return (
    MOCK_PROJECTS.find((project) => project.id === projectId) ?? {
      id: projectId ?? "unknown",
      name: "未知项目",
    }
  );
}
