<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";

import AppIcon from "@/components/AppIcon.vue";
import IconButton from "@/components/IconButton.vue";
import { formatDueDate, isOverdue } from "@/domain/datetime";
import { todayLocal } from "@/domain/datetime";
import type { Todo } from "@/domain/types";
import { useClassificationStore } from "@/stores/classification";
import { useTodoStore } from "@/stores/todos";

const props = defineProps<{ todo: Todo; projectId: string; sortable?: boolean }>();
const emit = defineEmits<{ (e: "menu", id: string): void }>();

const router = useRouter();
const todos = useTodoStore();
const classification = useClassificationStore();

const today = todayLocal();
const overdue = computed(() => !!props.todo.dueDate && isOverdue(props.todo.dueDate, today));
const categoryName = computed(
  () => classification.categories.find((item) => item.id === props.todo.categoryId)?.name,
);
const done = computed(() => props.todo.status === "completed");

const priorityLabel = computed(() => ["", "低", "中", "高"][props.todo.priority]);

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
    :class="{ done: done }"
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
        <span v-if="props.todo.dueDate" class="task-date" :class="{ overdue: overdue }">
          {{ formatDueDate(props.todo.dueDate, today) }}
        </span>
        <span v-if="props.todo.priority > 0" class="priority">
          <AppIcon name="flag" small />{{ priorityLabel }}
        </span>
        <span v-if="categoryName" class="pill">{{ categoryName }}</span>
        <span v-for="tag in props.todo.tags" :key="tag" class="pill">{{ tag }}</span>
      </span>
    </button>
    <IconButton
      icon="more"
      :label="`任务操作：${props.todo.title}`"
      class="task-menu"
      @click="emit('menu', props.todo.id)"
    />
  </div>
</template>

<style scoped>
.task-main {
  min-width: 0;
  flex: 1;
  color: var(--text);
  text-align: left;
  padding: 0;
}

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
