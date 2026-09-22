const handlers = new Set<() => Promise<void>>();

export function registerEditorPersistence(handler: () => Promise<void>): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

/** 导出、退出、更新均等待真实保存结果；失败时保持当前工作区。 */
export async function flushEditors(): Promise<void> {
  await Promise.all([...handlers].map((handler) => handler()));
}
