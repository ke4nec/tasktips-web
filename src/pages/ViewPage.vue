<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import AppDialog from "@/components/AppDialog.vue";
import EmptyState from "@/components/EmptyState.vue";
import FilterDialog from "@/components/list/FilterDialog.vue";
import SortDialog from "@/components/list/SortDialog.vue";
import TodoRow from "@/components/list/TodoRow.vue";
import { groupCompleted, groupToday, groupUpcoming, type TodoGroup } from "@/domain/query";
import { todayLocal } from "@/domain/datetime";
import type { TodoView } from "@/domain/types";
import { viewDef } from "@/app/views";
import { useClassificationStore } from "@/stores/classification";
import { useTodoStore } from "@/stores/todos";

const route = useRoute();
const router = useRouter();
const todos = useTodoStore();
const classification = useClassificationStore();

const projectId = computed(() => route.params.projectId as string);
const view = computed(() => route.params.view as TodoView);
const info = computed(() => viewDef(view.value));

const loading = ref(true);
const filterOpen = ref(false);
const sortOpen = ref(false);
const taskMenuId = ref<string | null>(null);

async function load() {
  loading.value = true;
  try {
    await Promise.all([todos.load(projectId.value), classification.load(projectId.value)]);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch([projectId, view], () => {
  void load();
});

const items = computed(() => todos.results(view.value));

const groups = computed<TodoGroup[] | null>(() => {
  const today = todayLocal();
  if (view.value === "today") return groupToday(items.value, today);
  if (view.value === "completed") return groupCompleted(items.value);
  if (view.value === "upcoming") return groupUpcoming(items.value, today);
  return null;
});

const activeFilterCount = computed(() => todos.filterCount());
const sortLabel = computed(() => {
  if (!todos.sort) return "默认排序";
  return {
    updatedAt: "更新时间",
    createdAt: "创建时间",
    dueDate: "截止日期",
    priority: "优先级",
    title: "标题",
  }[todos.sort[0]];
});

// 自定义顺序仅 inbox/all、默认排序、无筛选时可拖拽（§4.1）。
const sortable = computed(
  () =>
    (view.value === "inbox" || view.value === "all") &&
    !todos.sort &&
    activeFilterCount.value === 0,
);

function onMenuClose(open: boolean) {
  if (!open) taskMenuId.value = null;
}

function newTask() {
  const query: Record<string, string> = { from: view.value };
  if (view.value === "today") query.dueDate = todayLocal();
  if (todos.categoryIds[0]) query.categoryId = todos.categoryIds[0];
  if (todos.tags[0]) query.tag = todos.tags[0];
  router.push({
    name: "todo-detail",
    params: { projectId: projectId.value, todoId: "new" },
    query,
  });
}

function openMenu(id: string) {
  taskMenuId.value = id;
}

async function moveToTrash() {
  if (!taskMenuId.value) return;
  await todos.remove(taskMenuId.value);
  taskMenuId.value = null;
}

function onDrop(event: DragEvent, targetId: string) {
  event.preventDefault();
  const sourceId = event.dataTransfer?.getData("text/plain");
  if (!sourceId || sourceId === targetId) return;
  const ids = items.value.map((item) => item.id).filter((id) => id !== sourceId);
  const targetIndex = ids.indexOf(targetId);
  ids.splice(targetIndex < 0 ? ids.length : targetIndex, 0, sourceId);
  void todos.reorder(view.value as "inbox" | "all", ids);
}
</script>

<template>
  <div class="content">
    <div class="page-heading">
      <div>
        <h1>{{ info?.title ?? "未知视图" }}</h1>
        <p>{{ info?.description ?? "" }}</p>
      </div>
      <button type="button" class="btn primary" @click="newTask">新建任务</button>
    </div>

    <div class="toolbar" role="search">
      <label class="list-search">
        <span class="subtle">搜索</span>
        <input
          :value="todos.search"
          type="search"
          placeholder="标题、正文、标签"
          aria-label="搜索任务"
          @input="todos.setSearch(($event.target as HTMLInputElement).value)"
        />
      </label>
      <button type="button" class="btn" @click="filterOpen = true">
        筛选
        <span v-if="activeFilterCount > 0" class="pill blue">
          {{ activeFilterCount }} 项筛选 · {{ items.length }} 条任务
        </span>
      </button>
      <button type="button" class="btn" @click="sortOpen = true">排序：{{ sortLabel }}</button>
      <button
        v-if="activeFilterCount > 0 || todos.sort"
        type="button"
        class="btn text"
        @click="todos.clearFilters()"
      >
        清除筛选
      </button>
    </div>

    <div v-if="loading" aria-label="正在加载任务">
      <div class="skeleton" style="width: 70%"></div>
      <div class="skeleton" style="width: 90%"></div>
      <div class="skeleton" style="width: 60%"></div>
    </div>

    <EmptyState
      v-else-if="todos.todos.length === 0"
      icon="inbox"
      title="还没有任务"
      description="新建第一条任务，开始记录今天的小计划。"
      action-label="新建任务"
      @action="newTask"
    />
    <EmptyState
      v-else-if="items.length === 0"
      icon="search"
      title="没有找到相关任务"
      description="换个关键词，或清除筛选再试试看。"
      action-label="清除筛选"
      @action="todos.clearFilters"
    />

    <template v-else-if="groups">
      <section v-for="group in groups" :key="group.key" class="list-group" aria-label="任务分组">
        <h2 class="list-group-title">
          {{ group.label }}<span class="count">{{ group.items.length }}</span>
        </h2>
        <div data-list-content>
          <TodoRow
            v-for="item in group.items"
            :key="item.id"
            :todo="item"
            :project-id="projectId"
            :sortable="sortable"
            @menu="openMenu"
            @dragover.prevent
            @drop="onDrop($event, item.id)"
          />
        </div>
      </section>
    </template>
    <div v-else data-list-content>
      <TodoRow
        v-for="item in items"
        :key="item.id"
        :todo="item"
        :project-id="projectId"
        :sortable="sortable"
        @menu="openMenu"
        @dragover.prevent
        @drop="onDrop($event, item.id)"
      />
    </div>

    <FilterDialog :open="filterOpen" @update:open="filterOpen = $event" />
    <SortDialog :open="sortOpen" @update:open="sortOpen = $event" />

    <AppDialog
      :open="taskMenuId !== null"
      title="任务操作"
      confirm-text="移入回收站"
      danger
      @update:open="onMenuClose"
      @confirm="moveToTrash"
    >
      <p>移入回收站后，30 天内可以恢复。</p>
    </AppDialog>
  </div>
</template>
