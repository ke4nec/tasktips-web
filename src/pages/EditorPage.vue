<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";

import AppDialog from "@/components/AppDialog.vue";
import AppIcon from "@/components/AppIcon.vue";
import EmptyState from "@/components/EmptyState.vue";
import IconButton from "@/components/IconButton.vue";
import TodoRow from "@/components/list/TodoRow.vue";
import { content } from "@/content";
import { deriveTitle } from "@/domain/title";
import { tryAcquireTaskLock } from "@/sync/locks";
import type { Todo, TodoView } from "@/domain/types";
import { altFromFileName, imagePath, storeImageBlob, validateImageFile } from "@/editor/images";
import MilkdownDoc from "@/editor/MilkdownDoc.vue";
import type { MilkdownCommand } from "@/editor/MilkdownInner.vue";
import { EditorSession, loadPrefs, savePrefs, type EditorMode } from "@/editor/session";
import SplitEditor from "@/editor/SplitEditor.vue";
import { ApiError } from "@/api/types";
import { useClassificationStore } from "@/stores/classification";
import { useSyncStore } from "@/stores/sync";
import { useTodoStore } from "@/stores/todos";
import { useUiStore } from "@/stores/ui";

const route = useRoute();
const router = useRouter();
const todos = useTodoStore();
const classification = useClassificationStore();
const sync = useSyncStore();
const ui = useUiStore();

// 任务编辑会话锁：被其他标签页持有时只读展示并提示（§9.3）。
const readonlyLock = ref(false);
let releaseLock: (() => void) | null = null;

function acquireTaskLock() {
  releaseLock?.();
  releaseLock = null;
  readonlyLock.value = false;
  if (isNew.value || createdId.value !== null || !todo.value) return;
  // 持有式锁不能 await（会等到释放）；后台获取，拒绝时转只读并重挂编辑器。
  void tryAcquireTaskLock(projectId.value, todo.value.id).then((held) => {
    if (held === null) {
      readonlyLock.value = true;
    } else {
      releaseLock = held;
    }
  });
}

const projectId = computed(() => route.params.projectId as string);
const todoId = computed(() => route.params.todoId as string);
const isNew = computed(() => todoId.value === "new");
const fromView = computed(() => (route.query.from as string | undefined) ?? "inbox");

const loading = ref(true);
const loadError = ref("");
const todo = ref<Todo | null>(null);
// 新建任务：离开时丢弃未输入内容的草稿（§4.1）；首存落库后替换路由。
const createdId = ref<string | null>(null);

const prefs = ref(loadPrefs());
const mode = ref<EditorMode>(prefs.value.mode);
const ratio = ref(prefs.value.ratio);
const syncScroll = ref(prefs.value.syncScroll);
const focusMode = ref(false);

const session = shallowRef<EditorSession | null>(null);
const instantRef = ref<InstanceType<typeof MilkdownDoc> | null>(null);
const splitRef = ref<InstanceType<typeof SplitEditor> | null>(null);
const previewText = ref("");
let previewTimer: ReturnType<typeof setTimeout> | undefined;

const metaDialog = ref<null | "date" | "priority" | "category" | "tags">(null);
const metaDate = ref("");
const metaPriority = ref(0);
const metaCategory = ref("");
const metaTags = ref("");
const linkDialog = ref(false);
const linkText = ref("");
const linkUrl = ref("");
const fileInput = ref<HTMLInputElement | null>(null);
const showSaveError = computed(() => session.value?.saveState.value === "error");

const title = computed(
  () => deriveTitle(session.value?.text.value ?? todo.value?.body ?? "") || "未命名 Todo",
);
const saveLabel = computed(() => {
  switch (session.value?.saveState.value) {
    case "saving":
      return "正在保存…";
    case "error":
      return "未保存 · 请重试";
    case "dirty":
      return "有未保存的修改";
    default:
      return "已保存到本机";
  }
});
const wordCount = computed(() => `${[...(session.value?.text.value ?? "")].length} 字符`);

function persistPrefs() {
  prefs.value = { mode: mode.value, ratio: ratio.value, syncScroll: syncScroll.value };
  savePrefs(prefs.value);
}

