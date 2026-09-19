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

// 标签 pill 色调：把色板色值映射到设计稿的语义 pill 类（blue/green/purple/red/amber），
// 未覆盖的色值回落到默认灰 pill。
const PILL_TONES: ReadonlyArray<{ tone: string; values: ReadonlyArray<string> }> = [
  {
    tone: "blue",
    values: ["#4a9eff", "#38bdf8", "#22d3ee", "#0284c7", "#1d4ed8", "#818cf8"],
  },
  {
    tone: "green",
    values: ["#6ccb5f", "#6ee7b7", "#34d399", "#a3e635", "#15803d", "#65a30d", "#0f766e"],
  },
  {
    tone: "purple",
    values: ["#a78bfa", "#c084fc", "#7c3aed", "#4338ca"],
  },
  {
    tone: "red",
    values: [
      "#f97066",
      "#ef4444",
      "#dc2626",
      "#b91c1c",
      "#e05299",
      "#ff8fab",
      "#9d174d",
      "#be123c",
    ],
  },
  {
    tone: "amber",
    values: ["#fb923c", "#fbbf24", "#f97316", "#d97706", "#ca8a04"],
  },
];

export function pillToneForColor(value: string | undefined): string {
  if (!value) return "";
  const target = value.toLowerCase();
  const hit = PILL_TONES.find((entry) => entry.values.includes(target));
  return hit ? hit.tone : "";
}
