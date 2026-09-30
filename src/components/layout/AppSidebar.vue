<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";

import AppIcon from "@/components/AppIcon.vue";
import { PROJECT_VIEWS } from "@/app/views";
import { todayLocal } from "@/domain/datetime";
import { UNCATEGORIZED_LABEL } from "@/domain/types";
import { useClassificationStore } from "@/stores/classification";
import { useProjectStore } from "@/stores/project";
import { useSessionStore } from "@/stores/session";
import { useTodoStore } from "@/stores/todos";

const props = defineProps<{ projectId: string }>();
const emit = defineEmits<{ (e: "navigate"): void }>();

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const projects = useProjectStore();
const todos = useTodoStore();
const classification = useClassificationStore();
const project = computed(() => projects.currentProject(props.projectId));

function goFiltered(filter: () => void) {
  todos.clearFilters();
  filter();
  emit("navigate");
  router.push({ name: "project-view", params: { projectId: props.projectId, view: "all" } });
}

function filterByCategory(categoryId: string) {
  goFiltered(() => todos.setCategoryFilter([categoryId]));
}

function filterUncategorized() {
  goFiltered(() => todos.setCategoryFilter([], true));
}

function filterByTag(tag: string) {
  goFiltered(() => {
    todos.tags = [tag];
  });
}

function isViewActive(viewId: string): boolean {
  return route.name === "project-view" && route.params.view === viewId;
}

function isRouteActive(name: string): boolean {
  if (name === "classification") {
    return route.name === "classification" && route.query.tab !== "tags";
  }
  if (name === "tags") {
    return route.name === "classification" && route.query.tab === "tags";
  }
  return route.name === name;
}

const accountInitial = computed(() => (session.account?.email ?? "本").slice(0, 1).toUpperCase());

// 今日角标红点语义（对齐移动端底部 Badge）：有过期任务时标红，数字仍为过期+今天。
const overdueCount = computed(
  () =>
    todos.todos.filter(
      (item) =>
        item.status === "open" && !item.deletedAt && !!item.dueDate && item.dueDate < todayLocal(),
    ).length,
);

function isTodayUrgent(viewId: string): boolean {
  return viewId === "today" && overdueCount.value > 0;
}

// 侧栏计数 99 以上封顶（对齐移动端 Badge 口径）。
function formatCount(value: number): string {
  return value > 99 ? "99+" : String(value);
}
</script>

