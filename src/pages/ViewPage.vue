<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

import EmptyState from "@/components/EmptyState.vue";
import { viewDef } from "@/app/views";

const route = useRoute();
const view = computed(() => viewDef(route.params.view as string));
</script>

<template>
  <div class="content">
    <div class="page-heading">
      <div>
        <h1>{{ view?.title ?? "未知视图" }}</h1>
        <p>{{ view?.description ?? "" }}</p>
      </div>
    </div>
    <EmptyState
      icon="inbox"
      title="任务列表即将接入"
      description="P3 实现查询、筛选排序与任务行，届时替换此占位。"
    />
  </div>
</template>
