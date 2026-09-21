<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import AppDialog from "@/components/AppDialog.vue";
import EmptyState from "@/components/EmptyState.vue";
import type { RestoreInfo, SnapshotInfo } from "@/sync/protocol";
import { syncServerFor } from "@/stores/sync";
import { useTodoStore } from "@/stores/todos";
import { useClassificationStore } from "@/stores/classification";
import { useUiStore } from "@/stores/ui";

const route = useRoute();
const router = useRouter();
const todos = useTodoStore();
const classification = useClassificationStore();
const ui = useUiStore();

const projectId = computed(() => route.params.projectId as string);
const loading = ref(true);
const snapshots = ref<SnapshotInfo[]>([]);

const createOpen = ref(false);
const createLabel = ref("");
const restoreTarget = ref<SnapshotInfo | null>(null);
const restoreReason = ref("");
const restoreError = ref("");
const restoring = ref<RestoreInfo | null>(null);
const restoreProgress = ref(0);
const cancelOpen = ref(false);
const cancelReason = ref("");
const reconnectOpen = ref(false);
let pollTimer: ReturnType<typeof setInterval> | undefined;

async function reload() {
  loading.value = true;
  try {
    snapshots.value = await syncServerFor(projectId.value).listSnapshots(projectId.value);
  } finally {
    loading.value = false;
  }
}

onMounted(reload);
onBeforeUnmount(() => {
  clearInterval(pollTimer);
});

async function onCreate() {
  const created = await syncServerFor(projectId.value).createSnapshot(
    projectId.value,
    createLabel.value.trim(),
  );
  createOpen.value = false;
  createLabel.value = "";
  ui.notify(`快照已创建（${created.id.slice(0, 8)}）`);
  await reload();
}

function askRestore(snapshot: SnapshotInfo) {
  restoreTarget.value = snapshot;
  restoreReason.value = "";
  restoreError.value = "";
}

async function onRestoreConfirm() {
  // 恢复原因必填，trim 后 1–512 字符（§10.1）。
  const reason = restoreReason.value.trim();
  if ([...reason].length < 1 || [...reason].length > 512) {
    restoreError.value = "请填写恢复原因（1–512 字符）。";
    return;
  }
  if (!restoreTarget.value) return;
  try {
    // 确认文案明确作用范围；先保存本机内容（恢复副本）。
    const { content } = await import("@/content");
    await content.stashRecovery(projectId.value, "云端恢复前");
    restoring.value = await syncServerFor(projectId.value).createRestore(projectId.value, {
      snapshotId: restoreTarget.value.id,
      reason,
    });
    restoreTarget.value = null;
    restoreProgress.value = 10;
    // 每 2 秒查询一次状态；离开页面停止轮询但不取消服务端任务（§10.1）。
    pollTimer = setInterval(pollRestore, 2000);
    void pollRestore();
  } catch (error) {
    restoreError.value = error instanceof Error ? error.message : "恢复提交失败。";
  }
}

async function pollRestore() {
  if (!restoring.value) return;
  const info = await syncServerFor(projectId.value).getRestore(projectId.value, restoring.value.id);
  restoring.value = info;
  restoreProgress.value = info.status === "ready" ? 100 : Math.min(90, restoreProgress.value + 30);
  if (info.status === "ready") {
    clearInterval(pollTimer);
    // 成功后走 generation 更新与重新接入流程（§9.2）：本地重新初始化。
    await Promise.all([todos.load(projectId.value), classification.load(projectId.value)]);
    reconnectOpen.value = true;
  }
}

async function onCancelConfirm() {
  if (!restoring.value) return;
  if (!cancelReason.value.trim()) {
    ui.notify("请填写取消原因");
    return;
  }
  const info = await syncServerFor(projectId.value).cancelRestore(
    projectId.value,
    restoring.value.id,
    cancelReason.value.trim(),
  );
  restoring.value = info;
  cancelOpen.value = false;
  cancelReason.value = "";
  // 等待任务终态，不能把“已请求取消”显示成“已取消”（§10.1）。
  if (info.status === "cancelled") {
    clearInterval(pollTimer);
    ui.notify("恢复已取消，原有项目内容保持可用");
    restoring.value = null;
  }
}

function goConflicts() {
  reconnectOpen.value = false;
  restoring.value = null;
  router.push({ name: "sync", params: { projectId: projectId.value } });
}
</script>