async function persistTodo(text: string): Promise<void> {
  if (isNew.value && createdId.value === null) {
    if (!text.trim()) return; // 空草稿不落库，离开时丢弃
    const created = await content.createTodo(projectId.value, {
      body: text,
      dueDate: route.query.dueDate as string | undefined,
      categoryId: (route.query.categoryId as string | undefined) ?? undefined,
      tags: route.query.tag ? [route.query.tag as string] : [],
    });
    createdId.value = created.id;
    todo.value = created;
    await router.replace({
      name: "todo-detail",
      params: { projectId: projectId.value, todoId: created.id },
      query: route.query,
    });
    await todos.reload();
    return;
  }
  const id = createdId.value ?? todoId.value;
  await content.updateTodo(projectId.value, id, { body: text });
  await todos.reload();
  sync.notifyDirty(projectId.value);
}

function schedulePreview() {
  // 预览随输入更新（默认 100ms 合并），过期计算结果不覆盖新内容（§5.1）。
  clearTimeout(previewTimer);
  const seq = session.value?.editSeq.value ?? -1;
  previewTimer = setTimeout(() => {
    if (session.value && session.value.editSeq.value === seq) {
      previewText.value = session.value.text.value;
      splitRef.value?.previewRef?.setText(previewText.value);
    }
  }, 100);
}

async function loadTodo() {
  loading.value = true;
  loadError.value = "";
  try {
    const results = await Promise.allSettled([
      todos.load(projectId.value),
      classification.load(projectId.value),
      // 预取项目图片二进制到内存注册，编辑器以 Blob URL 展示（§5.3）。
      content.listImages(projectId.value).catch(() => []),
    ]);
    if (import.meta.env.DEV) {
      console.log("[editor-debug] loads settled", results.map((result) => result.status).join(","));
    }
    for (const result of results) {
      if (result.status === "rejected") throw result.reason;
    }
    if (!isNew.value) {
      const found = todos.todos.find((item) => item.id === todoId.value);
      if (!found) throw new ApiError("NOT_FOUND", "任务不存在。", 404);
      todo.value = found;
    } else {
      todo.value = null;
    }
    const previous = session.value;
    const created = new EditorSession(todo.value?.body ?? "", (text) => persistTodo(text));
    // 新建首存：同一编辑会话的历史延续到新实例（§5.2）。
    if (previous && createdId.value !== null && todo.value?.id === createdId.value) {
      created.adoptHistory(previous);
    }
    session.value = created;
    previewText.value = created.text.value;
    // 同一会话内 existing→existing 导航复用组件，需把新正文推给常驻适配器。
    instantRef.value?.setText(previewText.value);
    splitRef.value?.sourceRef?.setText(previewText.value);
    splitRef.value?.previewRef?.setText(previewText.value);
    acquireTaskLock();
  } catch (error) {
    loadError.value = error instanceof ApiError ? error.message : "任务加载失败。";
  } finally {
    loading.value = false;
  }
}

onMounted(loadTodo);
watch(todoId, () => void loadTodo());

function onAdapterChange(text: string) {
  session.value?.setText(text);
  schedulePreview();
}

function onUndo() {
  const ok = session.value?.undo() ?? false;
  if (ok) {
    pushToAdapters();
    schedulePreview();
  } else {
    ui.notify("没有可以撤销的修改");
  }
}

function onRedo() {
  if (session.value?.redo()) {
    pushToAdapters();
    schedulePreview();
  } else {
    ui.notify("没有可以重做的修改");
  }
}

// 程序化回放：写入当前活动适配器，不再次入栈（§5.2）。
function pushToAdapters() {
  const text = session.value?.text.value ?? "";
  instantRef.value?.setText(text);
  splitRef.value?.sourceRef?.setText(text);
  previewText.value = text;
}