<template>
  <aside class="sidebar" aria-label="项目导航">
    <RouterLink
      class="logo"
      :to="{ name: 'project-view', params: { projectId: props.projectId, view: 'today' } }"
      @click="emit('navigate')"
    >
      <span class="logo-mark"><AppIcon name="logo" /></span>TaskTips
    </RouterLink>

    <RouterLink
      class="project-picker"
      :to="{ name: 'projects' }"
      :aria-label="`切换项目，当前${project.name}`"
      @click="emit('navigate')"
    >
      <span class="project-symbol"><AppIcon name="folder" small /></span>
      <span class="grow">{{ project.name }}<small>切换项目</small></span>
      <AppIcon name="chevron" small />
    </RouterLink>

    <nav aria-label="固定视图">
      <div class="nav-group">
        <div class="nav-label">视图</div>
        <RouterLink
          v-for="view in PROJECT_VIEWS"
          :key="view.id"
          class="nav-link"
          :class="{ active: isViewActive(view.id) }"
          :to="{ name: 'project-view', params: { projectId: props.projectId, view: view.id } }"
          :aria-current="isViewActive(view.id) ? 'page' : undefined"
          @click="emit('navigate')"
        >
          <AppIcon :name="view.icon" />{{ view.title }}
          <span
            class="nav-count"
            :class="{ danger: isTodayUrgent(view.id) }"
            :title="isTodayUrgent(view.id) ? `有 ${overdueCount} 项已过期` : undefined"
            >{{ formatCount(todos.counts[view.id as keyof typeof todos.counts]) }}</span
          >
        </RouterLink>
      </div>
    </nav>

    <div class="nav-group">
      <div class="nav-label"><span>目录</span></div>
      <template v-for="level1 in classification.tree" :key="level1.id">
        <button type="button" class="nav-link" @click="filterByCategory(level1.id)">
          <AppIcon name="folder" />{{ level1.name }}
          <span class="nav-count">{{ level1.todoCount }}</span>
        </button>
        <template v-for="level2 in level1.children" :key="level2.id">
          <button type="button" class="nav-link nav-child" @click="filterByCategory(level2.id)">
            {{ level2.name }}
            <span class="nav-count">{{ level2.todoCount }}</span>
          </button>
          <button
            v-for="level3 in level2.children"
            :key="level3.id"
            type="button"
            class="nav-link nav-child"
            @click="filterByCategory(level3.id)"
          >
            {{ level3.name }}
            <span class="nav-count">{{ level3.todoCount }}</span>
          </button>
        </template>
      </template>
      <button type="button" class="nav-link" @click="filterUncategorized()">
        <AppIcon name="inbox" />{{ UNCATEGORIZED_LABEL }}
      </button>
    </div>

    <div class="nav-group">
      <div class="nav-label"><span>标签</span></div>
      <button
        v-for="tag in classification.tags.filter((item) => !item.deletedAt).slice(0, 12)"
        :key="tag.id"
        type="button"
        class="nav-link"
        @click="filterByTag(tag.name)"
      >
        <span class="dot" :style="{ color: tag.color }"></span>{{ tag.name }}
      </button>
    </div>

    <div class="nav-group">
      <div class="nav-label">整理</div>
      <RouterLink
        class="nav-link"
        :class="{ active: isRouteActive('classification') }"
        :to="{ name: 'classification', params: { projectId: props.projectId } }"
        @click="emit('navigate')"
      >
        <AppIcon name="folder" />目录
      </RouterLink>
      <RouterLink
        class="nav-link"
        :class="{ active: isRouteActive('tags') }"
        :to="{
          name: 'classification',
          params: { projectId: props.projectId },
          query: { tab: 'tags' },
        }"
        @click="emit('navigate')"
      >
        <AppIcon name="tag" />标签与分组
      </RouterLink>
      <RouterLink
        class="nav-link"
        :class="{ active: isRouteActive('trash') }"
        :to="{ name: 'trash', params: { projectId: props.projectId } }"
        @click="emit('navigate')"
      >
        <AppIcon name="trash" />回收站
      </RouterLink>
    </div>

    <div class="nav-group">
      <div class="nav-label">同步与数据</div>
      <RouterLink
        class="nav-link"
        :class="{ active: isRouteActive('sync') }"
        :to="{ name: 'sync', params: { projectId: props.projectId } }"
        @click="emit('navigate')"
      >
        <AppIcon name="sync" />同步状态
      </RouterLink>
      <RouterLink
        class="nav-link"
        :class="{ active: isRouteActive('history') }"
        :to="{ name: 'history', params: { projectId: props.projectId } }"
        @click="emit('navigate')"
      >
        <AppIcon name="history" />历史记录
      </RouterLink>
      <RouterLink
        class="nav-link"
        :class="{ active: isRouteActive('snapshots') }"
        :to="{ name: 'snapshots', params: { projectId: props.projectId } }"
        @click="emit('navigate')"
      >
        <AppIcon name="check" />快照
      </RouterLink>
    </div>

    <div class="sidebar-footer">
      <div class="sidebar-sync"><span class="dot"></span>已同步</div>
      <RouterLink class="sidebar-profile" :to="{ name: 'settings' }" @click="emit('navigate')">
        <span class="avatar" aria-hidden="true">{{ accountInitial }}</span>
        <span class="grow"
          ><strong>{{ session.account?.email ?? "本地用户" }}</strong
          ><small>账号与设置</small></span
        >
      </RouterLink>
    </div>
  </aside>
</template>
