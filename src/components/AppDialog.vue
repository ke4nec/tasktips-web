<script setup lang="ts">
import { ref, useId, watch } from "vue";

// 同页多弹层并存（关闭的 <dialog> 仍在 DOM），标题 id 必须实例唯一，
// 否则 aria-labelledby 会解析到首个同名标题导致读屏与定位错乱。
const titleId = useId();

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
    :aria-labelledby="titleId"
    @close="onNativeClose"
    @click="onBackdropClick"
  >
    <div class="dialog-header">
      <h2 :id="titleId">{{ title }}</h2>
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
