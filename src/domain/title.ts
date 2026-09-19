/**
 * 标题派生（设计文档 §4.1、§5.2）：无独立标题输入，从前 50 行首个可见行剥离
 * Markdown，最多 80 码点，超长取 79 加省略号。
 * 由桌面端 src/utils/markdown.ts 逐字移植（含单测语义）。
 */

/** 派生标题的最大字符数：远低于后端 MAX_TITLE_LEN=1000，仅控制列表/标题栏展示宽度。 */
export const DERIVED_TITLE_MAX_CHARS = 80;

/** 只扫描开头的若干行寻找非空行，避免为超长文档做全量 split。 */
const MAX_LINES_SCANNED = 50;

/**
 * 剥离单行文本中的 Markdown 标记，返回纯文本。
 *
 * 覆盖块级前缀（标题 #、引用 >、任务勾选、有序/无序列表，允许叠加）
 * 与常见行内标记（强调、删除线、行内代码、链接/图片保留可见文本）。
 */
export function stripMarkdown(line: string): string {
  let text = line.trim();

  // 分隔线（--- /*** /_* * *）整行是标记，没有可展示的文本
  if (/^ {0,3}(?:[-*_][ \t]*){3,}$/.test(text)) return "";

  // 清空内容时编辑器可能序列化出 <br> 残留（含转义形式 \<br />），不是可展示文本
  text = text.replace(/\\?<br\s*\/?>/gi, "");

  for (;;) {
    const next = text
      // ATX 标题：剥离前缀井号与可选的闭合井号序列（## 标题 ## -> 标题）
      .replace(/^#{1,6}\s+([^\s].*?)(?:\s+#{1,6})?\s*$/, "$1")
      .replace(/^>\s?/, "")
      .replace(/^[-*+]\s+\[[ xX]\]\s+/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+[.)]\s+\[[ xX]\]\s+/, "")
      .replace(/^\d+[.)]\s+/, "");
    if (next === text) break;
    text = next;
  }

  text = text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`([^`]*)`/g, "$1");
  // 下划线强调只在两侧不紧邻单词字符时才视为标记（保留 snake_case 文本）
  text = text.replace(/(^|[^\w])_{1,3}([^_]+?)_{1,3}(?=[^\w]|$)/g, "$1$2");

  return text.trim();
}

/** 从正文中派生标题：第一个非空行剥离 Markdown 后的纯文本，超长时截断加省略号。 */
export function deriveTitle(body: string): string {
  let count = 0;
  for (const line of body.split(/\r?\n/)) {
    if (count >= MAX_LINES_SCANNED) break;
    count += 1;
    if (line.trim() === "") continue;
    const text = stripMarkdown(line);
    // 行内只有标记（分隔线、<br> 残留等）时继续向后找真正的文本行
    if (text === "") continue;
    const chars = [...text];
    if (chars.length <= DERIVED_TITLE_MAX_CHARS) return text;
    return `${chars.slice(0, DERIVED_TITLE_MAX_CHARS - 1).join("")}…`;
  }
  return "";
}
