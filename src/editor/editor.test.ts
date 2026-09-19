import { beforeEach, describe, expect, it, vi } from "vitest";

import { validateImageFile, altFromFileName, imagePath, isLocalImageSrc } from "@/editor/images";
import { EditorSession } from "@/editor/session";

function pngFile(size = 100): File {
  const head = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const body = new Uint8Array(size);
  body.set(head);
  return new File([body], "shot.png", { type: "image/png" });
}

describe("图片校验", () => {
  it("合法 PNG 通过并派生路径", async () => {
    const { ext } = await validateImageFile(pngFile());
    expect(ext).toBe("png");
    expect(imagePath(ext)).toMatch(/^images\/[0-9A-Z]{26}\.png$/);
    expect(isLocalImageSrc(imagePath("jpg"))).toBe(true);
  });

  it("SVG 与超限拒绝", async () => {
    const svg = new File(["<svg></svg>"], "evil.svg", { type: "image/svg+xml" });
    await expect(validateImageFile(svg)).rejects.toThrow("SVG");
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
    await expect(validateImageFile(big)).rejects.toThrow("10 MiB");
  });

  it("魔数不符拒绝伪造扩展名", async () => {
    const fake = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], "fake.png", {
      type: "image/png",
    });
    await expect(validateImageFile(fake)).rejects.toThrow("无法识别");
  });

  it("alt 派生去扩展名限长", () => {
    expect(altFromFileName("工作台草图.png")).toBe("工作台草图");
    expect(altFromFileName("noext")).toBe("noext");
  });
});

describe("编辑会话", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  function create(initial = "hello") {
    const persisted: { text: string; seq: number }[] = [];
    const session = new EditorSession(initial, async (text, seq) => {
      persisted.push({ text, seq });
    });
    return { session, persisted };
  }

  it("相同内容不递增序号", () => {
    const { session } = create();
    session.setText("hello");
    expect(session.editSeq.value).toBe(0);
    session.setText("world");
    expect(session.editSeq.value).toBe(1);
  });

  it("连续输入合并撤销，跨窗口可连续撤销重做", () => {
    const { session } = create("a");
    session.setText("ab");
    session.setText("abc");
    expect(session.canUndo.value).toBe(true);
    expect(session.undo()).toBe(true);
    expect(session.text.value).toBe("a");
    expect(session.redo()).toBe(true);
    expect(session.text.value).toBe("abc");
    // 程序化回放后新输入清空重做栈
    session.undo();
    session.setText("ax");
    expect(session.canRedo.value).toBe(false);
  });

  it("旧回执不能确认新内容", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const session = new EditorSession("a", async () => {
      await gate;
    });
    session.setText("b");
    const first = session.flushPersist();
    session.setText("c");
    release();
    await first;
    await session.flushPersist();
    expect(session.getSavedSeq()).toBe(2);
    expect(session.saveState.value).toBe("saved");
  });

  it("停止输入 400ms 自动保存，失败保留草稿", async () => {
    const { session, persisted } = create();
    session.setText("draft");
    expect(session.saveState.value).toBe("dirty");
    await vi.advanceTimersByTimeAsync(400);
    expect(persisted).toHaveLength(1);
    expect(session.saveState.value).toBe("saved");

    const failing = new EditorSession("x", async () => {
      throw new Error("磁盘不足");
    });
    failing.setText("y");
    await vi.advanceTimersByTimeAsync(400);
    await failing.flushPersist();
    expect(failing.saveState.value).toBe("error");
    expect(failing.saveError.value).toBe("磁盘不足");
    expect(failing.text.value).toBe("y");
  });

  it("重做栈原地清空：记录不破坏 canRedo 响应性", () => {
    const { session } = create("a");
    session.setText("b");
    expect(session.undo()).toBe(true);
    expect(session.canRedo.value).toBe(true);
    // 程序化回放后新输入：重做失效但 canUndo 保持响应
    session.redo();
    session.setText("c");
    expect(session.canRedo.value).toBe(false);
    expect(session.canUndo.value).toBe(true);
  });

  it("新建首存重建会话时迁移历史", () => {
    const { session } = create("");
    session.setText("草稿");
    const next = new EditorSession("", async () => {});
    next.adoptHistory(session);
    next.setText("草稿追加");
    expect(next.undo()).toBe(true);
    expect(next.canRedo.value).toBe(true);
  });

  it("输入法组合期间延后切换", () => {
    const { session } = create();
    session.composing.value = true;
    expect(session.requestMode("split")).toBeNull();
    expect(session.finishComposing()).toBe("split");
    expect(session.requestMode("split")).toBe("split");
  });
});
