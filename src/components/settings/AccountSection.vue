<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";

import LogoutDialog, { type LogoutChoice } from "@/components/LogoutDialog.vue";
import { confirmPasswordIssue, passwordIssue, requiredIssue } from "@/app/validation";
import { ApiError } from "@/api/types";
import { api } from "@/api";
import { performLogout } from "@/app/logout";
import { useSessionStore } from "@/stores/session";
import { useSyncStore } from "@/stores/sync";
import { useUiStore } from "@/stores/ui";

const router = useRouter();
const session = useSessionStore();
const sync = useSyncStore();
const ui = useUiStore();

const current = ref("");
const next = ref("");
const repeat = ref("");
const error = ref("");
const pending = ref(false);
const logoutOpen = ref(false);

async function submit() {
  error.value = "";
  const currentError = requiredIssue(current.value, "当前密码");
  if (currentError) {
    error.value = currentError;
    return;
  }
  const passwordError = passwordIssue(next.value);
  if (passwordError) {
    error.value = passwordError;
    return;
  }
  const confirmError = confirmPasswordIssue(next.value, repeat.value);
  if (confirmError) {
    error.value = confirmError;
    return;
  }
  pending.value = true;
  try {
    await api.changePassword({ currentPassword: current.value, newPassword: next.value });
    ui.notify("密码已更新，其他设备也需重新登录");
    // 改密后清理浏览器会话并要求重新登录（§8.3）。
    await session.logout();
    await router.push({ name: "login" });
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : "更新失败，请重试。";
  } finally {
    pending.value = false;
  }
}

async function openLogout() {
  if (sync.currentProjectId) await sync.refresh(sync.currentProjectId).catch(() => undefined);
  logoutOpen.value = true;
}

async function onLogoutConfirm(choice: LogoutChoice) {
  logoutOpen.value = false;
  await performLogout(choice, sync.currentProjectId || undefined);
  await router.push({ name: "login" });
}
</script>

<template>
  <div class="stack">
    <div class="panel">
      <div class="setting-row">
        <span class="grow">
          <h3>登录账号</h3>
          <p>{{ session.account?.email ?? "未知" }}</p>
        </span>
        <span class="pill green">已验证</span>
      </div>
    </div>
    <form class="panel" novalidate @submit.prevent="submit">
      <div class="panel-head">
        <h3>修改密码</h3>
        <p>成功后本机与其它设备都需要重新登录。</p>
      </div>
      <div class="panel-body">
        <p v-if="error" class="field-error" role="alert">{{ error }}</p>
        <div class="field">
          <label for="password-current">当前密码</label>
          <input
            id="password-current"
            v-model="current"
            type="password"
            autocomplete="current-password"
            required
          />
        </div>
        <div class="field">
          <label for="password-new">新密码（至少 12 字符）</label>
          <input
            id="password-new"
            v-model="next"
            type="password"
            autocomplete="new-password"
            required
          />
        </div>
        <div class="field">
          <label for="password-repeat">确认新密码</label>
          <input
            id="password-repeat"
            v-model="repeat"
            type="password"
            autocomplete="new-password"
            required
          />
        </div>
        <button type="submit" class="btn primary" :disabled="pending">
          {{ pending ? "更新中…" : "确认更新" }}
        </button>
      </div>
    </form>
    <div class="panel">
      <div class="setting-row">
        <span class="grow">
          <h3>退出登录</h3>
          <p>清理本机内存会话并返回登录页。</p>
        </span>
        <button type="button" class="btn danger" @click="openLogout">退出登录</button>
      </div>
    </div>
    <LogoutDialog
      :open="logoutOpen"
      :pending-count="sync.pendingCount"
      @update:open="logoutOpen = $event"
      @confirm="onLogoutConfirm"
    />
  </div>
</template>
