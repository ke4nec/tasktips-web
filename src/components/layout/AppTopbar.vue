<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";

import AppIcon from "@/components/AppIcon.vue";
import IconButton from "@/components/IconButton.vue";
import { viewDef } from "@/app/views";
import { mockProject } from "@/stores/project";
import { useSessionStore } from "@/stores/session";
import { useThemeStore } from "@/stores/theme";
import { useUiStore } from "@/stores/ui";

const props = defineProps<{ projectId: string }>();
const emit = defineEmits<{
  (e: "toggle-nav"): void;
  (e: "command"): void;
}>();

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const theme = useThemeStore();
const ui = useUiStore();

const project = computed(() => mockProject(props.projectId));

// 面包屑：项目 / 当前位置（与路由表 §3.1 对应，分类页按 ?tab=tags 区分）。
const position = computed(() => {
  if (route.name === "project-view") return viewDef(route.params.view as string)?.title ?? "";
  if (route.name === "todo-detail") return "任务详情";
  if (route.name === "classification")
    return route.query.tab === "tags" ? "标签与分组" : "目录管理";
  if (route.name === "trash") return "回收站";
  if (route.name === "sync") return "同步与数据";
  if (route.name === "history") return "历史记录";
  if (route.name === "snapshots") return "快照";
  if (route.name === "settings") return "设置";
  return "";
});

const accountInitial = computed(() => (session.account?.email ?? "本").slice(0, 1).toUpperCase());

function toggleTheme() {
  theme.setPreference(theme.resolved === "dark" ? "light" : "dark");
  ui.notify(theme.resolved === "dark" ? "已切换到深色主题" : "已切换到浅色主题");
}

function newTask() {
  router.push({ name: "todo-detail", params: { projectId: props.projectId, todoId: "new" } });
}
</script>

<template>
  <header class="topbar">
    <span class="mobile-nav">
      <IconButton icon="menu" label="打开导航" @click="emit('toggle-nav')" />
    </span>
    <nav class="breadcrumb" aria-label="当前位置">
      <span>{{ project.name }}</span>
      <AppIcon name="chevron" />
      <span>{{ position }}</span>
    </nav>
    <span class="spacer"></span>
    <button
      type="button"
      class="search-trigger"
      aria-label="搜索任务或命令"
      @click="emit('command')"
    >
      <AppIcon name="search" small />
      <span>搜索</span>
      <kbd>Ctrl K</kbd>
    </button>
    <button type="button" class="btn primary" @click="newTask">
      <AppIcon name="plus" small />新建任务
    </button>
    <IconButton
      icon="sun"
      label="切换深色/浅色主题"
      :aria-pressed="theme.resolved === 'dark'"
      @click="toggleTheme"
    />
    <RouterLink
      :to="{ name: 'settings' }"
      class="avatar"
      :aria-label="`账号与设置，当前${accountInitial}`"
      >{{ accountInitial }}</RouterLink
    >
  </header>
</template>
