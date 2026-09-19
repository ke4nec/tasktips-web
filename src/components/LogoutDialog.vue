<script setup lang="ts">
import AppDialog from "./AppDialog.vue";

const props = withDefaults(defineProps<{ open: boolean; pending?: boolean }>(), { pending: false });

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "confirm"): void;
}>();
</script>

<template>
  <AppDialog
    :open="props.open"
    title="退出登录"
    confirm-text="确认退出"
    danger
    @update:open="emit('update:open', $event)"
    @confirm="emit('confirm')"
  >
    <p>
      将清理本机内存会话并返回登录页，不影响已同步的云端内容。 未同步内容的退出前处理（同步后退出 /
      导出后退出 / 丢弃）在 P6 同步引擎接入后补齐。
    </p>
  </AppDialog>
</template>
