<script setup lang="ts">
import { defaultKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps<{ text: string; readonly?: boolean }>();
const emit = defineEmits<{
  (e: "change", text: string): void;
  (e: "undo"): void;
  (e: "redo"): void;
  (e: "composing", value: boolean): void;
  (e: "scroll"): void;
}>();

const container = ref<HTMLElement | null>(null);
let view: EditorView | null = null;
let applyingExternal = false;

function currentText(): string {
  return view?.state.doc.toString() ?? props.text;
}

/** 外部写入（撤销回放/模式切换）：值相等守卫，不形成循环。 */
function setText(text: string) {
  if (!view || currentText() === text) return;
  applyingExternal = true;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
  });
  applyingExternal = false;
}

function insertAtCursor(snippet: string) {
  if (!view) return;
  const { from, to } = view.state.selection.main;
  view.dispatch({ changes: { from, to, insert: snippet } });
  view.focus();
}

function editorScrollRatio(): number {
  const el = view?.scrollDOM;
  if (!el || el.scrollHeight <= el.clientHeight) return 0;
  return el.scrollTop / (el.scrollHeight - el.clientHeight);
}

function setEditorScrollRatio(ratio: number) {
  const el = view?.scrollDOM;
  if (!el || el.scrollHeight <= el.clientHeight) return;
  el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
}

// ---- 块映射同步滚动（§5.2）：源码按空行分块，与预览顶层节点按序对应。 ----

// 返回每个块的起始文档位置（连续非空行合并为一块，近似 Markdown 顶层节点）。
function docBlocks(): number[] {
  if (!view) return [];
  const starts: number[] = [];
  const doc = view.state.doc;
  let atBlockStart = true;
  for (let pos = 1; pos <= doc.lines; pos += 1) {
    const line = doc.line(pos);
    if (line.text.trim().length > 0) {
      if (atBlockStart) {
        starts.push(line.from);
        atBlockStart = false;
      }
    } else {
      atBlockStart = true;
    }
  }
  return starts;
}

function topBlockProgress(): { index: number; progress: number } {
  const el = view?.scrollDOM;
  if (!view || !el) return { index: 0, progress: 0 };
  const starts = docBlocks();
  if (starts.length === 0) return { index: 0, progress: 0 };
  const visible = view.lineBlockAtHeight(el.scrollTop);
  let index = 0;
  for (let i = 0; i < starts.length; i += 1) {
    if (starts[i] <= visible.from) index = i;
    else break;
  }
  const block = view.lineBlockAt(starts[index]);
  const progress = Math.min(1, Math.max(0, (el.scrollTop - block.top) / Math.max(1, block.height)));
  return { index, progress };
}

function scrollToBlock(index: number, progress: number) {
  const el = view?.scrollDOM;
  if (!view || !el || el.scrollHeight <= el.clientHeight) return;
  const starts = docBlocks();
  if (starts.length === 0) return;
  const clamped = Math.min(starts.length - 1, Math.max(0, index));
  const block = view.lineBlockAt(starts[clamped]);
  el.scrollTop = block.top + progress * block.height;
}

function selectionOffsets(): { from: number; to: number } {
  const selection = view?.state.selection.main;
  return { from: selection?.from ?? 0, to: selection?.to ?? 0 };
}

function setSelectionOffsets(from: number, to: number) {
  if (!view) return;
  const length = view.state.doc.length;
  view.dispatch({
    selection: {
      anchor: Math.min(from, length),
      head: Math.min(to, length),
    },
  });
}

// 隐藏容器中初始化后度量失效时刷新（分栏由 v-show 控制显隐）。
function refresh() {
  view?.requestMeasure();
}

onMounted(() => {
  const undoRedo = keymap.of([
    {
      key: "Mod-z",
      run: () => {
        emit("undo");
        return true;
      },
    },
    {
      key: "Mod-Shift-z",
      run: () => {
        emit("redo");
        return true;
      },
    },
    {
      key: "Mod-y",
      run: () => {
        emit("redo");
        return true;
      },
    },
  ]);
  // 注意：不使用 CodeMirror history 扩展，撤销统一委托 EditorSession（§5.2）。
  const state = EditorState.create({
    doc: props.text,
    extensions: [
      undoRedo,
      keymap.of(
        defaultKeymap.filter(
          (binding) =>
            binding.key !== "Mod-z" && binding.key !== "Mod-Shift-z" && binding.key !== "Mod-y",
        ),
      ),
      markdown(),
      EditorState.readOnly.of(props.readonly ?? false),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !applyingExternal) {
          emit("change", update.state.doc.toString());
        }
      }),
      EditorView.domEventHandlers({
        compositionstart: () => emit("composing", true),
        compositionend: () => emit("composing", false),
      }),
    ],
  });
  view = new EditorView({ state, parent: container.value as HTMLElement });
  view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });
});

function onScroll() {
  emit("scroll");
}

onBeforeUnmount(() => {
  view?.scrollDOM.removeEventListener("scroll", onScroll);
  view?.destroy();
  view = null;
});

defineExpose({
  setText,
  insertAtCursor,
  currentText,
  editorScrollRatio,
  setEditorScrollRatio,
  topBlockProgress,
  scrollToBlock,
  selectionOffsets,
  setSelectionOffsets,
  refresh,
});
</script>

<template>
  <div ref="container" class="source-editor-host" />
</template>

<style>
.source-editor-host {
  height: 100%;
  overflow: hidden;
}

.source-editor-host .cm-editor {
  height: 100%;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  line-height: 2;
}

.source-editor-host .cm-scroller {
  padding: 23px 24px;
  font-family: "SFMono-Regular", Consolas, "Microsoft YaHei", monospace;
}

.source-editor-host .cm-focused {
  outline: none;
}

.source-editor-host .cm-cursor {
  border-left-color: var(--brand);
}

.source-editor-host .cm-selectionBackground,
.source-editor-host .cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground {
  background: var(--brand-soft);
}
</style>
