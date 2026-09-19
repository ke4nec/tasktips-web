<script setup lang="ts">
import { MilkdownProvider } from "@milkdown/vue";
import { useTemplateRef } from "vue";

import MilkdownInner, { type MilkdownCommand } from "./MilkdownInner.vue";

// 外层只提供 MilkdownProvider（useInstance/useEditor 必须注入祖先，
// 与桌面端 MilkdownSurface/MilkdownEditor 结构一致），方法经内层转发。
const props = defineProps<{
  initial: string;
  readonly?: boolean;
  autofocus?: boolean;
  uploadFiles?: (files: File[]) => Promise<{ src: string; alt: string }[]>;
}>();

const emit = defineEmits<{
  (e: "change", markdown: string): void;
  (e: "undo"): void;
  (e: "redo"): void;
  (e: "composing", value: boolean): void;
  (e: "scroll"): void;
}>();

const inner = useTemplateRef("inner");

defineExpose({
  setText: (markdown: string) => inner.value?.setText(markdown),
  runCommand: (command: MilkdownCommand) => inner.value?.runCommand(command),
  insertMarkdown: (snippet: string) => inner.value?.insertMarkdown(snippet),
  insertImageNode: (src: string, alt: string) => inner.value?.insertImageNode(src, alt),
  readMarkdown: () => inner.value?.readMarkdown() ?? "",
  focusAtEnd: () => inner.value?.focusAtEnd(),
  editorScrollRatio: () => inner.value?.editorScrollRatio() ?? 0,
  setEditorScrollRatio: (ratio: number) => inner.value?.setEditorScrollRatio(ratio),
});
</script>

<template>
  <MilkdownProvider>
    <MilkdownInner
      ref="inner"
      :initial="props.initial"
      :readonly="props.readonly"
      :autofocus="props.autofocus"
      :upload-files="props.uploadFiles"
      @change="emit('change', $event)"
      @undo="emit('undo')"
      @redo="emit('redo')"
      @composing="emit('composing', $event)"
      @scroll="emit('scroll')"
    />
  </MilkdownProvider>
</template>
