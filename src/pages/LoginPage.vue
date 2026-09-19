<script setup lang="ts">
import { ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";

import AppIcon from "@/components/AppIcon.vue";
import { safeRedirect } from "@/app/navigation";
import { isEmail, passwordIssue } from "@/app/validation";
import { ApiError } from "@/api/types";
import { useProjectStore } from "@/stores/project";
import { useSessionStore } from "@/stores/session";

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const projects = useProjectStore();

const email = ref("");
const password = ref("");
const showPassword = ref(false);
const error = ref("");
const pending = ref(false);

async function submit() {
  error.value = "";
  if (!isEmail(email.value)) {
    error.value = "请输入正确的邮箱地址。";
    return;
  }
  const passwordError = passwordIssue(password.value);
  if (passwordError) {
    error.value = passwordError;
    return;
  }
  pending.value = true;
  try {
    await session.login(email.value, password.value);
    const redirect = safeRedirect(route.query.redirect, "");
    if (redirect) {
      await router.push(redirect);
      return;
    }
    const entry = projects.entryProject();
    await router.push(
      entry
        ? { name: "project-view", params: { projectId: entry.id, view: "today" } }
        : { name: "projects" },
    );
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : "登录失败，请检查网络后重试。";
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div class="auth-layout">
    <div class="auth-brand">
      <span class="logo"
        ><span class="logo-mark"><AppIcon name="logo" /></span>TaskTips</span
      >
      <div class="auth-story">
        <h1>熟悉的 TaskTips，更开阔的记录空间。</h1>
        <p>受邀注册、登录即用、离线记录、多端接续。</p>
      </div>
      <div class="auth-foot">
        <span>离线可重开已下载项目</span><span>数据保留在当前浏览器</span>
      </div>
    </div>
    <div class="auth-form-side">
      <form class="auth-form" novalidate @submit.prevent="submit">
        <h1>登录</h1>
        <p>使用受邀邮箱与密码登录，认证成功后进入项目空间。</p>
        <p v-if="error" class="field-error" role="alert">{{ error }}</p>
        <div class="field">
          <label for="login-email">邮箱</label>
          <input
            id="login-email"
            v-model="email"
            type="email"
            autocomplete="username"
            placeholder="name@example.com"
            required
          />
        </div>
        <div class="field">
          <label for="login-password">密码</label>
          <div class="password-wrap">
            <input
              id="login-password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="输入密码"
              required
            />
            <button
              type="button"
              class="icon-btn"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              <AppIcon name="eye" small />
            </button>
          </div>
        </div>
        <button type="submit" class="btn primary full large" :disabled="pending">
          {{ pending ? "登录中…" : "登录" }}
        </button>
        <div class="auth-divider"></div>
        <p class="small muted">
          还没有账号？<RouterLink :to="{ name: 'register' }">使用邀请注册</RouterLink>
        </p>
        <p class="auth-info">
          <AppIcon name="info" />公共设备使用后请退出并清理，避免本地数据被他人访问。
        </p>
      </form>
    </div>
  </div>
</template>
