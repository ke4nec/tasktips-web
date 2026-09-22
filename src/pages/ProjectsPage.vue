<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import AppDialog from "@/components/AppDialog.vue";
import AppIcon from "@/components/AppIcon.vue";
import EmptyState from "@/components/EmptyState.vue";
import IconButton from "@/components/IconButton.vue";
import LogoutDialog, { type LogoutChoice } from "@/components/LogoutDialog.vue";
import { ApiError } from "@/api/types";
import { performLogout } from "@/app/logout";
import { useProjectStore } from "@/stores/project";
import { useSyncStore } from "@/stores/sync";
import { useUiStore } from "@/stores/ui";

const router = useRouter();
const projects = useProjectStore();
const sync = useSyncStore();
const ui = useUiStore();

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
    if (dialogMode.value === "create") {
      const project = await projects.create(name);
      dialogOpen.value = false;
      await enter(project.id);
    } else {
      // 重命名后留在项目列表（store 已刷新列表），不打断用户继续整理。
      await projects.rename(renameId.value, name);
      dialogOpen.value = false;
    }
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
  try {
    await performLogout(choice, projects.entryProject()?.id);
    logoutOpen.value = false;
    await router.push({ name: "login" });
  } catch (err) {
    ui.notify(err instanceof Error ? err.message : "退出前同步失败，请重试");
    logoutOpen.value = true;
  }
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
          <h1>从一个空间开始</h1>
          <p>项目之间内容独立，切换前会持久化当前编辑。</p>
        </div>
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
        <article v-for="project in projects.projects" :key="project.id" class="project-card">
          <div class="between">
            <span class="feature-icon"><AppIcon name="folder" /></span>
            <IconButton
              icon="edit"
              :label="`重命名项目 ${project.name}`"
              @click="openRename(project.id, project.name)"
            />
          </div>
          <button type="button" class="card-main" @click="enter(project.id)">
            <h2>{{ project.name }}</h2>
            <p>工作、生活与日常灵感</p>
            <div class="card-foot"><span>私人项目 · 独立本地分区</span></div>
          </button>
        </article>
        <button type="button" class="project-card new" @click="openCreate">
          <span class="feature-icon"><AppIcon name="plus" /></span>
          <h3>新建项目</h3>
          <p>为不同的事情留出独立空间</p>
        </button>
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
  margin-top: 22px;
  padding: 0;
  color: inherit;
}

.card-main h2 {
  font-size: 17px;
  margin-bottom: 6px;
}

.card-main p {
  font-size: 11px;
  color: var(--muted);
}
</style>
