<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

import ThemeSwitcher from "@/components/ThemeSwitcher.vue";

const route = useRoute();
// 设置子页映射为 ?section=...（设计文档 §14.2），P7 实现各分区内容。
const section = computed(() => (route.query.section as string | undefined) ?? "appearance");
</script>

<template>
  <div class="content narrow">
    <div class="page-heading">
      <div>
        <h1>设置</h1>
        <p>账号、设备、外观、编辑、本地存储及备份。P7 补齐各分区。</p>
      </div>
    </div>
    <div class="panel">
      <div class="setting-row">
        <span class="grow">
          <h3>外观主题</h3>
          <p>浅色、深色或跟随系统，保存在当前浏览器（section={{ section }})。</p>
        </span>
        <ThemeSwitcher />
      </div>
    </div>
  </div>
</template>
