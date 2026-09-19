<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

import AppShell from "@/components/layout/AppShell.vue";
import { DEFAULT_PROJECT_ID } from "@/stores/project";

// 壳宿主：项目路由取 :projectId，全局页（设置）回退默认项目，保证侧栏可用。
const route = useRoute();
const projectId = computed(
  () => (route.params.projectId as string | undefined) ?? DEFAULT_PROJECT_ID,
);
</script>

<template>
  <AppShell :project-id="projectId">
    <RouterView />
  </AppShell>
</template>
