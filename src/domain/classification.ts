import {
  DEFAULT_TAG_GROUP,
  TRASH_RETENTION_DAYS,
  type Category,
  type CategoryNode,
  type Tag,
  type TagGroup,
} from "./types";

export const CATEGORY_NAME_MIN = 2;
export const CATEGORY_NAME_MAX = 50;
export const TAG_NAME_MAX = 20;
export const MAX_CATEGORY_DEPTH = 3;

const FORBIDDEN_NAME_CHARS = /[/\\:*?"<>|]/;

// 目录名：trim 后按 Unicode 码点计数 2–50，禁止 / \ : * ? " < > |（§4.2）。
export function categoryNameIssue(name: string): string {
  const trimmed = name.trim();
  const length = [...trimmed].length;
  if (length < CATEGORY_NAME_MIN) return "目录名称至少 2 个字符。";
  if (length > CATEGORY_NAME_MAX) return "目录名称最多 50 个字符。";
  if (FORBIDDEN_NAME_CHARS.test(trimmed)) return '目录名称不能包含 / \\ : * ? " < > |。';
  return "";
}

// 同级名称大小写不敏感唯一（已删除目录不参与）。
export function siblingNameTaken(
  categories: Category[],
  parentId: string | null,
  name: string,
  excludeId?: string,
): boolean {
  const wanted = name.trim().toLowerCase();
  return categories.some(
    (category) =>
      category.id !== excludeId &&
      !category.deletedAt &&
      category.parentId === parentId &&
      category.name.trim().toLowerCase() === wanted,
  );
}

// 以 id 为根的子树高度（自身为 1）。
export function subtreeHeight(categories: Category[], rootId: string): number {
  let height = 1;
  const children = categories.filter((item) => item.parentId === rootId && !item.deletedAt);
  for (const child of children) {
    height = Math.max(height, 1 + subtreeHeight(categories, child.id));
  }
  return height;
}

export function depthOf(categories: Category[], categoryId: string | null): number {
  let depth = 0;
  let current = categories.find((item) => item.id === categoryId);
  while (current) {
    depth += 1;
    current = categories.find((item) => item.id === current?.parentId);
  }
  return depth;
}

// 移动校验：不得移入自身或子孙（循环），目标父层级 + 整棵子树高度 ≤ 3（§4.2）。
export function moveCategoryIssue(
  categories: Category[],
  movingId: string,
  targetParentId: string | null,
): string {
  if (targetParentId === movingId) return "不能移动到自身。";
  let current: string | null = targetParentId;
  while (current) {
    if (current === movingId) return "不能移动到自身或子目录下。";
    current = categories.find((item) => item.id === current)?.parentId ?? null;
  }
  const targetDepth = depthOf(categories, targetParentId);
  if (targetDepth + subtreeHeight(categories, movingId) > MAX_CATEGORY_DEPTH) {
    return "移动后目录总深度不得超过三级。";
  }
  return "";
}

// 有效目录树（level 明确，children 仅 level < 3 时存在），附带含子孙的任务计数。
export function buildCategoryTree(
  categories: Category[],
  todoCategoryIds: (string | undefined)[],
): CategoryNode[] {
  const counts = new Map<string, number>();
  for (const categoryId of todoCategoryIds) {
    if (!categoryId) continue;
    let current: string | undefined = categoryId;
    while (current) {
      counts.set(current, (counts.get(current) ?? 0) + 1);
      current = categories.find((item) => item.id === current)?.parentId ?? undefined;
    }
  }
  const byParent = new Map<string | null, Category[]>();
  for (const category of categories) {
    if (category.deletedAt) continue;
    const list = byParent.get(category.parentId) ?? [];
    list.push(category);
    byParent.set(category.parentId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.orderIndex - b.orderIndex || a.name.localeCompare(b.name, "zh"));
  }
  const build = (parentId: string | null, level: 1 | 2 | 3): CategoryNode[] =>
    (byParent.get(parentId) ?? []).map((category) => ({
      ...category,
      level,
      todoCount: counts.get(category.id) ?? 0,
      children: level < MAX_CATEGORY_DEPTH ? build(category.id, (level + 1) as 1 | 2 | 3) : [],
    }));
  return build(null, 1);
}

// 标签名：1–20 字符、全局大小写不敏感唯一（§4.2）。
export function tagNameIssue(name: string): string {
  const length = [...name.trim()].length;
  if (length < 1) return "标签名称不能为空。";
  if (length > TAG_NAME_MAX) return "标签名称最多 20 个字符。";
  return "";
}

export function tagNameTaken(tags: Tag[], name: string, excludeId?: string): boolean {
  const wanted = name.trim().toLowerCase();
  return tags.some(
    (tag) => tag.id !== excludeId && !tag.deletedAt && tag.name.trim().toLowerCase() === wanted,
  );
}

// 标签分组：空组归“其他”；分组展示顺序：已知分组优先，其余按拼音/字母。
export function displayGroup(group: string): string {
  const trimmed = group.trim();
  return trimmed ? trimmed : DEFAULT_TAG_GROUP;
}

export function groupTags(tags: Tag[]): TagGroup[] {
  const groups = new Map<string, Tag[]>();
  for (const tag of tags) {
    if (tag.deletedAt) continue;
    const name = displayGroup(tag.group);
    const list = groups.get(name) ?? [];
    list.push(tag);
    groups.set(name, list);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, "zh"));
  }
  const known = ["优先级", "状态", "属性", DEFAULT_TAG_GROUP];
  return [...groups.entries()]
    .sort(([a], [b]) => {
      const orderA = known.indexOf(a);
      const orderB = known.indexOf(b);
      if (orderA !== -1 || orderB !== -1) {
        return (orderA === -1 ? known.length : orderA) - (orderB === -1 ? known.length : orderB);
      }
      return a.localeCompare(b, "zh");
    })
    .map(([name, list]) => ({ name, tags: list }));
}

// 回收站剩余天数：固定保留 30 天（§4.2）。
export function remainingDays(deletedAt: string, now: number = Date.now()): number {
  const elapsed = now - new Date(deletedAt).getTime();
  const remaining = TRASH_RETENTION_DAYS - Math.floor(elapsed / 86_400_000);
  return Math.max(0, remaining);
}

export function isTrashExpired(deletedAt: string, now: number = Date.now()): boolean {
  return remainingDays(deletedAt, now) <= 0;
}
