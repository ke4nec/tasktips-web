<script setup lang="ts">
import AppIcon from "./AppIcon.vue";
import type { IconName } from "./icons";

withDefaults(
  defineProps<{ icon?: IconName; title: string; description?: string; actionLabel?: string }>(),
  { icon: "check", description: "", actionLabel: "" },
);

const emit = defineEmits<{ (e: "action"): void }>();
</script>

<template>
  <div class="empty">
    <div class="empty-symbol"><AppIcon :name="icon" /></div>
    <h2>{{ title }}</h2>
    <p v-if="description">{{ description }}</p>
    <button v-if="actionLabel" type="button" class="btn tonal" @click="emit('action')">
      {{ actionLabel }}
    </button>
  </div>
</template>
