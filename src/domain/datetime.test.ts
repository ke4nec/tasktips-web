import { describe, expect, it } from "vitest";

import {
  countChars,
  formatDueDate,
  formatTimestamp,
  isOverdue,
  toDateKey,
} from "@/domain/datetime";

describe("formatDueDate", () => {
  const today = "2026-08-18";

  it("相对日期", () => {
    expect(formatDueDate("2026-08-18", today)).toBe("今天");
    expect(formatDueDate("2026-08-19", today)).toBe("明天");
    expect(formatDueDate("2026-08-17", today)).toBe("昨天");
    expect(formatDueDate("2026-08-15", today)).toBe("过期 3 天");
  });

  it("远期显示原始日期", () => {
    expect(formatDueDate("2026-12-01", today)).toBe("2026-12-01");
  });
});

describe("isOverdue", () => {
  it("早于今天为过期", () => {
    expect(isOverdue("2026-08-17", "2026-08-18")).toBe(true);
    expect(isOverdue("2026-08-18", "2026-08-18")).toBe(false);
    expect(isOverdue(undefined)).toBe(false);
  });
});

describe("toDateKey", () => {
  it("补零格式化", () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toDateKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("formatTimestamp", () => {
  it("非法输入返回空串", () => {
    expect(formatTimestamp("not a date")).toBe("");
  });

  it("输出本地时间", () => {
    const text = formatTimestamp("2026-08-18T01:00:00Z");
    expect(text).toMatch(/月\d+日 \d{2}:\d{2}/);
  });
});

describe("countChars", () => {
  it("按 Unicode 字符计数", () => {
    expect(countChars("abc")).toBe(3);
    expect(countChars("中文三个")).toBe(4);
    expect(countChars("a😀b")).toBe(3);
  });
});
