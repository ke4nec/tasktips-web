<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";

import AppDialog from "@/components/AppDialog.vue";
import AppIcon from "@/components/AppIcon.vue";
import EmptyState from "@/components/EmptyState.vue";
import FilterDialog from "@/components/list/FilterDialog.vue";
import SortDialog from "@/components/list/SortDialog.vue";
import TodoRow from "@/components/list/TodoRow.vue";
import { useVirtualWindow } from "@/components/list/virtualWindow";
import {
  groupCompleted,
  groupToday,
  groupUpcoming,
  UPCOMING_PREVIEW_KEYS,
  type TodoGroup,
} from "@/domain/query";
import { formatLongDate, todayLocal } from "@/domain/datetime";
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
// 今日页未来预览各组的展开态（默认每组只显示 PREVIEW_LIMIT 条，对齐移动端默认 3 条）。
const expandedPreview = ref<Set<string>>(new Set());
const PREVIEW_LIMIT = 5;

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
  expandedPreview.value = new Set();
  void load();
});

const items = computed(() => todos.results(view.value));

const activeFilterCount = computed(() => todos.filterCount());

const groups = computed<TodoGroup[] | null>(() => {
  const today = todayLocal();
  if (view.value === "today") return groupToday(items.value, today);
  if (view.value === "completed") return groupCompleted(items.value);
  if (view.value === "upcoming") return groupUpcoming(items.value, today);
  return null;
});

// 今日页未来预览：查询语义不变（仍是 today 谓词），展示层把 upcoming 按
// 明天／3天内／7天内／30天内拼在核心分组下方（§4.1，与移动端同口径）。
// 有筛选时隐藏预览，避免与无结果空态和计数口径冲突。
const upcomingItems = computed(() =>
  view.value === "today" && activeFilterCount.value === 0 ? todos.results("upcoming") : [],
);

const previewGroups = computed<TodoGroup[]>(() => {
  if (view.value !== "today" || activeFilterCount.value > 0) return [];
  const keys = new Set<string>(UPCOMING_PREVIEW_KEYS);
  return groupUpcoming(upcomingItems.value, todayLocal()).filter((group) => keys.has(group.key));
});

const upcomingCount = computed(() => upcomingItems.value.length);

function visiblePreview(group: TodoGroup) {
  if (expandedPreview.value.has(group.key)) return group.items;
  return group.items.slice(0, PREVIEW_LIMIT);
}

