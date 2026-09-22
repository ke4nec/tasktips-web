<script setup lang="ts">
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  rootCtx,
} from "@milkdown/kit/core";
import {
  commonmark,
  imageSchema,
  toggleEmphasisCommand,
  toggleStrongCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
} from "@milkdown/kit/preset/commonmark";
import { gfm, toggleStrikethroughCommand } from "@milkdown/kit/preset/gfm";
import { upload, uploadConfig } from "@milkdown/kit/plugin/upload";
import type { Node as ProseNode, Schema } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import { $view, callCommand, getMarkdown, insert, replaceAll } from "@milkdown/kit/utils";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { Milkdown, useEditor, useInstance } from "@milkdown/vue";
import { onBeforeUnmount, onMounted, ref } from "vue";

import { imageObjectUrl, isExternalImageSrc, isLocalImageSrc } from "./images";

const props = withDefaults(
  defineProps<{
    initial: string;
    readonly?: boolean;
    autofocus?: boolean;
    uploadFiles?: (files: File[]) => Promise<{ src: string; alt: string }[]>;
  }>(),
  { readonly: false, autofocus: false, uploadFiles: undefined },
);

const emit = defineEmits<{
  (e: "change", markdown: string): void;
  (e: "undo"): void;
  (e: "redo"): void;
  (e: "composing", value: boolean): void;
  (e: "scroll"): void;
}>();

export type MilkdownCommand = "bold" | "italic" | "strikethrough" | "bulletList" | "orderedList";

// 本地图片直接展示（Blob URL），外部图片默认占位、不自动联网加载（§5.3）。
const imageNodeView = $view(imageSchema.node, () => (node) => {
  const dom = document.createElement("span");
  dom.className = "tt-image-slot";
  const render = (current: ProseNode) => {
    const src = typeof current.attrs.src === "string" ? current.attrs.src : "";
    const alt = typeof current.attrs.alt === "string" ? current.attrs.alt : "";
    dom.textContent = "";
    if (isLocalImageSrc(src)) {
      const url = imageObjectUrl(src);
      if (url) {
        const img = document.createElement("img");
        img.src = url;
        img.alt = alt;
        dom.append(img);
        return;
      }
    }
    if (isExternalImageSrc(src)) {
      // 外部图片不自动加载：仅显示占位。
      const name = document.createElement("span");
      name.className = "tt-image-slot__name";
      name.textContent = alt || "外部图片（未加载）";
      dom.append(name);
      return;
    }
    const name = document.createElement("span");
    name.className = "tt-image-slot__name";
    name.textContent = alt || src.split("/").pop() || "图片";
    dom.title = src;
    dom.append(name);
  };
  render(node);
  return {
    dom,
    update: (next: ProseNode) => {
      if (next.type.name !== "image") return false;
      render(next);
      return true;
    },
  };
});

const [loading, getInstance] = useInstance();

useEditor((container) =>
  Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, container);
      ctx.set(defaultValueCtx, props.initial);
      if (props.readonly) {
        ctx.set(editorViewOptionsCtx, { editable: () => false });
      }
    })
    .use(commonmark)
    .use(gfm)
    // 注意：不使用 milkdown history 插件，撤销/重做统一委托 EditorSession（§5.2）。
    .use(upload)
    .use(listener)
    .use(imageNodeView)
    .config((ctx) => {
      ctx.update(uploadConfig.key, (previous) => ({
        ...previous,
        uploader: (files, schema) => uploadImages(files, schema),
      }));
      ctx.get(listenerCtx).markdownUpdated((_, markdown, prev) => {
        if (markdown === lastApplied) return;
        if (markdown !== prev) emit("change", markdown);
      });
    }),
);

async function defaultUploader(files: File[]): Promise<{ src: string; alt: string }[]> {
  // 无外部处理器时拒绝，由调用方经 uploadFiles 注入真实存储。
  if (files.length > 0) {
    const { useUiStore } = await import("@/stores/ui");
    useUiStore().notify("图片导入未配置存储");
  }
  return [];
}

async function saveImageNodes(files: File[], schema: Schema): Promise<ProseNode[]> {
  const handler = props.uploadFiles ?? defaultUploader;
  const images = files.filter((file) => file.type.startsWith("image/"));
  if (images.length === 0) return [];
  const nodes: ProseNode[] = [];
  try {
    const uploaded = await handler(images);
    for (const item of uploaded) {
      const node = schema.nodes.image.createAndFill({ src: item.src, alt: item.alt });
      if (node) nodes.push(node);
    }
  } catch (error) {
    console.warn("图片导入失败", error);
  }
  return nodes;
}

