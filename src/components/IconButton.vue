<script setup lang="ts">
import AppIcon from "./AppIcon.vue";
import type { IconName } from "./icons";

defineProps<{ icon: IconName; label: string }>();
</script>

<template>
  <button type="button" class="icon-btn" :aria-label="label" :title="label">
    <AppIcon :name="icon" />
  </button>
</template>
