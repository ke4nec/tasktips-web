<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute } from "vue-router";

import AppShell from "@/components/layout/AppShell.vue";
import { useProjectStore } from "@/stores/project";
import { useClassificationStore } from "@/stores/classification";
import { useSyncStore } from "@/stores/sync";
import { useTodoStore } from "@/stores/todos";

// 壳宿主：项目路由取 :projectId，全局设置保留当前或上次真实项目。
// 此处预加载任务与分类（侧栏计数/树），并接入同步引擎（初始同步与自动触发）。
const route = useRoute();
const todos = useTodoStore();
const classification = useClassificationStore();
const sync = useSyncStore();
const projects = useProjectStore();
const projectId = computed(
  () =>
    (route.params.projectId as string | undefined) ??
    (sync.currentProjectId || projects.entryProject()?.id || ""),
);

watch(
  projectId,
  (id) => {
    if (!id) return;
    projects.rememberProject(id);
    void Promise.all([todos.load(id), classification.load(id)]);
    void sync.ensureProject(id).catch(() => undefined);
  },
  { immediate: true },
);
</script>

<template>
  <AppShell v-if="projectId" :project-id="projectId">
    <RouterView />
  </AppShell>
  <RouterView v-else />
</template>
