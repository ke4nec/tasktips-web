import { ref } from "vue";

// Service Worker 注册与更新提示（§11.2）：仅生产环境注册，作用域 /app/。
// 新版本下载后提示用户刷新（先完成本地保存），不得在输入中自动 reload。
export const swUpdateAvailable = ref(false);

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
  window.dispatchEvent(new Event("tasktips:flush-editors"));
  await new Promise((resolve) => setTimeout(resolve, 800));
  window.location.reload();
}
