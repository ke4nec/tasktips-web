<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import AppDialog from "@/components/AppDialog.vue";
import AppIcon from "@/components/AppIcon.vue";
import ColorSwatchPicker from "@/components/list/ColorSwatchPicker.vue";
import EmptyState from "@/components/EmptyState.vue";
import IconButton from "@/components/IconButton.vue";
import { categoryNameIssue, displayGroup, tagNameIssue } from "@/domain/classification";
import { ApiError } from "@/api/types";
import { useClassificationStore } from "@/stores/classification";
import { useTodoStore } from "@/stores/todos";

const route = useRoute();
const router = useRouter();
const classification = useClassificationStore();
const todos = useTodoStore();

const projectId = computed(() => route.params.projectId as string);
const tab = computed(() => (route.query.tab === "tags" ? "tags" : "folders"));
const loading = ref(true);

async function load() {
  loading.value = true;
  try {
    await Promise.all([classification.load(projectId.value), todos.load(projectId.value)]);
  } finally {
    loading.value = false;
  }
}
watch(projectId, () => void load(), { immediate: true });

// ---- 目录弹层 ----
type FolderMode = "create" | "rename" | "move" | "delete";
const folderOpen = ref(false);
const folderMode = ref<FolderMode>("create");
const folderId = ref("");
const folderName = ref("");
const folderParent = ref<string | null>(null);
const folderColor = ref("#8a8a8a");
const folderError = ref("");
const folderImpact = ref("");

function openFolder(mode: FolderMode, id = "", current = "") {
  folderMode.value = mode;
  folderId.value = id;
  folderName.value = current;
  folderParent.value = null;
  folderColor.value = classification.categories.find((item) => item.id === id)?.color ?? "#8a8a8a";
  folderError.value = "";
  if (mode === "delete") {
    const node = classification.tree
      .flatMap((node) => [node, ...node.children.flatMap((child) => [child, ...child.children])])
      .find((node) => node.id === id);
    const subtrees = node
      ? 1 + node.children.length + node.children.flatMap((c) => c.children).length
      : 1;
    folderImpact.value = `整棵有效子树（${subtrees} 个目录）及其中未删除任务将使用同一删除时间标记。`;
  }
  folderOpen.value = true;
}

async function onFolderConfirm() {
  folderError.value = "";
  try {
    if (folderMode.value === "create") {
      const issue = categoryNameIssue(folderName.value);
      if (issue) {
        folderError.value = issue;
        return;
      }
      await classification.createCategory(folderName.value, folderParent.value, folderColor.value);
    } else if (folderMode.value === "rename") {
      await classification.renameCategory(folderId.value, folderName.value, folderColor.value);
    } else if (folderMode.value === "move") {
      await classification.moveCategory(folderId.value, folderParent.value);
    } else {
      await classification.deleteCategory(folderId.value);
    }
    folderOpen.value = false;
  } catch (err) {
    folderError.value = err instanceof ApiError ? err.message : "保存失败，请重试。";
  }
}

const folderTitle = computed(
  () =>
    ({ create: "新建目录", rename: "重命名目录", move: "移动目录", delete: "移入回收站" })[
      folderMode.value
    ],
);

// ---- 标签弹层 ----
type TagMode = "create" | "rename" | "group" | "delete" | "delete-group";
const tagOpen = ref(false);
const tagMode = ref<TagMode>("create");
const tagId = ref("");
const tagName = ref("");
const tagGroup = ref("");
const tagColor = ref("#8a8a8a");
const tagError = ref("");
const pendingGroup = ref("");

function openTag(mode: TagMode, id = "", current = "", group = "") {
  tagMode.value = mode;
  tagId.value = id;
  tagName.value = current;
  tagGroup.value = group;
  tagError.value = "";
  pendingGroup.value = group;
  tagOpen.value = true;
}

async function onTagConfirm() {
  tagError.value = "";
  try {
    if (tagMode.value === "create") {
      const issue = tagNameIssue(tagName.value);
      if (issue) {
        tagError.value = issue;
        return;
      }
      await classification.createTag(tagName.value, tagGroup.value, tagColor.value);
    } else if (tagMode.value === "rename") {
      await classification.renameTag(tagId.value, tagName.value);
    } else if (tagMode.value === "group") {
      // 文本输入：可选已有分组，也可直接输入新分组名。
      await classification.setTagGroup(tagId.value, tagGroup.value);
    } else if (tagMode.value === "delete-group") {
      await classification.deleteTagGroup(pendingGroup.value);
    } else {
      await classification.deleteTag(tagId.value);
    }
    tagOpen.value = false;
  } catch (err) {
    tagError.value = err instanceof ApiError ? err.message : "保存失败，请重试。";
  }
}

