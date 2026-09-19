import { describe, expect, it } from "vitest";

import { DERIVED_TITLE_MAX_CHARS, deriveTitle, stripMarkdown } from "@/domain/title";

describe("stripMarkdown", () => {
  it.each([
    ["# 标题", "标题"],
    ["###### 六级标题", "六级标题"],
    ["## 采购清单 ##", "采购清单"], // ATX 闭合井号一并剥离
    ["- [ ] 未完成事项", "未完成事项"],
    ["- [x] 已完成事项", "已完成事项"],
    ["1. 第一项", "第一项"],
    ["2) 第二项", "第二项"],
    ["> 引用内容", "引用内容"],
    ["> - [ ] 引用里的任务", "引用里的任务"],
    ["- 列表项", "列表项"],
    ["**粗体**", "粗体"],
    ["*斜体*", "斜体"],
    ["***粗斜体***", "粗斜体"],
    ["~~删除线~~", "删除线"],
    ["`代码`", "代码"],
    ["[链接文本](https://example.com)", "链接文本"],
    ["![图片描述](https://example.com/a.png)", "图片描述"],
    ["snake_case_name", "snake_case_name"],
    ["__强调__", "强调"],
    ["---", ""],
    ["纯文本", "纯文本"],
    ["<br>", ""],
    ["<br/>", ""],
    ["<br />", ""],
    ["\\<br />", ""],
  ])("%s -> %s", (input, expected) => {
    expect(stripMarkdown(input)).toBe(expected);
  });
});

describe("deriveTitle", () => {
  it("取第一个非空行并剥离标题标记", () => {
    expect(deriveTitle("# 周末采购\n\n- [ ] 牛奶")).toBe("周末采购");
  });

  it("跳过开头的空行", () => {
    expect(deriveTitle("\n\n## 计划\n正文")).toBe("计划");
  });

  it("空正文得到空标题（列表显示未命名 Todo）", () => {
    expect(deriveTitle("")).toBe("");
    expect(deriveTitle("\n\n")).toBe("");
  });

  it("超长首行截断并加省略号", () => {
    const title = deriveTitle("a".repeat(DERIVED_TITLE_MAX_CHARS + 10));
    expect([...title]).toHaveLength(DERIVED_TITLE_MAX_CHARS);
    expect(title.endsWith("…")).toBe(true);
  });

  it("CRLF 换行也能取到首行", () => {
    expect(deriveTitle("第一行\r\n第二行")).toBe("第一行");
  });

  it("清空内容残留的 br 标记不进入标题", () => {
    expect(deriveTitle("<br />")).toBe("");
    expect(deriveTitle("\\<br />\n<br />\n")).toBe("");
  });

  it("首行只有标记时继续向后取文本行", () => {
    expect(deriveTitle("<br />\n\n# 真正的标题")).toBe("真正的标题");
    expect(deriveTitle("---\n\n第一段文字")).toBe("第一段文字");
  });
});
