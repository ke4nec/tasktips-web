<script setup lang="ts">
import { ref } from "vue";

import ThemeSwitcher from "@/components/ThemeSwitcher.vue";
import { loadPrefs, savePrefs, type EditorMode } from "@/editor/session";

const prefs = ref(loadPrefs());

function setMode(mode: EditorMode) {
  prefs.value = { ...prefs.value, mode };
  savePrefs(prefs.value);
}

function toggleSyncScroll() {
  prefs.value = { ...prefs.value, syncScroll: !prefs.value.syncScroll };
  savePrefs(prefs.value);
}
</script>

<template>
  <div class="panel">
    <div class="setting-row">
      <span class="grow">
        <h3>外观主题</h3>
        <p>浅色、深色或跟随系统，保存在当前浏览器。</p>
      </span>
      <ThemeSwitcher />
    </div>
    <div class="setting-row">
      <span class="grow">
        <h3>默认编辑模式</h3>
        <p>打开任务详情时的初始编辑模式，可随时切换。</p>
      </span>
      <div class="segmented" role="group" aria-label="默认编辑模式">
        <button type="button" :aria-pressed="prefs.mode === 'instant'" @click="setMode('instant')">
          即时
        </button>
        <button type="button" :aria-pressed="prefs.mode === 'split'" @click="setMode('split')">
          分栏
        </button>
      </div>
    </div>
    <div class="setting-row">
      <span class="grow">
        <h3>分栏同步滚动</h3>
        <p>源码与预览按比例联动（正式块映射后续补齐）。</p>
      </span>
      <button
        type="button"
        class="switch"
        role="switch"
        :aria-checked="prefs.syncScroll"
        aria-label="分栏同步滚动"
        @click="toggleSyncScroll"
      />
    </div>
  </div>
</template>
