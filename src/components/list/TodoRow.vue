<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";

import AppIcon from "@/components/AppIcon.vue";
import IconButton from "@/components/IconButton.vue";
import { formatDueDate, isOverdue, todayLocal } from "@/domain/datetime";
import { pillToneForColor } from "@/domain/colors";
import type { Todo } from "@/domain/types";
import { useClassificationStore } from "@/stores/classification";
import { useTodoStore } from "@/stores/todos";

const props = withDefaults(
  defineProps<{ todo: Todo; projectId: string; sortable?: boolean; selected?: boolean }>(),
  { sortable: false, selected: false },
);
const emit = defineEmits<{ (e: "menu", id: string): void }>();

const router = useRouter();
const todos = useTodoStore();
const classification = useClassificationStore();

const today = todayLocal();
const overdue = computed(() => !!props.todo.dueDate && isOverdue(props.todo.dueDate, today));
const category = computed(() =>
  classification.categories.find((item) => item.id === props.todo.categoryId),
);
const done = computed(() => props.todo.status === "completed");

const priorityLabel = computed(() => ["", "低优先级", "中优先级", "高优先级"][props.todo.priority]);
// 标签 pill 按标签自身颜色映射语义色调（对齐设计稿彩色标签）。
const tagTones = computed(() =>
  props.todo.tags.map((tag) =>
    pillToneForColor(classification.tags.find((item) => item.name === tag)?.color),
  ),
);

function openDetail() {
  router.push({
    name: "todo-detail",
    params: { projectId: props.projectId, todoId: props.todo.id },
  });
}

function onDragStart(event: DragEvent) {
  event.dataTransfer?.setData("text/plain", props.todo.id);
}
</script>

<template>
  <div
    class="task-row"
    :class="{ done: done, selected: props.selected }"
    :draggable="props.sortable"
    @dragstart="onDragStart"
  >
    <span v-if="props.sortable" class="drag-handle" aria-hidden="true">⋮⋮</span>
    <input
      type="checkbox"
      class="task-check"
      :checked="done"
      :aria-label="done ? `重新打开${props.todo.title}` : `完成${props.todo.title}`"
      @change="todos.toggleCompleted(props.todo.id)"
    />
    <button type="button" class="task-main" @click="openDetail">
      <span class="task-title">{{ props.todo.title }}</span>
      <span class="task-subtitle">
        <template v-if="category"> <AppIcon name="folder" />{{ category.name }} </template>
        <span
          v-for="(tag, index) in props.todo.tags"
          :key="tag"
          class="pill"
          :class="tagTones[index]"
          >{{ tag }}</span
        >
      </span>
    </button>
    <span v-if="props.todo.priority > 0" class="priority" :title="priorityLabel">
      <AppIcon name="flag" small />
    </span>
    <span v-if="props.todo.dueDate" class="task-date" :class="{ overdue: overdue }">
      {{ formatDueDate(props.todo.dueDate, today) }}
    </span>
    <IconButton
      icon="more"
      :label="`任务操作：${props.todo.title}`"
      class="task-menu"
      @click="emit('menu', props.todo.id)"
    />
  </div>
</template>

<style scoped>
.drag-handle {
  color: var(--subtle);
  cursor: grab;
  letter-spacing: -2px;
  user-select: none;
  flex: none;
}

.task-row.drag-over {
  box-shadow: inset 0 2px 0 var(--brand);
}
</style>