<template>
  <div class="content">
    <div class="page-heading">
      <div>
        <h1>快照</h1>
        <p>快照列表、手动创建与恢复。恢复作用于整个项目及所有设备。</p>
      </div>
      <button type="button" class="btn primary" @click="createOpen = true">创建快照</button>
    </div>

    <div v-if="loading" aria-label="正在加载快照">
      <div class="skeleton" style="width: 70%"></div>
      <div class="skeleton" style="width: 50%"></div>
    </div>
    <EmptyState
      v-else-if="snapshots.length === 0 && !restoring"
      icon="history"
      title="还没有项目快照"
      description="创建一个快照，为当前进度留一个恢复时间点。"
    />

    <div v-if="restoring" class="panel" style="margin-bottom: 24px">
      <div class="panel-body">
        <h3>{{ restoring.status === "ready" ? "项目已恢复，准备重新接入" : "正在恢复项目…" }}</h3>
        <p class="small muted">
          {{
            restoring.status === "ready"
              ? "所有内容已恢复"
              : "离开页面会停止轮询，但不取消服务端任务"
          }}
        </p>
        <div class="progress-track" style="margin: 12px 0">
          <span :style="{ width: `${restoreProgress}%` }"></span>
        </div>
        <div v-if="restoring.status !== 'ready'" class="flex">
          <button type="button" class="btn text" @click="cancelOpen = true">请求取消恢复</button>
        </div>
        <div v-else class="flex">
          <button type="button" class="btn primary" @click="reconnectOpen = true">
            检查本机修改并重新接入
          </button>
        </div>
      </div>
    </div>

    <div class="panel">
      <div v-for="snapshot in snapshots" :key="snapshot.id" class="setting-row">
        <span class="grow">
          <!-- 云端快照无说明字段：label 为空时回退显示时间点。 -->
          <h3>{{ snapshot.label || `快照 · ${snapshot.createdAt}` }}</h3>
          <p class="small muted">{{ snapshot.createdAt }} · 序列 {{ snapshot.changeSequence }}</p>
        </span>
        <span v-if="snapshot.status === 'ready'" class="pill green">可恢复</span>
        <span v-else class="pill">生成中</span>
        <button
          type="button"
          class="btn text"
          :disabled="snapshot.status !== 'ready'"
          @click="askRestore(snapshot)"
        >
          恢复到此快照
        </button>
      </div>
    </div>

    <AppDialog
      :open="createOpen"
      title="创建当前项目快照"
      confirm-text="创建快照"
      @update:open="createOpen = $event"
      @confirm="onCreate"
    >
      <div class="field">
        <label for="snapshot-label">快照说明（可选）</label>
        <input
          id="snapshot-label"
          v-model="createLabel"
          type="text"
          maxlength="128"
          placeholder="例如：发布前基线"
        />
      </div>
    </AppDialog>

    <AppDialog
      :open="restoreTarget !== null"
      title="确认恢复整个项目？"
      confirm-text="开始恢复"
      danger
      @update:open="restoreTarget = $event ? restoreTarget : null"
      @confirm="onRestoreConfirm"
    >
      <p>会先保留当前内容快照，再恢复选定版本。此操作将影响所有设备，请先保存本机未提交修改。</p>
      <div class="field">
        <label for="restore-reason">恢复原因（必填）</label>
        <input
          id="restore-reason"
          v-model="restoreReason"
          type="text"
          maxlength="512"
          placeholder="说明恢复原因"
          required
        />
      </div>
      <p v-if="restoreError" class="field-error" role="alert">{{ restoreError }}</p>
    </AppDialog>

    <AppDialog
      :open="cancelOpen"
      title="请求取消恢复"
      confirm-text="确认取消"
      @update:open="cancelOpen = $event"
      @confirm="onCancelConfirm"
    >
      <div class="field">
        <label for="cancel-reason">取消原因（必填）</label>
        <input id="cancel-reason" v-model="cancelReason" type="text" maxlength="512" required />
      </div>
    </AppDialog>

    <AppDialog
      :open="reconnectOpen"
      title="重新接入恢复后的项目"
      confirm-text="继续"
      @update:open="reconnectOpen = $event"
      @confirm="goConflicts"
    >
      <p>已保留本机未同步修改的恢复副本。旧队列已暂停，请经同步页确认后继续。</p>
    </AppDialog>
  </div>
</template>
