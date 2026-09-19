<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";

import AppDialog from "@/components/AppDialog.vue";
import EmptyState from "@/components/EmptyState.vue";
import { subscribeInvalidation } from "@/sync/engine";
import type { HistoryEntry, SyncKind } from "@/sync/protocol";
import { useSessionStore } from "@/stores/session";
import { mockSyncServer } from "@/stores/sync";

const route = useRoute();
const session = useSessionStore();
const projectId = computed(() => route.params.projectId as string);
const taskId = computed(() => (route.query.task as string | undefined) ?? "");
const scope = computed(() => `${session.account?.email ?? "local"}\n${projectId.value}`);

let unsubscribe: (() => void) | null = null;

const loading = ref(true);
const entries = ref<HistoryEntry[]>([]);
const nextSequence = ref<number | null>(null);
const loadingMore = ref(false);
const kindFilter = ref<"all" | SyncKind>("all");
const detail = ref<{ title: string; body: string; meta: string } | null>(null);

const PAGE = 200;

async function loadMore() {
  loadingMore.value = true;
  try {
    const after = entries.value.length === 0 ? null : nextSequence.value;
    const page = taskId.value
      ? await mockSyncServer.objectHistory(projectId.value, "todo", taskId.value, after, PAGE)
      : await mockSyncServer.history(projectId.value, after, PAGE);
    entries.value.push(...page.entries);
    nextSequence.value = page.nextSequence;
  } finally {
    loadingMore.value = false;
    loading.value = false;
  }
}

function reset() {
  entries.value = [];
  nextSequence.value = null;
  loading.value = true;
  void loadMore();
}

onMounted(() => {
  reset();
  // 后台同步产生新历史后刷新列表（引擎只广播标识 §9.3）。
  unsubscribe = subscribeInvalidation((invalidated) => {
    if (invalidated === scope.value) reset();
  });
});
onBeforeUnmount(() => {
  unsubscribe?.();
  unsubscribe = null;
});
watch([projectId, taskId], reset);

const visible = computed(() =>
  kindFilter.value === "all"
    ? entries.value
    : entries.value.filter((entry) => entry.kind === kindFilter.value),
);

function kindLabel(kind: SyncKind): string {
  return { todo: "任务", classification: "目录与标签", index: "排序与删除", image: "图片" }[kind];
}

async function openDetail(entry: HistoryEntry) {
  if (entry.deleted) {
    detail.value = { title: entry.id, body: "此版本为删除。", meta: `序列 ${entry.sequence}` };
    return;
  }
  if (!entry.hash) {
    detail.value = { title: entry.id, body: "该版本无内容。", meta: `序列 ${entry.sequence}` };
    return;
  }
  // 点击记录才下载对应 payload（§10.1）。
  const payload = await mockSyncServer.getPayload(entry.hash);
  if (payload === null) {
    detail.value = { title: entry.id, body: "内容已不可用。", meta: `序列 ${entry.sequence}` };
    return;
  }
  const text = typeof payload === "string" ? payload : "[二进制图片]";
  detail.value = {
    title: entry.id,
    body: text.slice(0, 4000),
    meta: `序列 ${entry.sequence} · v${entry.revision} · 只读，不会修改当前版本`,
  };
}
</script>

<template>
  <div class="content">
    <div class="page-heading">
      <div>
        <h1>{{ taskId ? "对象历史" : "历史记录" }}</h1>
        <p>{{ taskId ? "单条任务的云端变更" : "项目历史按序列分页，只加载信封。" }}</p>
      </div>
      <label v-if="!taskId" class="small muted">
        类型筛选
        <select v-model="kindFilter" class="input" style="width: auto; display: inline-block">
          <option value="all">全部</option>
          <option value="todo">任务</option>
          <option value="classification">目录与标签</option>
          <option value="index">排序与删除</option>
          <option value="image">图片</option>
        </select>
      </label>
    </div>

    <div v-if="loading" aria-label="正在加载历史">
      <div class="skeleton" style="width: 70%"></div>
      <div class="skeleton" style="width: 50%"></div>
    </div>
    <EmptyState
      v-else-if="entries.length === 0"
      icon="history"
      title="还没有云端历史记录"
      description="内容成功同步后，可以在这里查看每一次变化。"
    />
    <template v-else>
      <div class="timeline">
        <div v-for="entry in visible" :key="entry.sequence" class="timeline-row">
          <time>{{ entry.at.slice(11, 16) }}</time>
          <div class="timeline-dot">·</div>
          <div>
            <p>{{ kindLabel(entry.kind) }} · {{ entry.id }}</p>
            <small>v{{ entry.revision }}{{ entry.deleted ? " · 删除版本" : "" }}</small>
          </div>
          <button type="button" class="btn text" @click="openDetail(entry)">查看版本</button>
        </div>
      </div>
      <button
        v-if="nextSequence !== null"
        type="button"
        class="btn"
        :disabled="loadingMore"
        @click="loadMore"
      >
        {{ loadingMore ? "加载中…" : "加载更多" }}
      </button>
    </template>

    <AppDialog
      :open="detail !== null"
      title="历史版本 · 只读"
      confirm-text="关闭"
      cancel-text="返回"
      @update:open="detail = $event ? detail : null"
      @confirm="detail = null"
    >
      <p>{{ detail?.meta }}</p>
      <div class="prose">
        <h3>{{ detail?.title }}</h3>
        <pre style="white-space: pre-wrap">{{ detail?.body }}</pre>
      </div>
    </AppDialog>
  </div>
</template>
