<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";

import AccountSection from "@/components/settings/AccountSection.vue";
import AppearanceSection from "@/components/settings/AppearanceSection.vue";
import DevicesSection from "@/components/settings/DevicesSection.vue";
import StorageSection from "@/components/settings/StorageSection.vue";
import { useProjectStore } from "@/stores/project";
import { useSyncStore } from "@/stores/sync";

const route = useRoute();
const router = useRouter();
const sync = useSyncStore();
const projects = useProjectStore();

const sections = [
  { id: "appearance", label: "外观与编辑" },
  { id: "account", label: "账号与安全" },
  { id: "devices", label: "登录设备" },
  { id: "storage", label: "存储与备份" },
] as const;

type SectionId = (typeof sections)[number]["id"];

// 设置子页映射为 ?section=...（设计文档 §14.2）。
const section = computed<SectionId>(() => {
  const raw = route.query.section as string | undefined;
  return sections.some((item) => item.id === raw) ? (raw as SectionId) : "appearance";
});

// 存储分区需要项目上下文：取当前或上次可访问的真实项目。
const storageProjectId = computed(
  () =>
    sync.currentProjectId ||
    (route.params.projectId as string | undefined) ||
    projects.entryProject()?.id ||
    "",
);

function goSection(id: SectionId) {
  router.push({ name: "settings", query: id === "appearance" ? {} : { section: id } });
}
</script>

<template>
  <div class="content narrow">
    <div class="page-heading">
      <div>
        <h1>设置</h1>
        <p>账号、设备、外观、编辑、本地存储及备份。</p>
      </div>
    </div>
    <div class="settings-layout">
      <nav class="settings-nav" aria-label="设置分区">
        <button
          v-for="item in sections"
          :key="item.id"
          type="button"
          :class="{ active: section === item.id }"
          :aria-current="section === item.id ? 'page' : undefined"
          @click="goSection(item.id)"
        >
          {{ item.label }}
        </button>
      </nav>
      <div>
        <AppearanceSection v-if="section === 'appearance'" />
        <AccountSection v-else-if="section === 'account'" />
        <DevicesSection v-else-if="section === 'devices'" />
        <StorageSection v-else-if="storageProjectId" :project-id="storageProjectId" />
        <p v-else>请先选择项目，再管理存储与备份。</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-nav button {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--muted);
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 12px;
  margin: 3px 0;
  width: 100%;
  text-align: left;
}

.settings-nav button.active {
  color: var(--brand);
  background: var(--brand-soft);
}

@media (max-width: 767px) {
  .settings-nav {
    display: flex;
    overflow-x: auto;
    gap: 4px;
    padding-bottom: 3px;
  }

  .settings-nav button {
    white-space: nowrap;
    padding: 8px;
    width: auto;
  }
}
</style>
