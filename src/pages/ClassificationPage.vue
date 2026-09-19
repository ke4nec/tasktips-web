<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

import EmptyState from "@/components/EmptyState.vue";

const route = useRoute();
const projectId = computed(() => route.params.projectId as string);
const tab = computed(() => (route.query.tab === "tags" ? "tags" : "folders"));
</script>

<template>
  <div class="content">
    <div class="page-heading">
      <div>
        <h1>{{ tab === "tags" ? "标签与分组" : "目录管理" }}</h1>
        <p>P3 实现目录树、标签卡片与分组管理，届时替换此占位。</p>
      </div>
    </div>
    <div class="tabs" role="tablist" aria-label="分类视图">
      <RouterLink
        :to="{ name: 'classification', params: { projectId } }"
        :class="{ active: tab === 'folders' }"
        :aria-selected="tab === 'folders'"
        role="tab"
        >目录</RouterLink
      >
      <RouterLink
        :to="{ name: 'classification', params: { projectId }, query: { tab: 'tags' } }"
        :class="{ active: tab === 'tags' }"
        :aria-selected="tab === 'tags'"
        role="tab"
        >标签与分组</RouterLink
      >
    </div>
    <EmptyState icon="folder" title="分类管理即将接入" description="三级目录、标签与分组。" />
  </div>
</template>