function togglePreview(key: string) {
  const next = new Set(expandedPreview.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedPreview.value = next;
}

// 页面副标题：今日视图显示长日期，其余视图用固定文案（对齐设计稿各页 heading）。
const subtitle = computed(() =>
  view.value === "today" ? formatLongDate() : (info.value?.description ?? ""),
);

// 统计条（对齐设计稿 summary-strip）：今日显示任务/过期，其余视图显示任务/目录。
const summary = computed(() => {
  const overdue = items.value.filter((item) => item.dueDate && item.dueDate < todayLocal()).length;
  const folders = classification.tree.length;
  const doneCount = todos.todos.filter((item) => item.status === "completed").length;
  const total = todos.todos.length;
  const percent = total === 0 ? 0 : Math.round((doneCount / total) * 100);
  const note = view.value === "completed" ? "给自己一个小小的肯定。" : "慢慢来，也是一种进步。";
  if (view.value === "today") {
    return {
      primary: items.value.length,
      primaryLabel: "个任务",
      secondary: overdue,
      secondaryLabel: "已过期",
      note,
      percent,
    };
  }
  if (view.value === "completed") {
    return {
      primary: items.value.length,
      primaryLabel: "已完成",
      secondary: folders,
      secondaryLabel: "个目录",
      note,
      percent,
    };
  }
  return {
    primary: items.value.length,
    primaryLabel: "个任务",
    secondary: folders,
    secondaryLabel: "个目录",
    note,
    percent,
  };
});

// 大列表虚拟化（inbox/all 平直列表；分组视图保持全量渲染）。
// 拖拽排序仅在可视窗口内有效，超出需先滚动（§12.1 性能验收）。
const vwin = useVirtualWindow({
  items: () => items.value,
  threshold: 100,
});
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
        <p>{{ subtitle }}</p>
      </div>
      <button type="button" class="btn primary" @click="newTask">
        <AppIcon name="plus" small />新建任务
      </button>
    </div>

    <div class="summary-strip" aria-label="任务概览">
      <div class="summary-item">
        <strong class="summary-value">{{ summary.primary }}</strong
        >{{ summary.primaryLabel }}
      </div>
      <span class="summary-divider"></span>
      <div class="summary-item">
        <strong class="summary-value">{{ summary.secondary }}</strong
        >{{ summary.secondaryLabel }}
      </div>
      <span class="spacer"></span>
      <span class="summary-note muted small">{{ summary.note }}</span>
      <div class="progress-ring" aria-hidden="true">{{ summary.percent }}%</div>
    </div>

    <div class="toolbar" role="search">
      <label class="list-search">
        <AppIcon name="search" small />
        <input
          :value="todos.search"
          type="search"
          placeholder="搜索当前列表…"
          aria-label="搜索任务"
          @input="todos.setSearch(($event.target as HTMLInputElement).value)"
        />
      </label>
      <span class="spacer"></span>
      <button type="button" class="btn" @click="filterOpen = true">
        <AppIcon name="filter" small />筛选
      </button>
      <button type="button" class="btn" @click="sortOpen = true">
        <AppIcon name="sort" small />{{ sortLabel }}
      </button>
      <span v-if="activeFilterCount > 0" class="pill blue">已筛选 {{ activeFilterCount }} 项</span>
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

    <!-- 空态不放创建 CTA：标题栏“新建任务”与底部“添加一个新任务”已覆盖入口（设计稿同款）。 -->
    <EmptyState
      v-else-if="todos.todos.length === 0"
      icon="inbox"
      title="还没有任务"
      description="新建第一条任务，开始记录今天的小计划。"
    />
    <!-- 无结果时不加空态 CTA：搜索计入筛选数，工具栏“清除筛选”在任何无结果状态下都可见（§4.1）。
         今日页有未来预览时不走无结果空态，改走下方的今日空态+预览。 -->
    <EmptyState
      v-else-if="items.length === 0 && previewGroups.length === 0"
      icon="search"
      title="没有找到相关任务"
      description="换个关键词，或清除筛选再试试看。"
    />
    <!-- 今日核心为空但有未来安排：显示未来分组而非空白页（对齐移动端）。 -->
    <EmptyState
      v-else-if="view === 'today' && items.length === 0"
      icon="calendar"
      title="今天没有到期任务"
      description="下面是接下来的安排。"
    />

    <template v-if="!loading && todos.todos.length > 0 && groups && items.length > 0">
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
    <!-- 今日页未来预览：核心分组下方的“接下来”分区，每组默认 5 条、超长展开/收起。 -->
    <template v-if="!loading && previewGroups.length > 0">
      <div class="preview-divider" aria-hidden="true"><span>接下来</span></div>
      <section
        v-for="group in previewGroups"
        :key="group.key"
        class="list-group upcoming-preview"
        aria-label="未来任务分组"
      >
        <h2 class="list-group-title">
          {{ group.label }}<span class="count">{{ group.items.length }}</span>
          <span class="spacer"></span>
          <button
            v-if="group.items.length > PREVIEW_LIMIT"
            type="button"
            class="btn text preview-toggle"
            @click="togglePreview(group.key)"
          >
            {{ expandedPreview.has(group.key) ? "收起" : `展开全部 ${group.items.length}` }}
          </button>
        </h2>
        <div data-list-content>
          <TodoRow
            v-for="item in visiblePreview(group)"
            :key="item.id"
            :todo="item"
            :project-id="projectId"
            :sortable="false"
            @menu="openMenu"
            @dragover.prevent
            @drop="onDrop($event, item.id)"
          />
        </div>
      </section>
      <RouterLink
        class="upcoming-more"
        :to="{ name: 'project-view', params: { projectId, view: 'upcoming' } }"
      >
        查看即将到期 {{ upcomingCount }}<AppIcon name="chevron" small />
      </RouterLink>
    </template>
    <div
      v-else-if="!loading && !groups && todos.todos.length > 0 && items.length > 0"
      data-list-content
    >
      <div :style="{ height: vwin.totalHeight.value, position: 'relative' }">
        <div :style="{ transform: `translateY(${vwin.offsetY.value}px)` }">
          <TodoRow
            v-for="item in vwin.visibleItems.value"
            :key="item.id"
            :todo="item"
            :project-id="projectId"
            :sortable="sortable"
            @menu="openMenu"
            @dragover.prevent
            @drop="onDrop($event, item.id)"
          />
        </div>
      </div>
    </div>

    <button type="button" class="add-task" @click="newTask">
      <AppIcon name="plus" />添加一个新任务
    </button>
    <div class="bottom-hint"><AppIcon name="cloud" small />已保存到本机，并与其他设备同步</div>

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
