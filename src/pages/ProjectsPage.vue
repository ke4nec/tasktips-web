<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import AppDialog from "@/components/AppDialog.vue";
import AppIcon from "@/components/AppIcon.vue";
import EmptyState from "@/components/EmptyState.vue";
import IconButton from "@/components/IconButton.vue";
import LogoutDialog, { type LogoutChoice } from "@/components/LogoutDialog.vue";
import { ApiError } from "@/api/types";
import { content } from "@/content";
import { useProjectStore } from "@/stores/project";
import { useSessionStore } from "@/stores/session";
import { useSyncStore } from "@/stores/sync";

const router = useRouter();
const session = useSessionStore();
const projects = useProjectStore();
const sync = useSyncStore();

const loading = ref(true);
const loadError = ref("");
const dialogOpen = ref(false);
const dialogMode = ref<"create" | "rename">("create");
const nameInput = ref("");
const renameId = ref("");
const dialogError = ref("");
const logoutOpen = ref(false);

async function reload() {
  loading.value = true;
  loadError.value = "";
  try {
    await projects.load();
  } catch (err) {
    loadError.value = err instanceof ApiError ? err.message : "项目加载失败，请重试。";
  } finally {
    loading.value = false;
  }
}

onMounted(reload);

function openCreate() {
  dialogMode.value = "create";
  nameInput.value = "";
  dialogError.value = "";
  dialogOpen.value = true;
}

function openRename(id: string, current: string) {
  dialogMode.value = "rename";
  renameId.value = id;
  nameInput.value = current;
  dialogError.value = "";
  dialogOpen.value = true;
}

async function onDialogConfirm() {
  const name = nameInput.value.trim();
  if (!name) {
    dialogError.value = "项目名称不能为空。";
    return;
  }
  try {
    const project =
      dialogMode.value === "create"
        ? await projects.create(name)
        : await projects.rename(renameId.value, name);
    dialogOpen.value = false;
    await enter(project.id);
  } catch (err) {
    dialogError.value = err instanceof ApiError ? err.message : "保存失败，请重试。";
  }
}

async function enter(projectId: string) {
  projects.rememberProject(projectId);
  await router.push({ name: "project-view", params: { projectId, view: "today" } });
}

async function openLogout() {
  const entry = projects.entryProject();
  if (entry) await sync.refresh(entry.id).catch(() => undefined);
  logoutOpen.value = true;
}

async function onLogoutConfirm(choice: LogoutChoice) {
  logoutOpen.value = false;
  if (choice === "sync") {
    // 同步后退出：先手动同步当前入口项目（§8.3）。
    const entry = projects.entryProject();
    if (entry) await sync.syncNowManual(entry.id).catch(() => undefined);
  }
  const email = session.account?.email;
  await session.logout();
  // 退出默认清理该账号的本地内容（§8.3）。
  if (email) await content.clearUserData(email).catch(() => undefined);
  await router.push({ name: "login" });
}
</script>

<template>
  <div class="standalone">
    <div class="standalone-header">
      <span class="logo"
        ><span class="logo-mark"><AppIcon name="logo" /></span>TaskTips</span
      >
      <button type="button" class="btn text" @click="openLogout">退出登录</button>
    </div>
    <div class="project-content">
      <div class="page-heading">
        <div>
          <h1>项目空间</h1>
          <p>项目之间内容独立，切换前会持久化当前编辑。</p>
        </div>
        <button type="button" class="btn primary" @click="openCreate">
          <AppIcon name="plus" small />新建项目
        </button>
      </div>
      <p v-if="loadError" class="field-error" role="alert">
        {{ loadError }} <button type="button" class="btn text" @click="reload">重试</button>
      </p>
      <div v-if="loading" aria-label="正在加载项目">
        <div class="skeleton" style="width: 70%"></div>
        <div class="skeleton" style="width: 90%"></div>
        <div class="skeleton" style="width: 60%"></div>
      </div>
      <EmptyState
        v-else-if="projects.projects.length === 0 && !loadError"
        icon="folder"
        title="还没有项目空间"
        description="创建你的第一个项目，开始记录今天的小计划。"
        action-label="新建项目"
        @action="openCreate"
      />
      <div v-else class="three-col">
        <div v-for="project in projects.projects" :key="project.id" class="project-card">
          <button type="button" class="card-main" @click="enter(project.id)">
            <h2>{{ project.name }}</h2>
            <p>点击进入工作台</p>
          </button>
          <span class="card-foot">
            <span>独立本地分区</span>
            <IconButton
              icon="edit"
              :label="`重命名项目 ${project.name}`"
              @click="openRename(project.id, project.name)"
            />
          </span>
        </div>
      </div>
    </div>

    <AppDialog
      :open="dialogOpen"
      :title="dialogMode === 'create' ? '新建项目' : '重命名项目'"
      :confirm-text="dialogMode === 'create' ? '创建并进入' : '保存'"
      @update:open="dialogOpen = $event"
      @confirm="onDialogConfirm"
    >
      <p>为一类事情建立独立的空间，项目之间的内容不会混合。</p>
      <div class="field">
        <label for="project-name">项目名称</label>
        <input
          id="project-name"
          v-model="nameInput"
          type="text"
          maxlength="128"
          placeholder="例如：阅读与学习"
          required
        />
      </div>
      <p v-if="dialogError" class="field-error" role="alert">{{ dialogError }}</p>
    </AppDialog>

    <LogoutDialog
      :open="logoutOpen"
      :pending-count="sync.pendingCount"
      @update:open="logoutOpen = $event"
      @confirm="onLogoutConfirm"
    />
  </div>
</template>

<style scoped>
.project-card {
  display: flex;
  flex-direction: column;
}

.card-main {
  text-align: left;
  flex: 1;
  padding: 0;
}

.card-main h2 {
  font-size: 17px;
  margin-bottom: 6px;
}

.card-main p {
  font-size: 11px;
  color: var(--muted);
}

.card-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 28px;
  padding-top: 15px;
  border-top: 1px solid var(--line);
  font-size: 10px;
  color: var(--subtle);
}
</style>
