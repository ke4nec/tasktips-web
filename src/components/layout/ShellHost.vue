<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute } from "vue-router";

import AppShell from "@/components/layout/AppShell.vue";
import { DEFAULT_PROJECT_ID } from "@/stores/project";
import { useClassificationStore } from "@/stores/classification";
import { useTodoStore } from "@/stores/todos";

// 壳宿主：项目路由取 :projectId，全局页（设置）回退默认项目，保证侧栏可用。
// 此处预加载任务与分类（侧栏计数/树），各页面按需刷新，接口幂等。
const route = useRoute();
const todos = useTodoStore();
const classification = useClassificationStore();
const projectId = computed(
  () => (route.params.projectId as string | undefined) ?? DEFAULT_PROJECT_ID,
);

watch(
  projectId,
  (id) => {
    void Promise.all([todos.load(id), classification.load(id)]);
  },
  { immediate: true },
);
</script>

<template>
  <AppShell :project-id="projectId">
    <RouterView />
  </AppShell>
</template>
