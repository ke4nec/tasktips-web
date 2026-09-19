<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";

import AppDialog from "@/components/AppDialog.vue";
import { PROJECT_VIEWS } from "@/app/views";

const props = defineProps<{ open: boolean; projectId: string }>();
const emit = defineEmits<{ (e: "update:open", value: boolean): void }>();

const router = useRouter();
const term = ref("");

interface Entry {
  title: string;
  target: Record<string, unknown>;
}

function entries(): Entry[] {
  const projectId = props.projectId;
  return [
    {
      title: "新建任务",
      target: { name: "todo-detail", params: { projectId, todoId: "new" } },
    },
    ...PROJECT_VIEWS.map((view) => ({
      title: `打开${view.title}`,
      target: { name: "project-view", params: { projectId, view: view.id } },
    })),
    { title: "打开设置", target: { name: "settings" } },
  ];
}

const matches = computed(() => {
  const keyword = term.value.trim().toLowerCase();
  const all = entries();
  if (!keyword) return all;
  return all.filter((entry) => entry.title.toLowerCase().includes(keyword));
});

function close() {
  emit("update:open", false);
}

function go(entry: Entry) {
  close();
  router.push(entry.target as Parameters<typeof router.push>[0]);
}

function onConfirm() {
  if (matches.value.length > 0) go(matches.value[0]);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Enter") {
    event.preventDefault();
    onConfirm();
  }
}

watch(
  () => props.open,
  (value) => {
    if (value) term.value = "";
  },
);
</script>

<template>
  <AppDialog :open="open" title="搜索任务或命令" no-footer @update:open="close">
    <div class="field">
      <label for="command-search" class="muted">输入任务名称，或选择一个操作</label>
      <input
        id="command-search"
        v-model="term"
        type="search"
        placeholder="搜索…"
        autocomplete="off"
        @keydown="onKeydown"
      />
    </div>
    <div class="command-results" role="listbox" aria-label="命令与页面">
      <button
        v-for="entry in matches.slice(0, 8)"
        :key="entry.title"
        type="button"
        role="option"
        aria-selected="false"
        class="nav-link"
        @click="go(entry)"
      >
        <span class="grow">{{ entry.title }}</span
        ><span class="subtle">↵</span>
      </button>
      <p v-if="matches.length === 0" class="small muted">没有找到相关任务。</p>
    </div>
  </AppDialog>
</template>
