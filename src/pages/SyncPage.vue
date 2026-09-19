<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute } from "vue-router";

import ConflictsView from "@/components/sync/ConflictsView.vue";
import { useSyncStore } from "@/stores/sync";

const route = useRoute();
const sync = useSyncStore();
const projectId = computed(() => route.params.projectId as string);

onMounted(() => {
  void sync.refresh(projectId.value);
});

const statusText: Record<string, string> = {
  synced: "所有更改已同步",
  pending: "本机有未同步修改",
  syncing: "正在同步你的更改…",
  conflict: "有冲突需要处理",
  partial: "部分更改未能同步",
  offline: "离线更改已保留在本机",
  paused: "同步已暂停",
  auth: "请登录后继续同步",
  maintenance: "项目维护中，已暂停同步",
  error: "同步遇到问题",
  idle: "尚未同步",
};

const statusPill: Record<string, string> = {
  synced: "green",
  pending: "blue",
  syncing: "blue",
  conflict: "amber",
  partial: "amber",
  offline: "amber",
  paused: "amber",
  auth: "amber",
  maintenance: "amber",
  error: "red",
  idle: "",
};

async function toggleAuto() {
  const enabled = !(sync.detail?.autoSync ?? true);
  await sync.setAutoSync(projectId.value, enabled);
}
</script>

<template>
  <div class="content">
    <div class="page-heading">
      <div>
        <h1>同步与数据</h1>
        <p>同步状态、冲突、本机执行日志。日志仅记录时间与错误码，不记录正文。</p>
      </div>
      <button
        type="button"
        class="btn primary"
        :disabled="sync.syncing"
        @click="sync.syncNowManual(projectId)"
      >
        {{ sync.syncing ? "同步中…" : "立即同步" }}
      </button>
    </div>

    <div class="panel" style="margin-bottom: 24px">
      <div class="panel-body between">
        <span class="flex">
          <span class="pill" :class="statusPill[sync.status]">{{ statusText[sync.status] }}</span>
          <span v-if="sync.detail?.lastSyncAt" class="small muted">
            上次同步：{{ sync.detail.lastSyncAt }}
          </span>
        </span>
        <button
          type="button"
          class="switch"
          role="switch"
          :aria-checked="sync.detail?.autoSync ?? true"
          aria-label="自动同步"
          @click="toggleAuto"
        />
      </div>
      <div class="panel-foot small muted">
        待同步 {{ sync.pendingCount }} 项 · 冲突 {{ sync.detail?.conflicts.length ?? 0 }} · 失败
        {{ sync.detail?.rejected.length ?? 0 }}
        <span v-if="sync.detail?.lastError"> · {{ sync.detail.lastError }}</span>
      </div>
    </div>

    <h2 class="section-title"><span>冲突处理</span></h2>
    <ConflictsView :project-id="projectId" />

    <h2 class="section-title" style="margin-top: 24px"><span>本机执行日志</span></h2>
    <div class="panel">
      <div
        v-for="entry in sync.detail?.logs ?? []"
        :key="`${entry.at}-${entry.direction}`"
        class="setting-row"
      >
        <span class="grow">
          <h3>{{ entry.direction }} · {{ entry.count }} 项</h3>
          <p>
            {{ entry.at }}<span v-if="entry.code"> · {{ entry.code }}</span>
          </p>
        </span>
        <span v-if="entry.requestId" class="small subtle">{{ entry.requestId }}</span>
      </div>
      <div v-if="(sync.detail?.logs.length ?? 0) === 0" class="panel-body small muted">
        暂无同步记录。
      </div>
    </div>
  </div>
</template>
