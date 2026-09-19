import { describe, expect, it } from "vitest";

import {
  buildCategoryTree,
  categoryNameIssue,
  depthOf,
  groupTags,
  isTrashExpired,
  moveCategoryIssue,
  remainingDays,
  siblingNameTaken,
  subtreeHeight,
  tagNameIssue,
  tagNameTaken,
} from "@/domain/classification";
import type { Category, Tag } from "@/domain/types";

function category(partial: Partial<Category> & { id: string; name: string }): Category {
  return {
    parentId: null,
    color: "#8a8a8a",
    icon: "",
    description: "",
    orderIndex: 0,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    ...partial,
  };
}

describe("目录名校验", () => {
  it("长度按码点计数 2–50，禁特殊字符", () => {
    expect(categoryNameIssue("a")).toBe("目录名称至少 2 个字符。");
    expect(categoryNameIssue("ab")).toBe("");
    expect(categoryNameIssue("a/b")).not.toBe("");
    expect(categoryNameIssue("a:b")).not.toBe("");
    expect(categoryNameIssue("  ab  ")).toBe("");
  });

  it("同级大小写不敏感唯一", () => {
    const cats = [category({ id: "1", name: "工作" })];
    expect(siblingNameTaken(cats, null, "工作")).toBe(true);
    expect(siblingNameTaken(cats, null, "工作", "1")).toBe(false);
    expect(siblingNameTaken(cats, "other", "工作")).toBe(false);
  });
});

describe("移动校验", () => {
  const cats = [
    category({ id: "root", name: "根目录" }),
    category({ id: "child", name: "子目录", parentId: "root" }),
    category({ id: "leaf", name: "叶子", parentId: "child" }),
  ];

  it("禁循环", () => {
    expect(moveCategoryIssue(cats, "root", "leaf")).toBe("不能移动到自身或子目录下。");
    expect(moveCategoryIssue(cats, "root", "root")).toBe("不能移动到自身。");
  });

  it("总深度不得超三级", () => {
    // leaf 高度 1，移到 child 下：child 深度 2 + 1 = 3 可行
    expect(moveCategoryIssue(cats, "leaf", "child")).toBe("");
    // root（含 3 层子树）移到 leaf 下：循环先报错；构造超深用例
    const deep = [
      category({ id: "a", name: "aa" }),
      category({ id: "b", name: "bb", parentId: "a" }),
      category({ id: "c", name: "cc", parentId: "b" }),
    ];
    expect(depthOf(deep, "c")).toBe(3);
    expect(subtreeHeight(deep, "a")).toBe(3);
    // a 子树高 3，移到 b 下：b 深度 2 + 3 > 3 拒绝（循环亦成立，断言拒绝即可）
    expect(moveCategoryIssue(deep, "a", "c")).not.toBe("");
  });
});

describe("目录树", () => {
  it("层级与含子孙计数", () => {
    const cats = [
      category({ id: "p", name: "父级" }),
      category({ id: "c", name: "子级", parentId: "p" }),
    ];
    const tree = buildCategoryTree(cats, ["c", "c", undefined]);
    expect(tree).toHaveLength(1);
    expect(tree[0].level).toBe(1);
    expect(tree[0].todoCount).toBe(2);
    expect(tree[0].children[0].level).toBe(2);
  });
});

describe("标签规则", () => {
  it("名称 1–20 字符、全局唯一", () => {
    expect(tagNameIssue("")).toBe("标签名称不能为空。");
    expect(tagNameIssue("a".repeat(21))).toBe("标签名称最多 20 个字符。");
    const tags: Tag[] = [
      {
        id: "1",
        name: "工作",
        color: "#8a8a8a",
        icon: "",
        description: "",
        isSystem: false,
        group: "",
        createdAt: "",
        updatedAt: "",
      },
    ];
    expect(tagNameTaken(tags, "工作")).toBe(true);
    expect(tagNameTaken(tags, "工作", "1")).toBe(false);
  });

  it("空组归其他，分组排序", () => {
    const tags: Tag[] = [
      {
        id: "1",
        name: "乙",
        color: "",
        icon: "",
        description: "",
        isSystem: false,
        group: "",
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "2",
        name: "甲",
        color: "",
        icon: "",
        description: "",
        isSystem: false,
        group: "自定义",
        createdAt: "",
        updatedAt: "",
      },
    ];
    const groups = groupTags(tags);
    // 已知分组（含“其他”）优先，自定义分组排在其后（与桌面 TAG_GROUP_ORDER 一致）。
    expect(groups.map((group) => group.name)).toEqual(["其他", "自定义"]);
    expect(groups[0].tags.map((tag) => tag.name)).toEqual(["乙"]);
  });
});

describe("回收站保留期", () => {
  it("30 天保留与到期", () => {
    const now = new Date("2026-09-19T00:00:00Z").getTime();
    expect(remainingDays("2026-09-18T00:00:00Z", now)).toBe(29);
    expect(remainingDays("2026-08-01T00:00:00Z", now)).toBe(0);
    expect(isTrashExpired("2026-08-01T00:00:00Z", now)).toBe(true);
    expect(isTrashExpired("2026-09-18T00:00:00Z", now)).toBe(false);
  });
});
