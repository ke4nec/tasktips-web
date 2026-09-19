import { defineStore } from "pinia";
import { ref } from "vue";

import { api } from "@/api";
import type { Project } from "@/api/types";
import { LAST_PROJECT_KEY } from "@/stores/session";

export const DEFAULT_PROJECT_ID = "demo";

// 项目空间（设计文档 §3.2、§8.1）：选择、新建、重命名与上次项目恢复。
// 本地初始化状态与内容基线在 P5/P6 接入 IndexedDB 与同步引擎后补齐。
export const useProjectStore = defineStore("project", () => {
  const projects = ref<Project[]>([]);

  function readLastProjectId(): string | null {
    try {
      return localStorage.getItem(LAST_PROJECT_KEY);
    } catch {
      return null;
    }
  }

  function rememberProject(id: string) {
    try {
      localStorage.setItem(LAST_PROJECT_KEY, id);
    } catch {
      // 忽略
    }
  }

  async function load() {
    projects.value = await api.listProjects();
  }

  async function ensureDefaultProject() {
    if (projects.value.length === 0) {
      await api.createProject("我的任务");
      projects.value = await api.listProjects();
    }
  }

  async function create(name: string): Promise<Project> {
    const project = await api.createProject(name);
    projects.value = await api.listProjects();
    rememberProject(project.id);
    return project;
  }

  async function rename(id: string, name: string): Promise<Project> {
    const project = await api.renameProject(id, name);
    projects.value = await api.listProjects();
    return project;
  }

  function currentProject(projectId: string | undefined): Project {
    return (
      projects.value.find((project) => project.id === projectId) ?? {
        id: projectId ?? "unknown",
        name: "未知项目",
      }
    );
  }

  // 智能入口：上次可访问项目优先，否则首个项目，否则空（调用方进项目选择）。
  function entryProject(): Project | null {
    const last = readLastProjectId();
    if (last) {
      const found = projects.value.find((project) => project.id === last);
      if (found) return found;
    }
    return projects.value[0] ?? null;
  }

  function reset() {
    projects.value = [];
  }

  return {
    projects,
    load,
    ensureDefaultProject,
    create,
    rename,
    currentProject,
    entryProject,
    rememberProject,
    reset,
  };
});
