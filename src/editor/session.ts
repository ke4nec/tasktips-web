import { computed, reactive, ref } from "vue";

export type EditorMode = "instant" | "split";

export interface EditorPrefs {
  mode: EditorMode;
  ratio: number;
  syncScroll: boolean;
}

export const EDITOR_PREFS_KEY = "tasktips:editor-prefs";

const DEFAULT_PREFS: EditorPrefs = { mode: "instant", ratio: 50, syncScroll: true };

export function loadPrefs(): EditorPrefs {
  try {
    const raw = localStorage.getItem(EDITOR_PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<EditorPrefs>;
    return {
      mode: parsed.mode === "split" ? "split" : "instant",
      ratio: typeof parsed.ratio === "number" ? Math.min(70, Math.max(30, parsed.ratio)) : 50,
      syncScroll: parsed.syncScroll !== false,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: EditorPrefs) {
  try {
    localStorage.setItem(EDITOR_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // 忽略
  }
}

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const COALESCE_WINDOW_MS = 1500;
const AUTOSAVE_IDLE_MS = 400;
const AUTOSAVE_MAX_MS = 2000;
const UNDO_LIMIT = 100;

// 双模式共享编辑会话（设计文档 §5.2）：唯一正文权威、公共撤销栈、
// 编辑序号绑定保存回执。Milkdown 与 CodeMirror 仅为输入适配器。
export class EditorSession {
  readonly text = ref("");
  readonly editSeq = ref(0);
  readonly saveState = ref<SaveState>("idle");
  readonly saveError = ref("");

  readonly composing = ref(false);
  readonly queuedMode = ref<EditorMode | null>(null);

  // 裸实例（shallowRef 持有）内部仍需响应式：栈与序号用 reactive/ref，
  // 否则 canUndo/canRedo/dirty 等 computed 永不失效。
  readonly modeState = reactive<Record<EditorMode, { scrollRatio: number }>>({
    instant: { scrollRatio: 0 },
    split: { scrollRatio: 0 },
  });

  private savedSeq = ref(0);
  private undoStack = reactive<string[]>([]);
  private redoStack: string[] = reactive<string[]>([]);
  private lastPushAt = 0;
  private persistTimer: ReturnType<typeof setTimeout> | undefined;
  private maxTimer: ReturnType<typeof setTimeout> | undefined;
  private saveChain: Promise<void> = Promise.resolve();

  readonly canUndo = computed(() => this.undoStack.length > 0);
  readonly canRedo = computed(() => this.redoStack.length > 0);
  readonly dirty = computed(() => this.editSeq.value !== this.savedSeq.value);

  constructor(
    initial: string,
    private readonly persist: (text: string, editSeq: number) => Promise<void>,
  ) {
    this.text.value = initial;
  }

  getSavedSeq(): number {
    return this.savedSeq.value;
  }

  // 新建任务首存落库触发的会话重建时迁移历史（同一次编辑会话，§5.2）。
  // 原地 push 保持 reactive 代理，不重赋值。
  adoptHistory(source: EditorSession) {
    this.undoStack.push(...source.undoStack);
    while (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack.push(...source.redoStack);
    this.lastPushAt = source.lastPushAt;
  }

  // 记录变更：连续输入按事务合并（窗口内复用同一快照），模式切换不入栈。
  setText(next: string, record = true) {
    if (next === this.text.value) return;
    if (record) {
      const now = Date.now();
      if (this.undoStack.length === 0 || now - this.lastPushAt > COALESCE_WINDOW_MS) {
        this.undoStack.push(this.text.value);
        if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
        this.lastPushAt = now;
      }
      // 原地清空：重赋值会丢掉 reactive 代理，使 canRedo 永不失效（P4 联调实锤）。
      this.redoStack.length = 0;
    }
    this.text.value = next;
    this.editSeq.value += 1;
    if (this.saveState.value === "saved" || this.saveState.value === "idle") {
      this.saveState.value = "dirty";
    }
    this.schedulePersist();
  }

  // 程序化回放不再次入栈（§5.2）。
  undo(): boolean {
    const previous = this.undoStack.pop();
    if (previous === undefined) return false;
    this.redoStack.push(this.text.value);
    this.text.value = previous;
    this.editSeq.value += 1;
    this.saveState.value = "dirty";
    this.schedulePersist();
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (next === undefined) return false;
    this.undoStack.push(this.text.value);
    this.text.value = next;
    this.editSeq.value += 1;
    this.saveState.value = "dirty";
    this.schedulePersist();
    return true;
  }

  setComposing(value: boolean) {
    this.composing.value = value;
  }

  // 中文输入法 composing 期间延后切换（§5.2）。
  requestMode(mode: EditorMode): EditorMode | null {
    if (this.composing.value) {
      this.queuedMode.value = mode;
      return null;
    }
    return mode;
  }

  finishComposing(): EditorMode | null {
    this.composing.value = false;
    const queued = this.queuedMode.value;
    this.queuedMode.value = null;
    return queued;
  }

  private schedulePersist() {
    if (this.saveState.value !== "saving") this.saveState.value = "dirty";
    clearTimeout(this.persistTimer);
    // 连续输入最长 2 秒持久化一次（§5.3）。
    if (this.maxTimer === undefined) {
      this.maxTimer = setTimeout(() => {
        this.maxTimer = undefined;
        void this.flushPersist();
      }, AUTOSAVE_MAX_MS);
    }
    this.persistTimer = setTimeout(() => {
      void this.flushPersist();
    }, AUTOSAVE_IDLE_MS);
  }

  // 每次保存绑定编辑序号，同任务串行执行；旧回执只确认对应序号（§5.3）。
  flushPersist(): Promise<void> {
    clearTimeout(this.persistTimer);
    if (this.maxTimer !== undefined) {
      clearTimeout(this.maxTimer);
      this.maxTimer = undefined;
    }
    const run = async () => {
      if (this.editSeq.value === this.savedSeq.value) {
        if (this.saveState.value === "dirty") this.saveState.value = "saved";
        return;
      }
      const seq = this.editSeq.value;
      const text = this.text.value;
      this.saveState.value = "saving";
      try {
        await this.persist(text, seq);
        // 旧回执不能把后续输入标记为已保存。
        if (this.editSeq.value === seq) {
          this.savedSeq.value = seq;
          this.saveState.value = "saved";
        }
      } catch (error) {
        this.saveState.value = "error";
        this.saveError.value = error instanceof Error ? error.message : "保存失败";
      }
    };
    this.saveChain = this.saveChain.then(run, run);
    return this.saveChain;
  }
}