function uploadImages(files: FileList, schema: Schema): Promise<ProseNode[]> {
  return saveImageNodes(Array.from(files), schema);
}

function readMarkdown(): string {
  const editor = getInstance();
  if (!editor) return props.initial;
  return editor.action(getMarkdown());
}

let lastApplied: string | null = null;

/** 外部写入（撤销回放/预览刷新）：记录写后回读，抑制序列化回声。
 * 回声若参与记录会污染撤销栈并清空重做栈（§5.2 程序化回放不入栈）。 */
function setText(markdown: string) {
  const editor = getInstance();
  if (!editor) return;
  if (readMarkdown() === markdown) return;
  editor.action(replaceAll(markdown));
  lastApplied = readMarkdown();
}

function runCommand(command: MilkdownCommand) {
  const editor = getInstance();
  if (!editor) return;
  const key = {
    bold: toggleStrongCommand.key,
    italic: toggleEmphasisCommand.key,
    strikethrough: toggleStrikethroughCommand.key,
    bulletList: wrapInBulletListCommand.key,
    orderedList: wrapInOrderedListCommand.key,
  }[command];
  editor.action(callCommand(key));
}

/** 以 Markdown 片段在选区插入（标题/引用/代码/清单/链接，§5.2 格式命令）。 */
function insertMarkdown(snippet: string) {
  const editor = getInstance();
  if (!editor) return;
  editor.action(insert(snippet));
}

function insertImageNode(src: string, alt: string) {
  const editor = getInstance();
  if (!editor) return;
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const node = view.state.schema.nodes.image.createAndFill({ src, alt });
    if (node) view.dispatch(view.state.tr.replaceSelectionWith(node));
  });
}

function focusAtEnd() {
  const editor = getInstance();
  if (!editor) return;
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
    view.focus();
  });
}

function editorScrollRatio(): number {
  const el = host.value?.querySelector(".milkdown-host-wrap");
  if (!el || el.scrollHeight <= el.clientHeight) return 0;
  return el.scrollTop / (el.scrollHeight - el.clientHeight);
}

function setEditorScrollRatio(ratio: number) {
  const el = host.value?.querySelector(".milkdown-host-wrap");
  if (!el || el.scrollHeight <= el.clientHeight) return;
  el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
}

// ---- 块映射同步滚动（§5.2）：预览顶层节点与源码块按序对应。 ----

function previewChildren(): HTMLElement[] {
  // Milkdown 渲染为 .milkdown-host > .editor（ProseMirror 容器）> 顶层节点。
  const editor =
    host.value?.querySelector(".milkdown-host .editor") ??
    host.value?.querySelector(".milkdown-host");
  return editor ? [...editor.children].filter((el) => el instanceof HTMLElement) : [];
}

function childContentTop(wrap: HTMLElement, child: HTMLElement): number {
  // 换算到滚动内容坐标：视口差 + 当前滚动量。
  return child.getBoundingClientRect().top - wrap.getBoundingClientRect().top + wrap.scrollTop;
}

function topBlockProgress(): { index: number; progress: number } {
  const wrap = host.value as HTMLElement | null;
  if (!wrap) return { index: 0, progress: 0 };
  const children = previewChildren();
  if (children.length === 0) return { index: 0, progress: 0 };
  const top = wrap.scrollTop;
  let index = children.length - 1;
  for (let i = 0; i < children.length; i += 1) {
    if (childContentTop(wrap, children[i]) + children[i].offsetHeight > top) {
      index = i;
      break;
    }
  }
  const childTop = childContentTop(wrap, children[index]);
  const height = Math.max(1, children[index].offsetHeight);
  const progress = Math.min(1, Math.max(0, (top - childTop) / height));
  return { index, progress };
}

function scrollToBlock(index: number, progress: number) {
  const wrap = host.value as HTMLElement | null;
  if (!wrap || wrap.scrollHeight <= wrap.clientHeight) return;
  const children = previewChildren();
  if (children.length === 0) return;
  const clamped = Math.min(children.length - 1, Math.max(0, index));
  const child = children[clamped];
  wrap.scrollTop = childContentTop(wrap, child) + progress * child.offsetHeight;
}

