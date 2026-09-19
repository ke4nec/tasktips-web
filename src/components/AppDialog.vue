<script setup lang="ts">
import { ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
    noFooter?: boolean;
  }>(),
  { confirmText: "确认", cancelText: "取消", danger: false, noFooter: false },
);

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "confirm", form: FormData | null): void;
}>();

// 原生 <dialog>：自带焦点陷阱；打开时聚焦首个可输入控件，关闭后归还焦点（设计稿行为）。
const dialogRef = ref<HTMLDialogElement | null>(null);
let returnFocus: Element | null = null;

function close() {
  emit("update:open", false);
}

function onNativeClose() {
  emit("update:open", false);
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === dialogRef.value) close();
}

function onSubmit(event: Event) {
  event.preventDefault();
  const form = event.target instanceof HTMLFormElement ? new FormData(event.target) : null;
  emit("confirm", form);
}

watch(
  () => props.open,
  (value) => {
    const dialog = dialogRef.value;
    if (!dialog) return;
    if (value) {
      returnFocus = document.activeElement;
      if (!dialog.open) dialog.showModal();
      requestAnimationFrame(() => {
        dialog.querySelector<HTMLElement>("input, textarea, select, button")?.focus();
      });
    } else {
      if (dialog.open) dialog.close();
      if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus();
    }
  },
);
</script>

<template>
  <dialog
    ref="dialogRef"
    aria-labelledby="app-dialog-title"
    @close="onNativeClose"
    @click="onBackdropClick"
  >
    <div class="dialog-header">
      <h2 id="app-dialog-title">{{ title }}</h2>
      <button type="button" class="icon-btn" aria-label="关闭弹层" @click="close">✕</button>
    </div>
    <form @submit="onSubmit">
      <div class="dialog-body">
        <slot />
      </div>
      <div v-if="!noFooter" class="dialog-footer">
        <slot name="footer">
          <button type="button" class="btn" @click="close">{{ cancelText }}</button>
          <button type="submit" class="btn" :class="danger ? 'danger' : 'primary'">
            {{ confirmText }}
          </button>
        </slot>
      </div>
    </form>
  </dialog>
</template>
