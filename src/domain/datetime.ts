/** 本地日历日期工具：dueDate 是不带时区的 YYYY-MM-DD（设计文档 §4.1）。
 * 由桌面端 src/utils/datetime.ts 逐字移植。 */

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayLocal(): string {
  return toDateKey(new Date());
}

export function isOverdue(dueDate: string | undefined, today: string = todayLocal()): boolean {
  return dueDate !== undefined && dueDate < today;
}

function diffDays(dueDate: string, today: string): number {
  const due = new Date(`${dueDate}T00:00:00`);
  const now = new Date(`${today}T00:00:00`);
  return Math.round((due.getTime() - now.getTime()) / 86_400_000);
}

/** 列表行截止日期显示：今天/明天/昨天/过期 N 天/具体日期。 */
export function formatDueDate(dueDate: string, today: string = todayLocal()): string {
  const days = diffDays(dueDate, today);
  if (days === 0) return "今天";
  if (days === 1) return "明天";
  if (days === -1) return "昨天";
  if (days < -1) return `过期 ${-days} 天`;
  return dueDate;
}

/** 时间戳显示：同年省略年份。 */
export function formatTimestamp(rfc3339: string): string {
  const date = new Date(rfc3339);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  if (sameYear) {
    return `${month}月${day}日 ${hours}:${minutes}`;
  }
  return `${date.getFullYear()}年${month}月${day}日 ${hours}:${minutes}`;
}

/** 正文摘要的字数（按字符）。 */
export function countChars(text: string): number {
  return [...text].length;
}

/** 页面副标题长日期：2026 年 9 月 18 日，星期五。 */
export function formatLongDate(dateKey: string = todayLocal()): string {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日，星期${
    weekdays[date.getDay()]
  }`;
}