function onHostKeydown(event: KeyboardEvent) {
  const modifier = event.ctrlKey || event.metaKey;
  if (!modifier || event.key.toLowerCase() !== "z") return;
  event.preventDefault();
  if (event.shiftKey) emit("redo");
  else emit("undo");
}

function onHostClick(event: MouseEvent) {
  if (!(event.target instanceof HTMLElement)) return;
  const anchor = event.target.closest("a[href]");
  if (anchor) {
    const href = anchor.getAttribute("href") ?? "";
    event.preventDefault();
    // 新窗口链接添加 noopener noreferrer（§5.3）；危险协议不执行。
    if (/^https?:\/\//i.test(href)) {
      window.open(href, "_blank", "noopener,noreferrer");
    }
    return;
  }
  if (!props.readonly && !event.target.closest(".ProseMirror")) focusAtEnd();
}

function onHostDragOver(event: DragEvent) {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
}

function onCompositionStart() {
  emit("composing", true);
}

function onCompositionEnd() {
  emit("composing", false);
}

const host = ref<HTMLElement | null>(null);

onMounted(() => {
  host.value?.addEventListener("keydown", onHostKeydown);
  host.value?.addEventListener("click", onHostClick);
  host.value?.addEventListener("dragover", onHostDragOver);
  host.value?.addEventListener("compositionstart", onCompositionStart);
  host.value?.addEventListener("compositionend", onCompositionEnd);
});

onBeforeUnmount(() => {
  host.value?.removeEventListener("keydown", onHostKeydown);
  host.value?.removeEventListener("click", onHostClick);
  host.value?.removeEventListener("dragover", onHostDragOver);
  host.value?.removeEventListener("compositionstart", onCompositionStart);
  host.value?.removeEventListener("compositionend", onCompositionEnd);
});

defineExpose({
  setText,
  runCommand,
  insertMarkdown,
  insertImageNode,
  readMarkdown,
  focusAtEnd,
  editorScrollRatio,
  setEditorScrollRatio,
  topBlockProgress,
  scrollToBlock,
  loading,
});
</script>

<template>
  <div ref="host" class="milkdown-host-wrap" @scroll.passive="emit('scroll')">
    <Milkdown class="milkdown-host" />
  </div>
</template>

<style>
.milkdown-host-wrap {
  height: 100%;
  overflow-y: auto;
}

.milkdown-host {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  cursor: text;
}

.milkdown-host > .milkdown {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.milkdown-host .ProseMirror {
  outline: none;
  white-space: pre-wrap;
  line-height: 1.9;
  color: var(--text);
  flex: 1;
  padding: 10px 14px 12px;
  cursor: text;
  font-size: 13px;
}

.milkdown-host .ProseMirror p {
  margin: 0 0 13px;
}

.milkdown-host .ProseMirror h1 {
  font-size: 26px;
  margin: 0 0 16px;
  letter-spacing: -0.7px;
  line-height: 1.5;
}

.milkdown-host .ProseMirror h2 {
  font-size: 17px;
  margin: 27px 0 10px;
}

.milkdown-host .ProseMirror h3 {
  font-size: 14px;
  margin: 20px 0 8px;
}

.milkdown-host .ProseMirror ul,
.milkdown-host .ProseMirror ol {
  padding-left: 22px;
  margin: 8px 0 18px;
}

.milkdown-host .ProseMirror li {
  margin-bottom: 5px;
}

.milkdown-host .ProseMirror blockquote {
  margin: 20px 0;
  border-left: 3px solid var(--brand);
  background: var(--sidebar);
  padding: 12px 17px;
  color: var(--muted);
  font-size: 12px;
  border-radius: 0 6px 6px 0;
}

.milkdown-host .ProseMirror pre {
  padding: 15px;
  background: var(--surface);
  border-radius: 7px;
  overflow-x: auto;
  font-size: 11px;
}

.milkdown-host .ProseMirror code {
  font-size: 11px;
  color: var(--brand);
}

.milkdown-host .ProseMirror a {
  color: var(--brand);
}

/* 本地图片展示；外部图片仅占位（§5.3）。 */
.tt-image-slot {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 1px 6px;
  border: 1px dashed var(--line);
  border-radius: 4px;
  background: var(--surface);
  color: var(--muted);
  font-size: 0.92em;
  vertical-align: baseline;
}

.tt-image-slot img {
  max-width: min(100%, 480px);
  border-radius: 6px;
}

.tt-image-slot__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tt-image-slot.ProseMirror-selectednode {
  border-style: solid;
  border-color: var(--brand);
}
</style>
