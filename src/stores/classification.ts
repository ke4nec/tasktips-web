import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { content } from "@/content";
import type { TrashSnapshot } from "@/content/port";
import { buildCategoryTree } from "@/domain/classification";
import type { Category, CategoryNode, Tag, TagGroup } from "@/domain/types";
import { groupTags } from "@/domain/classification";
import { useTodoStore } from "@/stores/todos";
import { useUiStore } from "@/stores/ui";

// 分类 store：目录树、标签与分组、回收站（设计文档 §4.2）。
export const useClassificationStore = defineStore("classification", () => {
  const projectId = ref("");
  // TrashPage 直接读取 projectId 判断是否已加载（避免依赖页面加载顺序）。
  const categories = ref<Category[]>([]);
  const tags = ref<Tag[]>([]);
  const trash = ref<TrashSnapshot | null>(null);

  const tree = computed<CategoryNode[]>(() => {
    const todos = useTodoStore();
    return buildCategoryTree(
      categories.value,
      todos.todos.filter((todo) => !todo.deletedAt).map((todo) => todo.categoryId),
    );
  });

  const tagGroups = computed<TagGroup[]>(() => groupTags(tags.value));

  async function load(id: string) {
    projectId.value = id;
    categories.value = await content.listCategories(id);
    tags.value = await content.listTags(id);
  }

  async function reloadTrash() {
    if (!projectId.value) return;
    trash.value = await content.listTrash(projectId.value);
  }

  function notify(message: string) {
    useUiStore().notify(message);
  }

  async function createCategory(name: string, parentId: string | null, color?: string) {
    const category = await content.createCategory(projectId.value, { name, parentId, color });
    categories.value = await content.listCategories(projectId.value);
    notify(`已创建目录“${category.name}”`);
    return category;
  }

  async function renameCategory(id: string, name: string, color?: string) {
    const category = await content.renameCategory(projectId.value, id, { name, color });
    categories.value = await content.listCategories(projectId.value);
    notify("目录已重命名");
    return category;
  }

  async function moveCategory(id: string, parentId: string | null) {
    const category = await content.moveCategory(projectId.value, id, parentId);
    categories.value = await content.listCategories(projectId.value);
    notify("目录位置已更新");
    return category;
  }

  async function deleteCategory(id: string) {
    const impact = await content.deleteCategory(projectId.value, id);
    categories.value = await content.listCategories(projectId.value);
    await useTodoStore().reload();
    notify(`已移入回收站（${impact.categories} 个目录、${impact.todos} 条任务）`);
    return impact;
  }

  async function restoreCategory(id: string) {
    const result = await content.restoreCategory(projectId.value, id);
    categories.value = await content.listCategories(projectId.value);
    await reloadTrash();
    await useTodoStore().reload();
    if (result.conflicts.length > 0) {
      notify(`同名冲突已保留：${result.conflicts.join("、")}`);
    } else {
      notify("已恢复到原位置");
    }
    return result;
  }

  async function purgeCategory(id: string) {
    await content.purgeCategory(projectId.value, id);
    categories.value = await content.listCategories(projectId.value);
    await reloadTrash();
    await useTodoStore().reload();
    notify("已彻底删除");
  }

  async function createTag(name: string, group = "", color?: string) {
    const tag = await content.createTag(projectId.value, { name, group, color });
    tags.value = await content.listTags(projectId.value);
    notify(`已创建标签“${tag.name}”`);
    return tag;
  }

  async function renameTag(id: string, name: string) {
    const tag = await content.renameTag(projectId.value, id, name);
    tags.value = await content.listTags(projectId.value);
    await useTodoStore().reload();
    notify("标签已重命名，相关任务已同步更新");
    return tag;
  }

  async function setTagGroup(id: string, group: string) {
    const tag = await content.setTagGroup(projectId.value, id, group);
    tags.value = await content.listTags(projectId.value);
    notify("标签分组已更新");
    return tag;
  }

  async function deleteTagGroup(group: string) {
    await content.deleteTagGroup(projectId.value, group);
    tags.value = await content.listTags(projectId.value);
    notify(`分组已删除，组内标签移入“其他”`);
  }

  async function deleteTag(id: string) {
    await content.deleteTag(projectId.value, id);
    tags.value = await content.listTags(projectId.value);
    notify("标签已移入回收站，任务引用保留");
  }

  async function restoreTag(id: string) {
    await content.restoreTag(projectId.value, id);
    tags.value = await content.listTags(projectId.value);
    await reloadTrash();
    notify("标签已恢复");
  }

  async function purgeTag(id: string) {
    await content.purgeTag(projectId.value, id);
    tags.value = await content.listTags(projectId.value);
    await reloadTrash();
    await useTodoStore().reload();
    notify("标签已彻底删除，任务引用已移除");
  }

  async function restoreTodo(id: string) {
    await content.restoreTodo(projectId.value, id);
    await reloadTrash();
    await useTodoStore().reload();
    notify("已恢复到原位置");
  }

  async function purgeTodo(id: string) {
    await content.purgeTodo(projectId.value, id);
    await reloadTrash();
    await useTodoStore().reload();
    notify("已彻底删除");
  }

  async function emptyTrash() {
    await content.emptyTrash(projectId.value);
    await reloadTrash();
    await useTodoStore().reload();
    notify("回收站已清空");
  }

  return {
    projectId,
    categories,
    tags,
    trash,
    tree,
    tagGroups,
    load,
    reloadTrash,
    createCategory,
    renameCategory,
    moveCategory,
    deleteCategory,
    restoreCategory,
    purgeCategory,
    createTag,
    renameTag,
    setTagGroup,
    deleteTagGroup,
    deleteTag,
    restoreTag,
    purgeTag,
    restoreTodo,
    purgeTodo,
    emptyTrash,
  };
});
