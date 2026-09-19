// 32 色预设色板：由桌面端 src/types.ts COLOR_PALETTE 移植，与后端对齐。
export const COLOR_PALETTE: ReadonlyArray<{ name: string; value: string }> = [
  { name: "默认（灰色）", value: "#8a8a8a" },
  { name: "红色", value: "#f97066" },
  { name: "橙色", value: "#fb923c" },
  { name: "黄色", value: "#fbbf24" },
  { name: "绿色", value: "#6ccb5f" },
  { name: "青色", value: "#6ee7b7" },
  { name: "蓝色", value: "#4a9eff" },
  { name: "紫色", value: "#a78bfa" },
  { name: "玫红", value: "#e05299" },
  { name: "浅粉", value: "#ff8fab" },
  { name: "浅紫", value: "#c084fc" },
  { name: "靛蓝", value: "#818cf8" },
  { name: "天蓝", value: "#38bdf8" },
  { name: "青蓝", value: "#22d3ee" },
  { name: "薄荷", value: "#34d399" },
  { name: "草绿", value: "#a3e635" },
  { name: "亮橙", value: "#f97316" },
  { name: "正红", value: "#ef4444" },
  { name: "深红", value: "#dc2626" },
  { name: "暗红", value: "#b91c1c" },
  { name: "琥珀", value: "#d97706" },
  { name: "金黄", value: "#ca8a04" },
  { name: "橄榄", value: "#65a30d" },
  { name: "深绿", value: "#15803d" },
  { name: "海洋蓝", value: "#0284c7" },
  { name: "深蓝", value: "#1d4ed8" },
  { name: "深靛", value: "#4338ca" },
  { name: "深紫", value: "#7c3aed" },
  { name: "洋红", value: "#9d174d" },
  { name: "绯红", value: "#be123c" },
  { name: "深青", value: "#0f766e" },
  { name: "石板灰", value: "#475569" },
];

export function isPaletteColor(value: string): boolean {
  return COLOR_PALETTE.some((entry) => entry.value.toLowerCase() === value.toLowerCase());
}
