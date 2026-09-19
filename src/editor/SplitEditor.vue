<script setup lang="ts">
import { ref } from "vue";

import MilkdownDoc from "./MilkdownDoc.vue";
import SourceEditor from "./SourceEditor.vue";

const props = withDefaults(
  defineProps<{
    sourceText: string;
    previewText: string;
    ratio: number;
    syncScroll: boolean;
    readonly?: boolean;
    uploadFiles: (files: File[]) => Promise<{ src: string; alt: string }[]>;
  }>(),
  { readonly: false },
);

const emit = defineEmits<{
  (e: "change", text: string): void;
  (e: "ratio", value: number): void;
  (e: "undo"): void;
  (e: "redo"): void;
  (e: "composing", value: boolean): void;
}>();

const sourceRef = ref<InstanceType<typeof SourceEditor> | null>(null);
const previewRef = ref<InstanceType<typeof MilkdownDoc> | null>(null);
const showPreviewTab = ref(false);
let scrollGuard = false;

function setRatio(value: number) {
  emit("ratio", Math.max(30, Math.min(70, Math.round(value))));
}

// 同步滚动：原型级比例映射（设计稿行为）；正式块映射见代码注释债务。
function onSourceScroll() {
  if (!props.syncScroll || scrollGuard) return;
  const preview = previewRef.value;
  const source = sourceRef.value;
  if (!preview || !source) return;
  scrollGuard = true;
  preview.setEditorScrollRatio(source.editorScrollRatio());
  requestAnimationFrame(() => {
    scrollGuard = false;
  });
}

function onPreviewScroll() {
  if (!props.syncScroll || scrollGuard) return;
  const preview = previewRef.value;
  const source = sourceRef.value;
  if (!preview || !source) return;
  scrollGuard = true;
  source.setEditorScrollRatio(preview.editorScrollRatio());
  requestAnimationFrame(() => {
    scrollGuard = false;
  });
}

function onDividerPointerDown(event: PointerEvent) {
  const divider = event.currentTarget as HTMLElement;
  event.preventDefault();
  divider.setPointerCapture(event.pointerId);
  const move = (moveEvent: PointerEvent) => {
    if (!divider.hasPointerCapture(moveEvent.pointerId)) return;
    const container = divider.closest("#split-editor");
    const rect = container?.getBoundingClientRect();
    if (rect && rect.width > 0) setRatio(((moveEvent.clientX - rect.left) / rect.width) * 100);
  };
  const up = (upEvent: PointerEvent) => {
    if (divider.hasPointerCapture(upEvent.pointerId))
      divider.releasePointerCapture(upEvent.pointerId);
    divider.removeEventListener("pointermove", move);
    divider.removeEventListener("pointerup", up);
  };
  divider.addEventListener("pointermove", move);
  divider.addEventListener("pointerup", up);
}

function onDividerKeydown(event: KeyboardEvent) {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    setRatio(props.ratio + (event.key === "ArrowLeft" ? -5 : 5));
  }
}

defineExpose({ sourceRef, previewRef });
</script>

<template>
  <div class="split-mobile-tabs segmented" role="group" aria-label="分栏页签">
    <button type="button" :aria-pressed="!showPreviewTab" @click="showPreviewTab = false">
      编辑
    </button>
    <button type="button" :aria-pressed="showPreviewTab" @click="showPreviewTab = true">
      预览
    </button>
  </div>
  <div id="split-editor" class="split-container" :class="{ 'show-preview': showPreviewTab }">
    <div class="source-pane" :style="{ width: `${props.ratio}%` }">
      <div class="pane-title"><span>Markdown 源码</span></div>
      <div class="source-scroll">
        <SourceEditor
          ref="sourceRef"
          :text="props.sourceText"
          :readonly="props.readonly"
          @change="emit('change', $event)"
          @undo="emit('undo')"
          @redo="emit('redo')"
          @composing="emit('composing', $event)"
          @scroll="onSourceScroll"
        />
      </div>
    </div>
    <div
      class="split-divider"
      role="separator"
      aria-label="调整分栏比例"
      aria-valuemin="30"
      aria-valuemax="70"
      :aria-valuenow="Math.round(props.ratio)"
      tabindex="0"
      @pointerdown="onDividerPointerDown"
      @keydown="onDividerKeydown"
    />
    <div class="preview-pane" :style="{ width: `${100 - props.ratio}%` }">
      <div class="pane-title"><span>实时预览 · 只读</span></div>
      <div class="preview-scroll">
        <MilkdownDoc
          ref="previewRef"
          :initial="props.previewText"
          readonly
          :upload-files="props.uploadFiles"
          @scroll="onPreviewScroll"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.source-scroll,
.preview-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.source-pane,
.preview-pane {
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
