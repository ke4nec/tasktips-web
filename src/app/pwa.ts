import { ref } from "vue";
import { flushEditors } from "@/editor/persistence";

// Service Worker 注册与更新提示（§11.2）：仅生产环境注册，作用域 /app/。
// 新版本下载后提示用户刷新（先完成本地保存），不得在输入中自动 reload。
export const swUpdateAvailable = ref(false);
export const swUpdateError = ref("");
export const swUpdating = ref(false);

export async function registerSW(): Promise<void> {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register("/app/sw.js", { scope: "/app/" });
    const notifyIfWaiting = () => {
      if (registration.waiting) swUpdateAvailable.value = true;
    };
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed") notifyIfWaiting();
      });
    });
    notifyIfWaiting();
  } catch {
    // 离线应用资源不可用不阻止正常使用
  }
}

// 用户确认更新：先通知编辑器刷新本地保存，再重载页面。
export async function applySwUpdate(): Promise<void> {
  if (swUpdating.value) return;
  swUpdating.value = true;
  swUpdateError.value = "";
  try {
    await flushEditors();
    const registration = await navigator.serviceWorker.getRegistration("/app/");
    if (!registration?.waiting) throw new Error("更新尚未准备好，请稍后重试。");
    await new Promise<void>((resolve, reject) => {
      const changed = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        navigator.serviceWorker.removeEventListener("controllerchange", changed);
        reject(new Error("更新未能完成，请重试。"));
      }, 15000);
      navigator.serviceWorker.addEventListener("controllerchange", changed, { once: true });
      registration.waiting!.postMessage("activate-update");
    });
    window.location.reload();
  } catch (error) {
    swUpdateError.value = error instanceof Error ? error.message : "更新失败，请重试。";
  } finally {
    swUpdating.value = false;
  }
}
