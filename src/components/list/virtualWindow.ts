import { computed, onBeforeUnmount, onMounted, ref, type Ref } from "vue";

// 列表虚拟滚动窗口：由桌面端 composables/virtualList.ts 移植（泛型化）。
// 超过阈值只渲染可视区附近的行，用撑高占位与 translateY 保持滚动位置；
// 阈值以下退化为全量渲染。滚动容器为应用主滚动区（.main-scroll，单例）。
export const ESTIMATED_ROW_HEIGHT = 72;
const BUFFER_SIZE = 5;

export function useVirtualWindow<T>(options: {
  items: () => T[];
  threshold?: number;
  containerSelector?: string;
}) {
  const { items, threshold = 100, containerSelector = ".main-scroll" } = options;

  const scrollTop = ref(0);
  const containerHeight = ref(0);
  const containerRef: Ref<HTMLElement | null> = ref(null);

  const enabled = computed(() => items().length > threshold);

  const startIndex = computed(() => {
    if (!enabled.value) return 0;
    return Math.max(0, Math.floor(scrollTop.value / ESTIMATED_ROW_HEIGHT) - BUFFER_SIZE);
  });

  const endIndex = computed(() => {
    if (!enabled.value) return items().length;
    const visibleCount = Math.ceil(containerHeight.value / ESTIMATED_ROW_HEIGHT);
    return Math.min(items().length, startIndex.value + visibleCount + BUFFER_SIZE * 2);
  });

  const visibleItems = computed(() => {
    if (!enabled.value) return items();
    return items().slice(startIndex.value, endIndex.value);
  });

  // 窗口内序号 → 全局序号（拖拽写回自定义顺序时使用）。
  function globalIndex(windowIndex: number): number {
    return startIndex.value + windowIndex;
  }

  const totalHeight = computed(() =>
    enabled.value ? `${items().length * ESTIMATED_ROW_HEIGHT}px` : "auto",
  );

  const offsetY = computed(() => (enabled.value ? startIndex.value * ESTIMATED_ROW_HEIGHT : 0));

  function onScroll(event: Event): void {
    scrollTop.value = (event.target as HTMLElement).scrollTop;
  }

  function updateContainerHeight(): void {
    if (containerRef.value) containerHeight.value = containerRef.value.clientHeight;
  }

  onMounted(() => {
    containerRef.value = document.querySelector<HTMLElement>(containerSelector);
    updateContainerHeight();
    containerRef.value?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateContainerHeight);
  });

  onBeforeUnmount(() => {
    containerRef.value?.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", updateContainerHeight);
  });

  return { enabled, visibleItems, totalHeight, offsetY, globalIndex };
}
