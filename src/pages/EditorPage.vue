<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

import EmptyState from "@/components/EmptyState.vue";

const route = useRoute();
const todoId = computed(() => route.params.todoId as string);
const isNew = computed(() => todoId.value === "new");
</script>

<template>
  <div class="content narrow">
    <div class="page-heading">
      <div>
        <h1>{{ isNew ? "新建任务" : "任务详情" }}</h1>
        <p>P4 实现双模式编辑器，届时替换此占位。</p>
      </div>
    </div>
    <EmptyState icon="edit" title="编辑器即将接入" :description="`todoId: ${todoId}`" />
  </div>
</template>
