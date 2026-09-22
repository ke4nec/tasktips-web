import { afterEach, expect, it, vi } from "vitest";
import { applySwUpdate, swUpdateError } from "./pwa";
import { registerEditorPersistence } from "@/editor/persistence";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("保存超过旧的 800ms 窗口时仍等待完成，激活后才刷新", async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const unregister = registerEditorPersistence(() => pending);
  const worker = new EventTarget();
  const postMessage = vi.fn(() => worker.dispatchEvent(new Event("controllerchange")));
  Object.assign(worker, { getRegistration: async () => ({ waiting: { postMessage } }) });
  vi.stubGlobal("navigator", { serviceWorker: worker });
  const reload = vi.spyOn(window.location, "reload").mockImplementation(() => undefined);
  const update = applySwUpdate();
  await vi.advanceTimersByTimeAsync(2000);
  expect(postMessage).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
  finish();
  await update;
  expect(postMessage).toHaveBeenCalledWith("activate-update");
  expect(reload).toHaveBeenCalledOnce();
  unregister();
});

it("保存失败时显示错误，不激活或刷新", async () => {
  const unregister = registerEditorPersistence(async () => {
    throw new Error("磁盘写入失败");
  });
  const reload = vi.spyOn(window.location, "reload").mockImplementation(() => undefined);
  await applySwUpdate();
  expect(swUpdateError.value).toBe("磁盘写入失败");
  expect(reload).not.toHaveBeenCalled();
  unregister();
});
