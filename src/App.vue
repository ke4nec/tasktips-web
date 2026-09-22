<script setup lang="ts">
import { applySwUpdate, swUpdateAvailable, swUpdateError, swUpdating } from "@/app/pwa";
</script>

<template>
  <RouterView />
  <div v-if="swUpdateAvailable" class="toast visible" role="status" style="pointer-events: auto">
    <span>{{ swUpdateError || "新版本已下载，刷新后生效（先完成本地保存）。" }}</span>
    <button
      type="button"
      class="btn primary"
      :disabled="swUpdating"
      style="margin-left: 12px"
      @click="applySwUpdate"
    >
      立即更新
    </button>
  </div>
</template>
