<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";

import AppIcon from "@/components/AppIcon.vue";
import { confirmPasswordIssue, passwordIssue, requiredIssue } from "@/app/validation";
import { ApiError } from "@/api/types";
import { useProjectStore } from "@/stores/project";
import { useSessionStore } from "@/stores/session";

const router = useRouter();
const session = useSessionStore();
const projects = useProjectStore();

const invitationToken = ref("");
const password = ref("");
const confirm = ref("");
const showPassword = ref(false);
const error = ref("");
const pending = ref(false);

// 邀请链接形如 /app/register#invitation=...：取出后立即清除地址中的凭据，
// 仅在当前注册会话内保存（设计文档 §8.1）。
function takeInvitationFromHash() {
  const hash = window.location.hash;
  const match = hash.match(/invitation=([^&]+)/);
  if (match) {
    invitationToken.value = decodeURIComponent(match[1]);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

onMounted(takeInvitationFromHash);

async function submit() {
  error.value = "";
  const tokenError = requiredIssue(invitationToken.value, "邀请凭据");
  if (tokenError) {
    error.value = tokenError;
    return;
  }
  const passwordError = passwordIssue(password.value);
  if (passwordError) {
    error.value = passwordError;
    return;
  }
  const confirmError = confirmPasswordIssue(password.value, confirm.value);
  if (confirmError) {
    error.value = confirmError;
    return;
  }
  pending.value = true;
  try {
    // 账号邮箱由邀请绑定：激活成功即获会话，不要求再次输入密码。
    await session.activate(invitationToken.value.trim(), password.value);
    const entry = projects.entryProject();
    await router.push(
      entry
        ? { name: "project-view", params: { projectId: entry.id, view: "today" } }
        : { name: "projects" },
    );
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : "激活失败，请稍后重试。";
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
        <h1>凭邀请进入，登录即用。</h1>
        <p>新密码至少 12 个字符；账号邮箱由邀请绑定，不开放任意邮箱自助建号。</p>
      </div>
    </div>
    <div class="auth-form-side">
      <form class="auth-form" novalidate @submit.prevent="submit">
        <h1>邀请注册</h1>
        <p>输入邀请凭据、设置密码并激活。若激活已成功但响应丢失，请直接登录。</p>
        <p v-if="error" class="field-error" role="alert">{{ error }}</p>
        <div class="field">
          <label for="register-invitation">邀请凭据</label>
          <input
            id="register-invitation"
            v-model="invitationToken"
            type="text"
            autocomplete="off"
            placeholder="粘贴管理员提供的邀请凭据"
            required
          />
        </div>
        <div class="field">
          <label for="register-password">新密码</label>
          <div class="password-wrap">
            <input
              id="register-password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password"
              placeholder="至少 12 个字符"
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
        <div class="field">
          <label for="register-confirm">确认新密码</label>
          <input
            id="register-confirm"
            v-model="confirm"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="new-password"
            placeholder="再次输入新密码"
            required
          />
        </div>
        <button type="submit" class="btn primary full large" :disabled="pending">
          {{ pending ? "激活中…" : "激活并进入" }}
        </button>
        <div class="auth-divider"></div>
        <p class="small muted">
          已有账号？<RouterLink :to="{ name: 'login' }">直接登录</RouterLink>
        </p>
      </form>
    </div>
  </div>
</template>