async function switchMode(next: EditorMode) {
  if (next === mode.value || !session.value) return;
  // 切换先提交当前事务，再更新另一模式显示（§5.2）。
  const applied = session.value.requestMode(next);
  if (applied === null) {
    ui.notify("输入法组合中，完成后自动切换");
    return;
  }
  // 记录当前模式滚动位置，返回时恢复各自选区与滚动（§5.2）。
  if (mode.value === "instant") {
    session.value.modeState.instant.scrollRatio = instantRef.value?.editorScrollRatio() ?? 0;
  } else {
    session.value.modeState.split.scrollRatio = splitRef.value?.sourceRef?.editorScrollRatio() ?? 0;
  }
  mode.value = next;
  persistPrefs();
  await nextTick();
  const text = session.value.text.value;
  if (next === "instant") {
    instantRef.value?.setText(text);
    instantRef.value?.setEditorScrollRatio(session.value.modeState.instant.scrollRatio);
  } else {
    // CodeMirror 在隐藏容器中初始化后需重新度量。
    splitRef.value?.sourceRef?.refresh();
    splitRef.value?.sourceRef?.setText(text);
    splitRef.value?.sourceRef?.setEditorScrollRatio(session.value.modeState.split.scrollRatio);
    splitRef.value?.previewRef?.setText(previewText.value);
  }
}

function onComposing(value: boolean) {
  if (!session.value) return;
  if (value) {
    session.value.setComposing(true);
  } else {
    const queued = session.value.finishComposing();
    if (queued) switchMode(queued);
  }
}

function onRatio(value: number) {
  ratio.value = value;
  persistPrefs();
}

function onSyncScrollToggle() {
  syncScroll.value = !syncScroll.value;
  persistPrefs();
}

function runInstantCommand(command: MilkdownCommand) {
  instantRef.value?.runCommand(command);
}

function insertSourceSnippet(before: string, after = "") {
  const source = splitRef.value?.sourceRef;
  if (!source) return;
  const { from, to } = source.selectionOffsets();
  const current = source.currentText();
  const selected = current.slice(from, to) || "内容";
  const next = current.slice(0, from) + before + selected + after + current.slice(to);
  session.value?.setText(next);
  // 源码为输入源时需同步回显，否则下一次输入以旧文本覆盖片段（§5.2）。
  source.setText(next);
  schedulePreview();
}

function onFormat(kind: string) {
  if (mode.value === "split") {
    const wrappers: Record<string, [string, string]> = {
      bold: ["**", "**"],
      italic: ["*", "*"],
      strike: ["~~", "~~"],
      heading: ["## ", ""],
      list: ["- ", ""],
      task: ["- [ ] ", ""],
      quote: ["> ", ""],
      code: ["`", "`"],
    };
    const pair = wrappers[kind];
    if (pair) insertSourceSnippet(pair[0], pair[1]);
    return;
  }
  if (kind === "bold" || kind === "italic" || kind === "strike") {
    runInstantCommand(kind === "strike" ? "strikethrough" : kind);
  } else if (kind === "list" || kind === "task") {
    runInstantCommand(kind === "list" ? "bulletList" : "orderedList");
    if (kind === "task") ui.notify("在源码模式可编辑任务清单勾选");
  } else {
    const snippets: Record<string, string> = {
      heading: "## 内容",
      quote: "> 内容",
      code: "`内容`",
    };
    const snippet = snippets[kind];
    if (snippet) instantRef.value?.insertMarkdown(`\n${snippet}\n`);
  }
}

async function uploadFiles(files: File[]): Promise<{ src: string; alt: string }[]> {
  const results: { src: string; alt: string }[] = [];
  for (const file of files) {
    try {
      const { ext } = await validateImageFile(file);
      const path = imagePath(ext);
      // 内存注册即时展示，Dexie 持久二进制（P5）；失败回退纯内存。
      try {
        await content.putImage(projectId.value, path, file);
      } catch {
        storeImageBlob(path, file);
      }
      results.push({ src: path, alt: altFromFileName(file.name) });
    } catch (error) {
      ui.notify(error instanceof Error ? error.message : "图片导入失败");
    }
  }
  return results;
}

function onPickImage() {
  fileInput.value?.click();
}

async function onImageFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = input.files ? Array.from(input.files) : [];
  input.value = "";
  if (files.length === 0) return;
  const uploaded = await uploadFiles(files);
  for (const item of uploaded) {
    if (mode.value === "split") {
      const source = splitRef.value?.sourceRef;
      if (source) {
        const { from } = source.selectionOffsets();
        const current = source.currentText();
        const snippet = `![${item.alt}](${item.src})`;
        const next = `${current.slice(0, from)}${snippet}${current.slice(from)}`;
        session.value?.setText(next);
        source.setText(next);
        schedulePreview();
      }
    } else {
      instantRef.value?.insertImageNode(item.src, item.alt);
    }
  }
}

