<script setup lang="ts">
import { ref, watch } from "vue";

import AppDialog from "@/components/AppDialog.vue";
import type { DueDateFilter, StatusFilter } from "@/domain/types";
import { useClassificationStore } from "@/stores/classification";
import { useTodoStore } from "@/stores/todos";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: "update:open", value: boolean): void }>();

const todos = useTodoStore();
const classification = useClassificationStore();

const categoryId = ref("");
const includeUncategorized = ref(false);
const tagText = ref("");
const tagMode = ref<"and" | "or" | "exclude">("and");
const priorities = ref<number[]>([]);
const due = ref<DueDateFilter>("any");
const status = ref<StatusFilter>("any");

watch(
  () => props.open,
  (value) => {
    if (!value) return;
    categoryId.value = todos.categoryIds[0] ?? "";
    includeUncategorized.value = todos.uncategorized;
    tagText.value = todos.tags.join(", ");
    tagMode.value = todos.tagMode;
    priorities.value = [...todos.priorities];
    due.value = todos.dueDate;
    status.value = todos.status;
  },
);

function togglePriority(priority: number) {
  priorities.value = priorities.value.includes(priority)
    ? priorities.value.filter((item) => item !== priority)
    : [...priorities.value, priority];
}

function onConfirm() {
  todos.setCategoryFilter(categoryId.value ? [categoryId.value] : [], includeUncategorized.value);
  todos.tags = tagText.value
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  todos.tagMode = tagMode.value;
  todos.priorities = [...priorities.value] as typeof todos.priorities;
  todos.dueDate = due.value;
  todos.status = status.value;
  emit("update:open", false);
}
</script>

<template>
  <AppDialog
    :open="props.open"
    title="筛选任务"
    confirm-text="应用筛选"
    @update:open="emit('update:open', $event)"
    @confirm="onConfirm"
  >
    <div class="two-col">
      <div class="field">
        <label for="filter-category">目录</label>
        <select id="filter-category" v-model="categoryId">
          <option value="">全部目录</option>
          <option
            v-for="category in classification.categories.filter((item) => !item.deletedAt)"
            :key="category.id"
            :value="category.id"
          >
            {{ category.name }}
          </option>
          <option value="__uncategorized__" disabled>未分类（见下方开关）</option>
        </select>
      </div>
      <div class="field">
        <label for="filter-status">状态</label>
        <select id="filter-status" v-model="status">
          <option value="any">不限</option>
          <option value="open">未完成</option>
          <option value="completed">已完成</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label for="filter-uncategorized">
        <input
          id="filter-uncategorized"
          v-model="includeUncategorized"
          type="checkbox"
          class="task-check"
        />
        同时包含未分类任务
      </label>
    </div>
    <div class="field">
      <label for="filter-tags">标签</label>
      <input id="filter-tags" v-model="tagText" type="text" placeholder="例如：工作, 生活" />
      <small>多个标签用英文逗号分隔。</small>
    </div>
    <div class="two-col">
      <div class="field">
        <label for="filter-mode">标签匹配方式</label>
        <select id="filter-mode" v-model="tagMode">
          <option value="and">全部包含</option>
          <option value="or">任一包含</option>
          <option value="exclude">均不包含</option>
        </select>
      </div>
      <div class="field">
        <label for="filter-due">截止日期</label>
        <select id="filter-due" v-model="due">
          <option value="any">不限</option>
          <option value="overdue">已过期</option>
          <option value="today">今天到期</option>
          <option value="none">无日期</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label>优先级（多选为并集）</label>
      <div class="flex wrap">
        <label v-for="(label, index) in ['无', '低', '中', '高']" :key="index">
          <input
            type="checkbox"
            class="task-check"
            :checked="priorities.includes(index)"
            @change="togglePriority(index)"
          />
          {{ label }}
        </label>
      </div>
    </div>
  </AppDialog>
</template>
