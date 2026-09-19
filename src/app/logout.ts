import { downloadBlob, exportBackup } from "@/backup/backup";
import type { LogoutChoice } from "@/components/LogoutDialog.vue";
import { content } from "@/content";
import { useSessionStore } from "@/stores/session";
import { useSyncStore } from "@/stores/sync";

// 统一退出流程（§8.3）：同步后退出 / 导出后退出 / 丢弃并退出，随后清理本机内容。
export async function performLogout(choice: LogoutChoice, projectId?: string): Promise<void> {
  const session = useSessionStore();
  const sync = useSyncStore();
  if (choice === "sync" && projectId) {
    await sync.syncNowManual(projectId).catch(() => undefined);
  }
  if (choice === "export" && projectId) {
    const blob = await exportBackup(content, projectId, session.deviceId ?? "web");
    downloadBlob(blob, `tasktips-backup-${projectId}.zip`);
  }
  const email = session.account?.email;
  await session.logout();
  if (email) await content.clearUserData(email).catch(() => undefined);
}
