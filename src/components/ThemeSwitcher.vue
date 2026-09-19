<script setup lang="ts">
import { useThemeStore, type ThemePreference } from "@/stores/theme";

const theme = useThemeStore();
const options: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
];
</script>

<template>
  <div class="segmented" role="group" aria-label="主题偏好">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :aria-pressed="theme.preference === option.value"
      @click="theme.setPreference(option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
