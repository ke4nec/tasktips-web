<script setup lang="ts">
import { ref, watch } from "vue";

import AppDialog from "./AppDialog.vue";

export type LogoutChoice = "sync" | "export" | "discard";

const props = withDefaults(
  defineProps<{ open: boolean; pending?: boolean; pendingCount?: number }>(),
  { pending: false, pendingCount: 0 },
);

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "confirm", choice: LogoutChoice): void;
}>();

const choice = ref<LogoutChoice>("sync");

watch(
  () => props.open,
  (value) => {
    if (value) choice.value = "sync";
  },
);
</script>

<template>
  <AppDialog
    :open="props.open"
    title="退出登录"
    confirm-text="确认退出"
    danger
    @update:open="emit('update:open', $event)"
    @confirm="emit('confirm', choice)"
  >
    <p v-if="props.pendingCount > 0">
      此浏览器还有 {{ props.pendingCount }} 项未同步修改。退出前请选择处理方式；
      清理后不会影响已同步的云端内容。
    </p>
    <p v-else>退出将清理此账号所有项目的本机内容，请选择同步或导出后退出。</p>
    <div class="field">
      <label for="logout-choice">未同步内容</label>
      <select id="logout-choice" v-model="choice">
        <option value="sync">同步后退出</option>
        <option value="export">导出后退出</option>
        <option value="discard">丢弃未同步修改并退出</option>
      </select>
    </div>
  </AppDialog>
</template>
