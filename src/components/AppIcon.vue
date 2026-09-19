<script setup lang="ts">
import { computed, h } from "vue";

import { ICON_PATHS, type IconName } from "./icons";

const props = withDefaults(defineProps<{ name: IconName; small?: boolean }>(), { small: false });

// 路径来自静态可信常量（icons.ts），用 innerHTML 渲染以避开模板 v-html 限制。
const svg = computed(() =>
  h(
    "svg",
    { class: ["icon", props.small ? "small" : ""], viewBox: "0 0 24 24", "aria-hidden": "true" },
    [h("g", { innerHTML: ICON_PATHS[props.name] ?? ICON_PATHS.list })],
  ),
);
</script>

<template>
  <component :is="svg" />
</template>
