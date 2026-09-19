<script setup lang="ts">
import { onMounted, ref } from "vue";

import AppDialog from "@/components/AppDialog.vue";
import { downloadBlob, parseBackup, exportBackup, type BackupPreview } from "@/backup/backup";
import { content } from "@/content";
import type { RecoveryCopy } from "@/content/port";
import { formatTimestamp } from "@/domain/datetime";
import { useClassificationStore } from "@/stores/classification";
import { useSessionStore } from "@/stores/session";
import { useTodoStore } from "@/stores/todos";
import { useUiStore } from "@/stores/ui";
import { ApiError } from "@/api/types";

const props = defineProps<{ projectId: string }>();
const session = useSessionStore();
const todos = useTodoStore();
const classification = useClassificationStore();
const ui = useUiStore();

const quota = ref<{ usage?: number; quota?: number }>({});
const persisted = ref<boolean | null>(null);
const recoveries = ref<RecoveryCopy[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);
const preview = ref<BackupPreview | null>(null);
const pendingApply = ref<(() => Promise<void>) | null>(null);
const clearOpen = ref(false);

function formatBytes(value?: number): string {
  if (value === undefined) return "未知";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

async function reload() {
  try {
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      quota.value = { usage: estimate.usage, quota: estimate.quota };
    }
    if (navigator.storage?.persisted) {
      persisted.value = await navigator.storage.persisted();
    }
  } catch {
    // 存储 API 不可用不阻止正常使用（§11.2）。
  }
  try {
    recoveries.value = await content.listRecoveries(props.projectId);
  } catch {
    recoveries.value = [];
  }
}

onMounted(reload);

async function requestPersist() {
  try {
    if (!navigator.storage?.persist) {
      ui.notify("当前浏览器不支持持久存储申请");
      return;
    }
    persisted.value = await navigator.storage.persist();
    ui.notify(persisted.value ? "已申请持久存储" : "浏览器拒绝了持久存储申请");
  } catch {
    ui.notify("持久存储申请失败");
  }
}

async function onExport() {
  try {
    const blob = await exportBackup(content, props.projectId, session.deviceId ?? "web");
    downloadBlob(blob, `tasktips-backup-${props.projectId}.zip`);
    ui.notify("备份已导出（不含凭据与设备身份）");
  } catch (error) {
    ui.notify(error instanceof Error ? error.message : "导出失败");
  }
}

async function onImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    const parsed = await parseBackup(content, props.projectId, file);
    preview.value = parsed.preview;
    pendingApply.value = parsed.apply;
  } catch (error) {
    ui.notify(error instanceof Error ? error.message : "备份解析失败");
  }
}

async function onImportConfirm() {
  if (!pendingApply.value) return;
  try {
    // 确认后建立当前内容恢复副本，再事务切换（§10.2）。
    await pendingApply.value();
    preview.value = null;
    pendingApply.value = null;
    await Promise.all([todos.load(props.projectId), classification.load(props.projectId)]);
    ui.notify("备份已恢复，差异按本机改动参与同步");
  } catch (error) {
    ui.notify(error instanceof ApiError ? error.message : "恢复失败，原内容已保留");
  }
}

async function restoreRecovery(copy: RecoveryCopy) {
  try {
    await content.restoreRecovery(props.projectId, copy.id);
    await Promise.all([todos.load(props.projectId), classification.load(props.projectId)]);
    await reload();
    ui.notify("已恢复到副本内容");
  } catch (error) {
    ui.notify(error instanceof Error ? error.message : "恢复失败");
  }
}

async function deleteRecovery(copy: RecoveryCopy) {
  await content.deleteRecovery(props.projectId, copy.id);
  await reload();
}

async function onClearConfirm() {
  clearOpen.value = false;
  await content.clearProjectData(props.projectId);
  await Promise.all([todos.load(props.projectId), classification.load(props.projectId)]);
  ui.notify("已清理本机项目副本，下次打开会重新下载");
}
</script>

<template>
  <div class="stack">
    <div class="panel">
      <div class="setting-row">
        <span class="grow">
          <h3>存储占用</h3>
          <p>
            已用 {{ formatBytes(quota.usage) }} / 可用 {{ formatBytes(quota.quota) }} · 持久存储：{{
              persisted === null ? "未知" : persisted ? "已保留" : "未保留"
            }}
          </p>
        </span>
        <button type="button" class="btn" @click="requestPersist">申请保留</button>
      </div>
      <div class="setting-row">
        <span class="grow">
          <h3>导出备份</h3>
          <p>ZIP 兼容移动端格式，不包含账号凭据与设备身份。</p>
        </span>
        <button type="button" class="btn" @click="onExport">导出项目备份</button>
      </div>
      <div class="setting-row">
        <span class="grow">
          <h3>恢复内容备份</h3>
          <p>先验证内容，再预览覆盖范围；恢复前保留当前本地内容副本。</p>
        </span>
        <span>
          <button type="button" class="btn" @click="fileInput?.click()">选择备份文件</button>
          <input ref="fileInput" type="file" hidden accept=".zip" @change="onImportFile" />
        </span>
      </div>
      <div class="setting-row">
        <span class="grow">
          <h3>清理此浏览器的项目副本</h3>
          <p>未同步内容需要先导出或同步。清理不会删除云端内容。</p>
        </span>
        <button type="button" class="btn danger" @click="clearOpen = true">确认清理</button>
      </div>
    </div>

    <h2 class="section-title"><span>恢复副本</span></h2>
    <div class="panel">
      <div v-if="recoveries.length === 0" class="panel-body small muted">暂无恢复副本。</div>
      <div v-for="copy in recoveries" :key="copy.id" class="setting-row">
        <span class="grow">
          <h3>{{ copy.label }}</h3>
          <p>{{ formatTimestamp(copy.createdAt) }}</p>
        </span>
        <span class="flex">
          <button type="button" class="btn" @click="restoreRecovery(copy)">恢复</button>
          <button type="button" class="btn text" @click="deleteRecovery(copy)">删除</button>
        </span>
      </div>
    </div>

    <AppDialog
      :open="preview !== null"
      title="确认覆盖本地内容"
      confirm-text="恢复备份"
      @update:open="preview = $event ? preview : null"
      @confirm="onImportConfirm"
    >
      <p>
        备份：{{ preview?.todos }} 条任务、{{ preview?.categories }} 个目录、
        {{ preview?.tags }} 个标签、{{ preview?.images }} 张图片。 当前内容将先保留为恢复副本。
      </p>
      <div class="notice warning">恢复后按本机改动参与同步，不导入旧设备身份或凭据。</div>
    </AppDialog>

    <AppDialog
      :open="clearOpen"
      title="清理此浏览器的项目副本？"
      confirm-text="确认清理"
      danger
      @update:open="clearOpen = $event"
      @confirm="onClearConfirm"
    >
      <p>未同步内容需要先导出或同步。清理不会删除云端内容，下次打开会重新下载。</p>
    </AppDialog>
  </div>
</template>