const tagTitle = computed(
  () =>
    ({
      create: "新建标签",
      rename: "重命名标签",
      group: "设置标签分组",
      delete: "移入回收站",
      "delete-group": "删除分组",
    })[tagMode.value],
);

function tagUsage(name: string): number {
  const wanted = name.toLowerCase();
  return todos.todos.filter(
    (todo) => !todo.deletedAt && todo.tags.some((tag) => tag.toLowerCase() === wanted),
  ).length;
}

function goTab(next: "folders" | "tags") {
  router.push({
    name: "classification",
    params: { projectId: projectId.value },
    query: next === "tags" ? { tab: "tags" } : {},
  });
}
</script>

<template>
  <div class="content">
    <div class="page-heading">
      <div>
        <h1>{{ tab === "tags" ? "标签与分组" : "目录管理" }}</h1>
        <p>目录最多三级；标签全局唯一，重命名同步更新全部任务。</p>
      </div>
      <button
        v-if="tab === 'folders'"
        type="button"
        class="btn primary"
        @click="openFolder('create')"
      >
        新建目录
      </button>
      <button v-else type="button" class="btn primary" @click="openTag('create')">新建标签</button>
    </div>
    <div class="tabs" role="tablist" aria-label="分类视图">
      <button
        type="button"
        role="tab"
        :class="{ active: tab === 'folders' }"
        :aria-selected="tab === 'folders'"
        @click="goTab('folders')"
      >
        目录
      </button>
      <button
        type="button"
        role="tab"
        :class="{ active: tab === 'tags' }"
        :aria-selected="tab === 'tags'"
        @click="goTab('tags')"
      >
        标签与分组
      </button>
    </div>

    <div v-if="loading" aria-label="正在加载分类">
      <div class="skeleton" style="width: 60%"></div>
      <div class="skeleton" style="width: 80%"></div>
    </div>

    <template v-else-if="tab === 'folders'">
      <!-- 空态不放 CTA：标题栏“新建目录”已覆盖入口（设计稿同款）。 -->
      <EmptyState
        v-if="classification.tree.length === 0"
        icon="folder"
        title="还没有自定义目录"
        description="先创建一个目录，未归类的任务仍保留在“未分类”中。"
      />
      <div v-else class="panel">
        <template v-for="level1 in classification.tree" :key="level1.id">
          <div class="folder-row">
            <span class="folder-icon" :style="{ color: level1.color }"
              ><AppIcon name="folder" small
            /></span>
            <span class="grow">
              <strong>{{ level1.name }}</strong>
              <p>{{ level1.todoCount }} 条任务（含子目录）</p>
            </span>
            <IconButton
              icon="edit"
              :label="`重命名目录 ${level1.name}`"
              @click="openFolder('rename', level1.id, level1.name)"
            />
            <IconButton
              icon="more"
              :label="`移动目录 ${level1.name}`"
              @click="openFolder('move', level1.id, level1.name)"
            />
            <button type="button" class="btn text" @click="openFolder('delete', level1.id)">
              删除
            </button>
          </div>
          <template v-for="level2 in level1.children" :key="level2.id">
            <div class="folder-row indent">
              <span class="folder-icon" :style="{ color: level2.color }"
                ><AppIcon name="folder" small
              /></span>
              <span class="grow">
                <strong>{{ level2.name }}</strong>
                <p>{{ level2.todoCount }} 条任务（含子目录）</p>
              </span>
              <IconButton
                icon="edit"
                :label="`重命名目录 ${level2.name}`"
                @click="openFolder('rename', level2.id, level2.name)"
              />
              <IconButton
                icon="more"
                :label="`移动目录 ${level2.name}`"
                @click="openFolder('move', level2.id, level2.name)"
              />
              <button type="button" class="btn text" @click="openFolder('delete', level2.id)">
                删除
              </button>
            </div>
            <div v-for="level3 in level2.children" :key="level3.id" class="folder-row indent-2">
              <span class="folder-icon" :style="{ color: level3.color }"
                ><AppIcon name="folder" small
              /></span>
              <span class="grow">
                <strong>{{ level3.name }}</strong>
                <p>{{ level3.todoCount }} 条任务</p>
              </span>
              <IconButton
                icon="edit"
                :label="`重命名目录 ${level3.name}`"
                @click="openFolder('rename', level3.id, level3.name)"
              />
              <IconButton
                icon="more"
                :label="`移动目录 ${level3.name}`"
                @click="openFolder('move', level3.id, level3.name)"
              />
              <button type="button" class="btn text" @click="openFolder('delete', level3.id)">
                删除
              </button>
            </div>
          </template>
        </template>
      </div>
    </template>

    <template v-else>
      <EmptyState
        v-if="classification.tagGroups.length === 0"
        icon="tag"
        title="还没有标签"
        description="添加标签，把不同目录中相关的任务串起来。"
      />
      <section
        v-for="group in classification.tagGroups"
        :key="group.name"
        class="stack"
        style="margin-bottom: 24px"
      >
        <h2 class="section-title">
          <span>{{ group.name }} · {{ group.tags.length }}</span>
          <button
            v-if="group.name !== '其他'"
            type="button"
            class="btn text"
            @click="openTag('delete-group', '', '', group.name)"
          >
            删除分组
          </button>
        </h2>
        <div class="tag-grid">
          <div v-for="tag in group.tags" :key="tag.id" class="tag-card">
            <div class="between">
              <h3>
                <span class="dot" :style="{ color: tag.color }"></span>
                {{ tag.name }}
              </h3>
              <span class="flex">
                <IconButton
                  icon="edit"
                  :label="`重命名标签 ${tag.name}`"
                  @click="openTag('rename', tag.id, tag.name)"
                />
                <IconButton
                  icon="more"
                  :label="`标签操作 ${tag.name}`"
                  @click="openTag('group', tag.id, tag.name, displayGroup(tag.group))"
                />
              </span>
            </div>
            <p>{{ tagUsage(tag.name) }} 条任务使用 · 分组：{{ displayGroup(tag.group) }}</p>
            <button type="button" class="btn text" @click="openTag('delete', tag.id, tag.name)">
              移入回收站
            </button>
          </div>
        </div>
      </section>
    </template>

    <AppDialog
      :open="folderOpen"
      :title="folderTitle"
      :confirm-text="
        folderMode === 'delete' ? '移入回收站' : folderMode === 'move' ? '移动' : '保存'
      "
      :danger="folderMode === 'delete'"
      @update:open="folderOpen = $event"
      @confirm="onFolderConfirm"
    >
      <p v-if="folderMode === 'delete'">{{ folderImpact }}</p>
      <p v-if="folderMode === 'move'">不能移动到自身或子目录下，目录总深度不得超过三级。</p>
      <div v-if="folderMode !== 'delete'" class="field">
        <label for="folder-name">名称</label>
        <input
          id="folder-name"
          v-model="folderName"
          type="text"
          minlength="2"
          maxlength="50"
          required
        />
      </div>
      <div v-if="folderMode === 'create' || folderMode === 'move'" class="field">
        <label for="folder-parent">父目录</label>
        <select id="folder-parent" v-model="folderParent">
          <option :value="null">根目录</option>
          <option
            v-for="category in classification.categories.filter(
              (item) => !item.deletedAt && item.id !== folderId,
            )"
            :key="category.id"
            :value="category.id"
          >
            {{ category.name }}
          </option>
        </select>
      </div>
      <ColorSwatchPicker
        v-if="folderMode === 'create' || folderMode === 'rename'"
        v-model="folderColor"
      />
      <p v-if="folderError" class="field-error" role="alert">{{ folderError }}</p>
    </AppDialog>

    <AppDialog
      :open="tagOpen"
      :title="tagTitle"
      :confirm-text="tagMode === 'delete' || tagMode === 'delete-group' ? '确认删除' : '保存'"
      :danger="tagMode === 'delete' || tagMode === 'delete-group'"
      @update:open="tagOpen = $event"
      @confirm="onTagConfirm"
    >
      <p v-if="tagMode === 'delete'">软删除保留任务引用，彻底删除请前往回收站。</p>
      <p v-if="tagMode === 'delete-group'">
        删除分组“{{ pendingGroup }}”后，组内标签会移入“其他”。默认分组不能重命名或删除。
      </p>
      <div v-if="tagMode === 'create' || tagMode === 'rename'" class="field">
        <label for="tag-name">标签名称</label>
        <input id="tag-name" v-model="tagName" type="text" maxlength="20" required />
      </div>
      <div v-if="tagMode === 'create' || tagMode === 'group'" class="field">
        <label for="tag-group">分组（可直接输入新分组）</label>
        <input
          id="tag-group"
          v-model="tagGroup"
          type="text"
          list="tag-group-options"
          placeholder="其他"
        />
        <datalist id="tag-group-options">
          <option
            v-for="group in classification.tagGroups.map((item) => item.name)"
            :key="group"
            :value="group"
          />
        </datalist>
      </div>
      <ColorSwatchPicker v-if="tagMode === 'create'" v-model="tagColor" />
      <p v-if="tagError" class="field-error" role="alert">{{ tagError }}</p>
    </AppDialog>
  </div>
</template>
