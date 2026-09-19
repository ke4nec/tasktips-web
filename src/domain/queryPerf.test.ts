import { describe, expect, it } from "vitest";

import { runQuery, type QueryContext } from "@/domain/query";
import type { Todo } from "@/domain/types";

// 性能验收（§12.1）：1000 条任务本地筛选 P95 <100ms。
// 此处度量查询逻辑（node）；DOM 渲染侧由虚拟列表保证，记录于 README。
function makeTodos(count: number): Todo[] {
  const todos: Todo[] = [];
  for (let index = 0; index < count; index++) {
    todos.push({
      id: `perf-${index}`,
      title: `任务 ${index} 中文标题混合 content ${index}`,
      body: `正文 ${index}\n\n\`\`\`code ${index}\`\`\`\n`,
      status: index % 7 === 0 ? "completed" : "open",
      priority: (index % 4) as Todo["priority"],
      tags: index % 2 === 0 ? ["工作", "标签"] : ["生活"],
      dueDate: index % 3 === 0 ? "2026-09-18" : index % 3 === 1 ? "2026-09-19" : undefined,
      categoryId: index % 5 === 0 ? "c-1" : undefined,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-10T00:00:00.000Z",
      revision: 1,
    });
  }
  return todos;
}

describe("千条任务查询性能", () => {
  it("inbox 全量与中文搜索 P95 <100ms", () => {
    const todos = makeTodos(1000);
    const ctx: QueryContext = {
      todos,
      categories: [],
      today: "2026-09-19",
      customOrder: { inbox: [], all: [] },
    };
    const samples: number[] = [];
    for (let round = 0; round < 20; round++) {
      const start = performance.now();
      const rows = runQuery({ view: "inbox", search: "中文" }, ctx);
      samples.push(performance.now() - start);
      expect(rows.length).toBeGreaterThan(0);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)];
    expect(p95).toBeLessThan(100);
  });
});
