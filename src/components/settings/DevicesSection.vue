<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import AppDialog from "@/components/AppDialog.vue";
import AppIcon from "@/components/AppIcon.vue";
import { formatTimestamp } from "@/domain/datetime";
import { api } from "@/api";
import { ApiError, type Device } from "@/api/types";
import { useSessionStore } from "@/stores/session";
import { useUiStore } from "@/stores/ui";

const router = useRouter();
const session = useSessionStore();
const ui = useUiStore();

const loading = ref(true);
const devices = ref<Device[]>([]);
const renameOpen = ref(false);
const renameId = ref("");
const renameName = ref("");
const revokeTarget = ref<Device | null>(null);

async function reload() {
  loading.value = true;
  try {
    devices.value = await api.listDevices();
  } catch (err) {
    ui.notify(err instanceof ApiError ? err.message : "设备加载失败");
  } finally {
    loading.value = false;
  }
}

onMounted(reload);

function isCurrent(device: Device): boolean {
  return !!session.deviceId && device.id === session.deviceId;
}

function openRename(device: Device) {
  renameId.value = device.id;
  renameName.value = device.name;
  renameOpen.value = true;
}

async function onRenameConfirm() {
  const name = renameName.value.trim();
  if (!name) {
    ui.notify("设备名称不能为空");
    return;
  }
  try {
    await api.renameDevice(renameId.value, name);
    renameOpen.value = false;
    ui.notify("设备名称已更新");
    await reload();
  } catch (err) {
    ui.notify(err instanceof ApiError ? err.message : "重命名失败");
  }
}

async function onRevokeConfirm() {
  if (!revokeTarget.value) return;
  const current = isCurrent(revokeTarget.value);
  try {
    await api.revokeDevice(revokeTarget.value.id);
    revokeTarget.value = null;
    if (current) {
      // 撤销本机后退出登录，需重新认证才能继续同步（§8.3）。
      await session.logout();
      await router.push({ name: "login" });
    } else {
      ui.notify("设备已撤销");
      await reload();
    }
  } catch (err) {
    ui.notify(err instanceof ApiError ? err.message : "撤销失败");
  }
}
</script>

<template>
  <div class="panel">
    <div v-if="loading" class="panel-body" aria-label="正在加载设备">
      <div class="skeleton" style="width: 60%"></div>
    </div>
    <div v-for="device in devices" :key="device.id" class="device-row">
      <span class="device-icon"><AppIcon name="monitor" /></span>
      <span class="grow">
        <h3>
          {{ device.name }}
          <span v-if="isCurrent(device)" class="pill blue">当前浏览器</span>
        </h3>
        <p>
          {{ device.platform }}{{ device.appVersion ? ` · ${device.appVersion}` : "" }}
          <span v-if="device.lastSeenAt"> · 最近活动 {{ formatTimestamp(device.lastSeenAt) }}</span>
          <span v-else> · 最近活动仅展示服务端记录</span>
        </p>
      </span>
      <span class="flex device-actions">
        <button type="button" class="btn text" @click="openRename(device)">重命名</button>
        <button type="button" class="btn text" @click="revokeTarget = device">撤销</button>
      </span>
    </div>
  </div>

  <AppDialog
    :open="renameOpen"
    title="重命名设备"
    confirm-text="保存"
    @update:open="renameOpen = $event"
    @confirm="onRenameConfirm"
  >
    <div class="field">
      <label for="device-name">设备名称</label>
      <input id="device-name" v-model="renameName" type="text" maxlength="128" required />
    </div>
  </AppDialog>

  <AppDialog
    :open="revokeTarget !== null"
    title="撤销此设备？"
    confirm-text="撤销设备"
    danger
    @update:open="revokeTarget = $event ? revokeTarget : null"
    @confirm="onRevokeConfirm"
  >
    <p>
      {{
        revokeTarget && isCurrent(revokeTarget)
          ? "这是当前浏览器。撤销后会退出登录，需重新认证才能继续同步。"
          : "此设备将停止同步并需要重新登录。本地未同步内容不会被远程删除。"
      }}
    </p>
  </AppDialog>
</template>
