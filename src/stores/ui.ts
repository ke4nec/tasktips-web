import { defineStore } from "pinia";
import { ref } from "vue";

// 全局轻提示（对齐设计稿 toast：3.2s 自动消失，后一条覆盖前一条）。
export const useUiStore = defineStore("ui", () => {
  const toastMessage = ref("");
  const toastVisible = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function notify(message: string) {
    toastMessage.value = message;
    toastVisible.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      toastVisible.value = false;
    }, 3200);
  }

  return { toastMessage, toastVisible, notify };
});
