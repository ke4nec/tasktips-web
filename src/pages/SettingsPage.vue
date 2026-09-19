<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import LogoutDialog, { type LogoutChoice } from "@/components/LogoutDialog.vue";
import ThemeSwitcher from "@/components/ThemeSwitcher.vue";
import { content } from "@/content";
import { useSessionStore } from "@/stores/session";
import { useSyncStore } from "@/stores/sync";

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const sync = useSyncStore();
// 设置子页映射为 ?section=...（设计文档 §14.2），P7 实现各分区内容。
const section = computed(() => (route.query.section as string | undefined) ?? "appearance");
const logoutOpen = ref(false);

async function openLogout() {
  if (sync.currentProjectId) await sync.refresh(sync.currentProjectId).catch(() => undefined);
  logoutOpen.value = true;
}

async function onLogoutConfirm(choice: LogoutChoice) {
  logoutOpen.value = false;
  if (choice === "sync" && sync.currentProjectId) {
    await sync.syncNowManual(sync.currentProjectId).catch(() => undefined);
  }
  const email = session.account?.email;
  await session.logout();
  if (email) await content.clearUserData(email).catch(() => undefined);
  await router.push({ name: "login" });
}
</script>

<template>
  <div class="content narrow">
    <div class="page-heading">
      <div>
        <h1>设置</h1>
        <p>账号、设备、外观、编辑、本地存储及备份。P7 补齐各分区。</p>
      </div>
    </div>
    <div class="panel">
      <div class="setting-row">
        <span class="grow">
          <h3>外观主题</h3>
          <p>浅色、深色或跟随系统，保存在当前浏览器（section={{ section }})。</p>
        </span>
        <ThemeSwitcher />
      </div>
      <div class="setting-row">
        <span class="grow">
          <h3>退出登录</h3>
          <p>当前账号：{{ session.account?.email ?? "未知" }}。清理本机内存会话并返回登录页。</p>
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
