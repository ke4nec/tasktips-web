<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import LogoutDialog from "@/components/LogoutDialog.vue";
import ThemeSwitcher from "@/components/ThemeSwitcher.vue";
import { useSessionStore } from "@/stores/session";

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
// 设置子页映射为 ?section=...（设计文档 §14.2），P7 实现各分区内容。
const section = computed(() => (route.query.section as string | undefined) ?? "appearance");
const logoutOpen = ref(false);

async function onLogoutConfirm() {
  logoutOpen.value = false;
  await session.logout();
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
        <button type="button" class="btn danger" @click="logoutOpen = true">退出登录</button>
      </div>
    </div>
    <LogoutDialog
      :open="logoutOpen"
      @update:open="logoutOpen = $event"
      @confirm="onLogoutConfirm"
    />
  </div>
</template>
