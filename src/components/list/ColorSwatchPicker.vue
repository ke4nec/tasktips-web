<script setup lang="ts">
import { COLOR_PALETTE } from "@/domain/colors";

defineProps<{ modelValue: string }>();
const emit = defineEmits<{ (e: "update:modelValue", value: string): void }>();
</script>

<template>
  <div class="field">
    <label>颜色</label>
    <div class="flex wrap" style="gap: 10px" role="radiogroup" aria-label="颜色">
      <button
        v-for="entry in COLOR_PALETTE"
        :key="entry.value"
        type="button"
        class="color-swatch"
        :style="{ background: entry.value }"
        :aria-label="`颜色 ${entry.name}`"
        :aria-pressed="modelValue.toLowerCase() === entry.value.toLowerCase()"
        @click="emit('update:modelValue', entry.value)"
      />
    </div>
  </div>
</template>
