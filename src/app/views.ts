import type { IconName } from "@/components/icons";

// 工作台固定视图（设计文档 §3.1、§4.1）。P3 接入真实查询与计数。
export interface ViewDef {
  id: string;
  title: string;
  description: string;
  icon: IconName;
}

export const PROJECT_VIEWS: ViewDef[] = [
  { id: "today", title: "今日", description: "过期与今天到期的未完成任务", icon: "calendar" },
  { id: "inbox", title: "收件箱", description: "全部未完成任务", icon: "inbox" },
  { id: "upcoming", title: "即将到期", description: "未来有截止日期的未完成任务", icon: "history" },
  { id: "all", title: "全部任务", description: "已完成与未完成共存", icon: "list" },
  { id: "completed", title: "已完成", description: "按完成日期分组", icon: "circle-check" },
];

export const VIEW_IDS = PROJECT_VIEWS.map((view) => view.id);

export function viewDef(viewId: string | undefined): ViewDef | undefined {
  return PROJECT_VIEWS.find((view) => view.id === viewId);
}