function openMeta(kind: NonNullable<typeof metaDialog.value>) {
  const current = todo.value;
  metaDate.value = current?.dueDate ?? "";
  metaPriority.value = current?.priority ?? 0;
  metaCategory.value = current?.categoryId ?? "";
  metaTags.value = current?.tags.join(", ") ?? "";
  metaDialog.value = kind;
}

async function onMetaConfirm() {
  if (!todo.value || isNew.value) {
    metaDialog.value = null;
    return;
  }
  try {
    if (metaDialog.value === "date") {
      await content.updateTodo(projectId.value, todo.value.id, {
        dueDate: metaDate.value ? metaDate.value : null,
      });
    } else if (metaDialog.value === "priority") {
      await content.updateTodo(projectId.value, todo.value.id, {
        priority: metaPriority.value as 0 | 1 | 2 | 3,
      });
    } else if (metaDialog.value === "category") {
      await content.updateTodo(projectId.value, todo.value.id, {
        categoryId: metaCategory.value ? metaCategory.value : null,
      });
    } else if (metaDialog.value === "tags") {
      await content.updateTodo(projectId.value, todo.value.id, {
        tags: metaTags.value
          .split(/[,，]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
    }
    await todos.reload();
    const found = todos.todos.find((item) => item.id === todo.value?.id);
    if (found) todo.value = found;
  } catch (error) {
    ui.notify(error instanceof ApiError ? error.message : "保存失败");
  } finally {
    metaDialog.value = null;
  }
}

function onInsertLink() {
  if (!linkText.value.trim() || !linkUrl.value.trim()) {
    ui.notify("请填写链接文字与地址");
    return;
  }
  let url = linkUrl.value.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  if (mode.value === "split") {
    insertSourceSnippet(`[${linkText.value.trim()}](${url})`);
  } else {
    instantRef.value?.insertMarkdown(`[${linkText.value.trim()}](${url})`);
  }
  linkDialog.value = false;
  linkText.value = "";
  linkUrl.value = "";
}

async function toggleComplete() {
  const id = createdId.value ?? todo.value?.id;
  if (!id) return;
  await todos.toggleCompleted(id);
  const found = todos.todos.find((item) => item.id === id);
  if (found) todo.value = found;
}

async function retrySave() {
  await session.value?.flushPersist();
}

function goBack() {
  router.push({
    name: "project-view",
    params: { projectId: projectId.value, view: fromView.value },
  });
}

// 站内导航不得丢弃未持久化内容（§5.3）；空草稿直接丢弃。
onBeforeRouteLeave(async () => {
  if (!session.value) return true;
  if (isNew.value && createdId.value === null && !session.value.text.value.trim()) return true;
  await session.value.flushPersist();
  return session.value.saveState.value !== "error";
});

function onVisibilityHidden() {
  // 离开/隐藏页面尽力刷新，不依赖回调保证正确性（§5.3）。
  if (session.value && (isNew.value ? session.value.text.value.trim() : true)) {
    void session.value.flushPersist();
  }
}

function onVisibilityChange() {
  if (document.visibilityState === "hidden") onVisibilityHidden();
}

function onFlushEditors() {
  // 版本更新前的保存刷新与页面卸载尽力刷新（正确性不依赖回调 §5.3）。
  if (session.value) void session.value.flushPersist();
}

onMounted(() => {
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("tasktips:flush-editors", onFlushEditors);
  window.addEventListener("beforeunload", onFlushEditors);
});

onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("tasktips:flush-editors", onFlushEditors);
  window.removeEventListener("beforeunload", onFlushEditors);
  clearTimeout(previewTimer);
  releaseLock?.();
  releaseLock = null;
});

const contextTodos = computed(() => todos.results(fromView.value as TodoView));

if (import.meta.env.DEV) console.log("[editor-debug] EditorPage setup", todoId.value);
</script>

<template>
  <div class="editor-layout" :class="{ 'focus-mode': focusMode }">
    <div class="editor-task-list" aria-label="当前视图任务">
      <TodoRow
        v-for="item in contextTodos.slice(0, 30)"
        :key="item.id"
        :todo="item"
        :project-id="projectId"
      />
    </div>

    <div class="editor-area">
      <div v-if="loading" class="editor-content" aria-label="正在加载任务">
        <div class="skeleton" style="width: 60%"></div>
        <div class="skeleton" style="width: 90%"></div>
      </div>
      <EmptyState
        v-else-if="loadError"
        icon="warning"
        title="任务加载失败"
        :description="loadError"
        action-label="返回列表"
        @action="goBack"
      />
      <template v-else>
        <div class="editor-toolbar">
          <IconButton icon="back" label="返回列表" class="mobile-nav" @click="goBack" />
          <div class="segmented" role="group" aria-label="编辑模式">
            <button type="button" :aria-pressed="mode === 'instant'" @click="switchMode('instant')">
              即时
            </button>
            <button type="button" :aria-pressed="mode === 'split'" @click="switchMode('split')">
              分栏
            </button>
          </div>
          <span
            class="save-state"
            :class="{ error: session?.saveState.value === 'error' }"
            role="status"
            >{{ saveLabel }}</span
          >
          <span class="spacer"></span>
          <IconButton
            icon="undo"
            label="撤销"
            :disabled="!session?.canUndo.value || readonlyLock"
            @click="onUndo"
          />
          <IconButton
            icon="redo"
            label="重做"
            :disabled="!session?.canRedo.value || readonlyLock"
            @click="onRedo"
          />
          <IconButton
            icon="focus"
            label="专注编辑"
            :aria-pressed="focusMode"
            @click="focusMode = !focusMode"
          />
        </div>

        <div v-if="readonlyLock" class="notice warning" style="margin: 12px 34px 0">
          这条任务正在另一个标签页中编辑。当前页面为只读。
        </div>

        <div class="editor-titlebar">
          <h1>{{ title }}</h1>
          <button
            type="button"
            class="btn"
            :class="todo?.status === 'completed' ? 'green' : ''"
            :aria-pressed="todo?.status === 'completed'"
            :disabled="!todo || readonlyLock"
            @click="toggleComplete"
          >
            {{ todo?.status === "completed" ? "已完成 · 重新打开" : "标记完成" }}
          </button>
        </div>

        <div class="editor-meta">
          <button
            type="button"
            class="meta-chip"
            :disabled="readonlyLock"
            @click="openMeta('date')"
          >
            <AppIcon name="calendar" />{{ todo?.dueDate ?? "截止日期" }}
          </button>
          <button
            type="button"
            class="meta-chip"
            :disabled="readonlyLock"
            @click="openMeta('priority')"
          >
            <AppIcon name="flag" />{{
              ["无优先级", "低优先级", "中优先级", "高优先级"][todo?.priority ?? 0]
            }}
          </button>
          <button
            type="button"
            class="meta-chip"
            :disabled="readonlyLock"
            @click="openMeta('category')"
          >
            <AppIcon name="folder" />
            {{
              classification.categories.find((item) => item.id === todo?.categoryId)?.name ??
              "未分类"
            }}
          </button>
          <button
            type="button"
            class="meta-chip"
            :disabled="readonlyLock"
            @click="openMeta('tags')"
          >
            <AppIcon name="tag" />{{ todo?.tags.join("、") || "添加标签" }}
          </button>
        </div>

        <div class="format-toolbar" role="toolbar" aria-label="格式">
          <button
            type="button"
            :disabled="readonlyLock"
            aria-label="加粗"
            @click="onFormat('bold')"
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            :disabled="readonlyLock"
            aria-label="斜体"
            @click="onFormat('italic')"
          >
            <em>I</em>
          </button>
          <button
            type="button"
            :disabled="readonlyLock"
            aria-label="删除线"
            @click="onFormat('strike')"
          >
            <s>S</s>
          </button>
          <span class="separator"></span>
          <button
            type="button"
            :disabled="readonlyLock"
            aria-label="标题"
            @click="onFormat('heading')"
          >
            H
          </button>
          <button
            type="button"
            :disabled="readonlyLock"
            aria-label="列表"
            @click="onFormat('list')"
          >
            <AppIcon name="list" small />
          </button>
          <button
            type="button"
            :disabled="readonlyLock"
            aria-label="任务清单"
            @click="onFormat('task')"
          >
            <AppIcon name="circle-check" small />
          </button>
          <button
            type="button"
            :disabled="readonlyLock"
            aria-label="引用"
            @click="onFormat('quote')"
          >
            “
          </button>
          <button
            type="button"
            :disabled="readonlyLock"
            aria-label="代码"
            @click="onFormat('code')"
          >
            ‹›
          </button>
          <span class="separator"></span>
          <button
            type="button"
            :disabled="readonlyLock"
            aria-label="插入链接"
            @click="linkDialog = true"
          >
            <AppIcon name="link" small />
          </button>
          <button type="button" :disabled="readonlyLock" aria-label="导入图片" @click="onPickImage">
            <AppIcon name="image" small />
          </button>
          <input
            ref="fileInput"
            type="file"
            hidden
            accept="image/png,image/jpeg,image/gif,image/webp,image/bmp"
            @change="onImageFileChange"
          />
        </div>

        <div v-if="showSaveError" class="notice danger">
          本地保存失败，草稿已保留。<button type="button" class="btn" @click="retrySave">
            重试
          </button>
        </div>

        <div v-show="mode === 'instant'" class="editor-content">
          <MilkdownDoc
            v-if="session"
            :key="`instant-${readonlyLock}`"
            ref="instantRef"
            :initial="session.text.value"
            :readonly="readonlyLock"
            :upload-files="uploadFiles"
            @change="onAdapterChange"
            @undo="onUndo"
            @redo="onRedo"
            @composing="onComposing"
          />
        </div>

        <div v-show="mode === 'split'" class="split-host">
          <SplitEditor
            v-if="session"
            :key="`split-${readonlyLock}`"
            ref="splitRef"
            :readonly="readonlyLock"
            :source-text="session.text.value"
            :preview-text="previewText"
            :ratio="ratio"
            :sync-scroll="syncScroll"
            :upload-files="uploadFiles"
            @change="onAdapterChange"
            @ratio="onRatio"
            @undo="onUndo"
            @redo="onRedo"
            @composing="onComposing"
          />
          <div class="split-options">
            <button type="button" :aria-pressed="syncScroll" @click="onSyncScrollToggle">
              同步滚动 {{ syncScroll ? "✓" : "−" }}
            </button>
          </div>
        </div>

        <div class="editor-footer">
          <span>{{ wordCount }}</span>
          <span>切换模式不产生额外 revision</span>
        </div>
      </template>
    </div>

    <AppDialog
      :open="metaDialog !== null"
      :title="
        metaDialog === 'date'
          ? '截止日期'
          : metaDialog === 'priority'
            ? '优先级'
            : metaDialog === 'category'
              ? '所属目录'
              : '任务标签'
      "
      confirm-text="保存"
      @update:open="metaDialog = $event ? metaDialog : null"
      @confirm="onMetaConfirm"
    >
      <div v-if="metaDialog === 'date'" class="field">
        <label for="meta-date">截止日期</label>
        <input id="meta-date" v-model="metaDate" class="input" type="date" />
      </div>
      <div v-if="metaDialog === 'priority'" class="field">
        <label for="meta-priority">优先级</label>
        <select id="meta-priority" v-model="metaPriority">
          <option :value="0">无优先级</option>
          <option :value="1">低优先级</option>
          <option :value="2">中优先级</option>
          <option :value="3">高优先级</option>
        </select>
      </div>
      <div v-if="metaDialog === 'category'" class="field">
        <label for="meta-category">所属目录</label>
        <select id="meta-category" v-model="metaCategory">
          <option value="">未分类</option>
          <option
            v-for="category in classification.categories.filter((item) => !item.deletedAt)"
            :key="category.id"
            :value="category.id"
          >
            {{ category.name }}
          </option>
        </select>
      </div>
      <div v-if="metaDialog === 'tags'" class="field">
        <label for="meta-tags">任务标签</label>
        <input
          id="meta-tags"
          v-model="metaTags"
          class="input"
          type="text"
          placeholder="多个标签以逗号分隔"
        />
      </div>
    </AppDialog>

    <AppDialog
      :open="linkDialog"
      title="插入链接"
      confirm-text="插入"
      @update:open="linkDialog = $event"
      @confirm="onInsertLink"
    >
      <div class="field">
        <label for="link-text">链接文字</label>
        <input id="link-text" v-model="linkText" type="text" />
      </div>
      <div class="field">
        <label for="link-url">链接地址</label>
        <input id="link-url" v-model="linkUrl" type="url" placeholder="https://" />
      </div>
    </AppDialog>
  </div>
</template>
