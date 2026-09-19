<script setup lang="ts">
import { ref, watch } from "vue";

import AppDialog from "@/components/AppDialog.vue";
import type { SortDirection, SortKey } from "@/domain/types";
import { useTodoStore } from "@/stores/todos";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: "update:open", value: boolean): void }>();

const todos = useTodoStore();
const key = ref<SortKey | "default">("default");
const direction = ref<SortDirection>("asc");

watch(
  () => props.open,
  (value) => {
    if (!value) return;
    key.value = todos.sort?.[0] ?? "default";
    direction.value = todos.sort?.[1] ?? "asc";
  },
);

function onConfirm() {
  todos.setSort(key.value, direction.value);
  emit("update:open", false);
}
</script>

<template>
  <AppDialog
    :open="props.open"
    title="任务排序"
    confirm-text="应用排序"
    @update:open="emit('update:open', $event)"
    @confirm="onConfirm"
  >
    <div class="field">
      <label for="sort-key">排序方式</label>
      <select id="sort-key" v-model="key">
        <option value="default">默认排序</option>
        <option value="updatedAt">更新时间</option>
        <option value="createdAt">创建时间</option>
        <option value="dueDate">截止日期</option>
        <option value="priority">优先级</option>
        <option value="title">标题</option>
      </select>
    </div>
    <div v-if="key !== 'default'" class="field">
      <label for="sort-direction">顺序</label>
      <select id="sort-direction" v-model="direction">
        <option value="asc">升序</option>
        <option value="desc">降序</option>
      </select>
    </div>
  </AppDialog>
</template>
