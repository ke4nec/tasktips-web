import { downloadBlob, exportBackup } from "@/backup/backup";
import type { LogoutChoice } from "@/components/LogoutDialog.vue";
import { content } from "@/content";
import { useSessionStore } from "@/stores/session";
import { useSyncStore } from "@/stores/sync";
import { flushEditors } from "@/editor/persistence";
import JSZip from "jszip";

// 统一退出流程（§8.3）：同步后退出 / 导出后退出 / 丢弃并退出，随后清理本机内容。
export async function performLogout(choice: LogoutChoice, projectId?: string): Promise<void> {
  const session = useSessionStore();
  const sync = useSyncStore();
  await flushEditors();
  const email = session.account?.email;
  const repository = content.forUser(email ?? "local");
  const projects = new Set(await repository.listLocalProjects());
  if (projectId) projects.add(projectId);
  if (choice === "sync") {
    for (const id of projects) {
      await sync.syncNowManual(id, { requireSuccess: true });
      if (await sync.getEngine(id).getPendingCount())
        throw new Error("仍有未同步内容，退出已取消。");
    }
  }
  if (choice === "export") {
    const archive = new JSZip();
    for (const id of projects) {
      const blob = await exportBackup(repository, id, session.deviceId ?? "web");
      archive.file(`${encodeURIComponent(id)}.zip`, await blob.arrayBuffer());
    }
    downloadBlob(await archive.generateAsync({ type: "blob" }), "tasktips-all-projects.zip");
  }
  await session.logout();
  // 认证退出成功后让所有引擎失效，避免清理本地数据后旧请求回写内容。
  sync.resetContext();
  if (email) await content.clearUserData(email).catch(() => undefined);
}
