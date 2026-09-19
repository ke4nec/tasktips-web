// 本地图片：校验、命名与 Blob 注册（设计文档 §5.3）。
// P4 内存注册；P5 迁移到 Dexie 二进制存储 + 同步上传，保持 images/<ulid>.<ext> 命名。
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
};

const MAGIC: { ext: string; bytes: number[]; offset?: number }[] = [
  { ext: "png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
  { ext: "gif", bytes: [0x47, 0x49, 0x46] },
  { ext: "webp", bytes: [0x52, 0x49, 0x46, 0x46] },
  { ext: "bmp", bytes: [0x42, 0x4d] },
];

function isAllowedExt(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext);
}

function detectExt(head: Uint8Array): string | null {
  for (const entry of MAGIC) {
    const offset = entry.offset ?? 0;
    if (entry.bytes.every((byte, index) => head[offset + index] === byte)) {
      return entry.ext;
    }
  }
  return null;
}

/** 图片导入校验：文件头魔数 + 白名单，拒绝 SVG，单个 ≤10 MiB（§5.3）。 */
export async function validateImageFile(file: File): Promise<{ ext: string }> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("图片不能超过 10 MiB");
  }
  if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
    throw new Error("不支持 SVG 图片");
  }
  if (!file.type.startsWith("image/") && !isAllowedExt(file.name)) {
    throw new Error("仅支持 PNG、JPEG、GIF、WebP、BMP 图片");
  }
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const detected = detectExt(head);
  if (!detected) {
    throw new Error("无法识别的图片格式");
  }
  return { ext: EXTENSIONS[file.type] ?? detected };
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function newUlid(): string {
  let id = "";
  let time = Date.now();
  const timeChars = new Array(10);
  for (let i = 9; i >= 0; i--) {
    timeChars[i] = CROCKFORD[time % 32];
    time = Math.floor(time / 32);
  }
  id += timeChars.join("");
  const random = crypto.getRandomValues(new Uint8Array(16));
  for (let i = 0; i < 16; i++) id += CROCKFORD[random[i] % 32];
  return id;
}

export function imagePath(ext: string): string {
  return `images/${newUlid()}.${ext}`;
}

const ALT_MAX_CHARS = 60;

/** 从原始文件名派生 alt 文本（由桌面端 imageImport.ts 移植）。 */
export function altFromFileName(name: string): string {
  const withoutExt = name.replace(/\.[^.\\/]+$/, "");
  const collapsed = withoutExt.replace(/\s+/g, " ").trim();
  const chars = [...collapsed];
  if (chars.length <= ALT_MAX_CHARS) return collapsed;
  return `${chars.slice(0, ALT_MAX_CHARS - 1).join("")}…`;
}

// 内存 Blob 注册：Blob URL 展示本地图片，释放时回收（§5.3）。
const blobs = new Map<string, Blob>();
const urls = new Map<string, string>();

export function storeImageBlob(path: string, blob: Blob) {
  revokeImageUrl(path);
  blobs.set(path, blob);
}

export function imageObjectUrl(path: string): string | null {
  const cached = urls.get(path);
  if (cached) return cached;
  const blob = blobs.get(path);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(path, url);
  return url;
}

export function revokeImageUrl(path: string) {
  const url = urls.get(path);
  if (url) {
    URL.revokeObjectURL(url);
    urls.delete(path);
  }
}

export function isLocalImageSrc(src: string): boolean {
  return src.startsWith("images/") && !src.startsWith("images/http");
}

export function isExternalImageSrc(src: string): boolean {
  return /^(https?:|data:|blob:)/i.test(src);
}
