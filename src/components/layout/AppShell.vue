<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";

import AppToast from "@/components/AppToast.vue";
import AppSidebar from "@/components/layout/AppSidebar.vue";
import AppTopbar from "@/components/layout/AppTopbar.vue";
import CommandPalette from "@/components/layout/CommandPalette.vue";
import { useUiStore } from "@/stores/ui";

const props = defineProps<{ projectId: string }>();

const route = useRoute();
const ui = useUiStore();
const navOpen = ref(false);
const paletteOpen = ref(false);
let toggleButton: HTMLElement | null = null;

// 移动端抽屉：打开时将焦点移入导航，关闭时归还；Esc 关闭；路由变化自动收起。
function setNavOpen(value: boolean) {
  if (value === navOpen.value) return;
  if (value) {
    toggleButton = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  navOpen.value = value;
  if (value) {
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(".sidebar .nav-link")?.focus();
    });
  } else if (toggleButton?.isConnected) {
    toggleButton.focus();
  }
}

function onKeydown(event: KeyboardEvent) {
  const isModifier = event.ctrlKey || event.metaKey;
  if (isModifier && event.key.toLowerCase() === "k") {
    event.preventDefault();
    paletteOpen.value = true;
    return;
  }
  if (event.key === "Escape" && navOpen.value) {
    setNavOpen(false);
  }
}

watch(
  () => route.fullPath,
  () => setNavOpen(false),
);

onMounted(() => document.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown));
</script>

<template>
  <div class="app-shell" :class="{ 'nav-open': navOpen, 'focus-mode': ui.editorFocus }">
    <AppSidebar :project-id="props.projectId" @navigate="setNavOpen(false)" />
    <div class="app-main">
      <AppTopbar
        :project-id="props.projectId"
        @toggle-nav="setNavOpen(!navOpen)"
        @command="paletteOpen = true"
      />
      <div class="main-scroll">
        <slot />
      </div>
    </div>
    <button
      type="button"
      class="nav-backdrop"
      aria-label="关闭导航"
      tabindex="-1"
      @click="setNavOpen(false)"
    />
    <CommandPalette v-model:open="paletteOpen" :project-id="props.projectId" />
    <AppToast />
  </div>
</template>
