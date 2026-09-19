<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";

import AppDialog from "@/components/AppDialog.vue";
import EmptyState from "@/components/EmptyState.vue";
import { remainingDays } from "@/domain/classification";
import { formatTimestamp } from "@/domain/datetime";
import { useClassificationStore } from "@/stores/classification";

type TrashTab = "todo" | "category" | "tag";

const route = useRoute();
const classification = useClassificationStore();
const projectId = computed(() => route.params.projectId as string);

const tab = ref<TrashTab>("todo");
const loading = ref(true);
const confirm = ref<{ title: string; message: string; action: () => Promise<void> } | null>(null);

async function load() {
  loading.value = true;
  try {
    await classification.reloadTrash();
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  // 回收站页独立加载，避免依赖列表页的加载顺序。
  if (!classification.projectId) {
    await classification.load(projectId.value);
  }
  await load();
});

const trash = computed(() => classification.trash);
const counts = computed(() => ({
  todo: trash.value?.todos.length ?? 0,
  category: trash.value?.categories.length ?? 0,
  tag: trash.value?.tags.length ?? 0,
}));

function askRestore(kind: TrashTab, id: string, name: string) {
  confirm.value = {
    title: `恢复“${name}”？`,
    message: "恢复后会保留原有目录与标签关联。",
    action: async () => {
      if (kind === "todo") await classification.restoreTodo(id);
      else if (kind === "category") await classification.restoreCategory(id);
      else await classification.restoreTag(id);
    },
  };
}

function askPurge(kind: TrashTab, id: string, name: string) {
  confirm.value = {
    title: `彻底删除“${name}”？`,
    message: "此操作无法撤销，其他设备也将在同步后移除它。",
    action: async () => {
      if (kind === "todo") await classification.purgeTodo(id);
      else if (kind === "category") await classification.purgeCategory(id);
      else await classification.purgeTag(id);
    },
  };
}

function askEmpty() {
  confirm.value = {
    title: "清空回收站？",
    message: "所有类型的回收站内容将被彻底删除，此操作无法撤销。",
    action: async () => classification.emptyTrash(),
  };
}

async function onConfirm() {
  const action = confirm.value?.action;
  confirm.value = null;
  if (action) await action();
}
</script>

<template>
  <div class="content">
    <div class="page-heading">
      <div>
        <h1>回收站</h1>
        <p>删除内容保留 30 天，到期自动清理。</p>
      </div>
      <button
        type="button"
        class="btn danger"
        :disabled="counts.todo + counts.category + counts.tag === 0"
        @click="askEmpty"
      >
        清空回收站
      </button>
    </div>
    <div class="tabs" role="tablist" aria-label="回收站类型">
      <button
        type="button"
        role="tab"
        :class="{ active: tab === 'todo' }"
        :aria-selected="tab === 'todo'"
        @click="tab = 'todo'"
      >
        任务 · {{ counts.todo }}
      </button>
      <button
        type="button"
        role="tab"
        :class="{ active: tab === 'category' }"
        :aria-selected="tab === 'category'"
        @click="tab = 'category'"
      >
        目录 · {{ counts.category }}
      </button>
      <button
        type="button"
        role="tab"
        :class="{ active: tab === 'tag' }"
        :aria-selected="tab === 'tag'"
        @click="tab = 'tag'"
      >
        标签 · {{ counts.tag }}
      </button>
    </div>

    <div v-if="loading" aria-label="正在加载回收站">
      <div class="skeleton" style="width: 70%"></div>
      <div class="skeleton" style="width: 50%"></div>
    </div>
    <EmptyState
      v-else-if="counts.todo + counts.category + counts.tag === 0"
      icon="trash"
      title="回收站是空的"
      description="删除后的内容会在这里保留 30 天。"
    />

    <div v-else-if="tab === 'todo'" class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>任务</th>
            <th>删除时间</th>
            <th>剩余天数</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in trash?.todos ?? []" :key="item.id">
            <td>
              <strong style="font-weight: 500">{{ item.name }}</strong>
              <div v-if="item.categoryPath?.length || item.tags?.length" class="muted">
                <span v-if="item.categoryPath?.length">{{ item.categoryPath.join(" / ") }}</span>
                <span v-if="item.categoryPath?.length && item.tags?.length"> · </span>
                <span v-if="item.tags?.length">{{ item.tags.join("、") }}</span>
              </div>
            </td>
            <td class="muted">{{ formatTimestamp(item.deletedAt) }}</td>
            <td class="muted">{{ remainingDays(item.deletedAt) }} 天</td>
            <td>
              <button type="button" class="btn" @click="askRestore('todo', item.id, item.name)">
                恢复
              </button>
              <button type="button" class="btn text" @click="askPurge('todo', item.id, item.name)">
                彻底删除
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else-if="tab === 'category'" class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>目录</th>
            <th>删除时间</th>
            <th>剩余天数</th>
            <th>包含</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in trash?.categories ?? []" :key="item.id">
            <td>
              <strong style="font-weight: 500">{{ item.name }}</strong>
            </td>
            <td class="muted">{{ formatTimestamp(item.deletedAt) }}</td>
            <td class="muted">{{ remainingDays(item.deletedAt) }} 天</td>
            <td class="muted">
              {{ item.subCategoryCount ?? 0 }} 个子目录 · {{ item.trashedTodoCount ?? 0 }} 条任务
            </td>
            <td>
              <button type="button" class="btn" @click="askRestore('category', item.id, item.name)">
                恢复
              </button>
              <button
                type="button"
                class="btn text"
                @click="askPurge('category', item.id, item.name)"
              >
                彻底删除
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>标签</th>
            <th>删除时间</th>
            <th>剩余天数</th>
            <th>引用</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in trash?.tags ?? []" :key="item.id">
            <td>
              <strong style="font-weight: 500">{{ item.name }}</strong>
            </td>
            <td class="muted">{{ formatTimestamp(item.deletedAt) }}</td>
            <td class="muted">{{ remainingDays(item.deletedAt) }} 天</td>
            <td class="muted">{{ item.usageCount ?? 0 }} 条任务仍在引用</td>
            <td>
              <button type="button" class="btn" @click="askRestore('tag', item.id, item.name)">
                恢复
              </button>
              <button type="button" class="btn text" @click="askPurge('tag', item.id, item.name)">
                彻底删除
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <AppDialog
      :open="confirm !== null"
      :title="confirm?.title ?? ''"
      confirm-text="确认"
      danger
      @update:open="confirm = $event ? confirm : null"
      @confirm="onConfirm"
    >
      <p>{{ confirm?.message }}</p>
    </AppDialog>
  </div>
</template>
