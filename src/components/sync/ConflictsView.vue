<script setup lang="ts">
import { computed, ref } from "vue";

import EmptyState from "@/components/EmptyState.vue";
import type { ConflictRecord } from "@/stores/sync";
import { useTodoStore } from "@/stores/todos";
import { useSyncStore } from "@/stores/sync";
import { useUiStore } from "@/stores/ui";

const props = defineProps<{ projectId: string }>();
const sync = useSyncStore();
const todos = useTodoStore();
const ui = useUiStore();

const pending = ref<string | null>(null);

const conflicts = computed(() => sync.detail?.conflicts ?? []);

function kindLabel(conflict: ConflictRecord): string {
  switch (conflict.kind) {
    case "todo": {
      const todo = todos.todos.find((item) => item.id === conflict.id);
      return todo?.title ?? "任务";
    }
    case "classification":
      return "目录与标签";
    case "index":
      return "排序与删除记录";
    case "image":
      return conflict.id.split("/").pop() ?? "图片";
    default:
      return conflict.id;
  }
}

function describe(conflict: ConflictRecord): string {
  const scope = conflict.remoteDeleted ? "此版本为删除" : "远端已有新版本";
  return `${scope}（远端 v${conflict.remoteRevision}）。整对象处理，不自动合并。`;
}

async function resolve(conflict: ConflictRecord, keep: "local" | "remote") {
  if (pending.value) return;
  pending.value = conflict.id;
  try {
    const ok = await sync.resolveConflict(props.projectId, conflict, keep);
    if (!ok) {
      ui.notify("远端版本再次发生变化，请刷新比较结果后重新选择");
      await sync.refresh(props.projectId);
    } else {
      ui.notify(keep === "local" ? "已保留本机版本" : "已采用远端版本");
    }
  } finally {
    pending.value = null;
  }
}
</script>

<template>
  <div class="stack">
    <EmptyState
      v-if="conflicts.length === 0"
      icon="check"
      title="没有待处理的冲突"
      description="双端编辑同一对象或远端删除时，冲突会出现在这里。"
    />
    <div v-for="conflict in conflicts" :key="`${conflict.kind}/${conflict.id}`" class="panel">
      <div class="panel-head">
        <h3>{{ kindLabel(conflict) }}</h3>
        <p>{{ describe(conflict) }} · 请选择保留的版本，另一份保留为恢复副本。</p>
      </div>
      <div class="panel-body flex wrap">
        <button
          type="button"
          class="btn primary"
          :disabled="pending === conflict.id"
          @click="resolve(conflict, 'local')"
        >
          保留本机
        </button>
        <button
          type="button"
          class="btn"
          :disabled="pending === conflict.id"
          @click="resolve(conflict, 'remote')"
        >
          采用远端
        </button>
      </div>
    </div>
  </div>
</template>
