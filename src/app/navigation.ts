// 登录成功后的回跳地址校验：只允许站内相对路径，防止开放重定向。
// 服务端不得记录认证请求正文；搜索词不写入 URL（§3.1），此处仅处理 redirect 参数。
export function safeRedirect(target: unknown, fallback = "/projects"): string {
  if (typeof target !== "string") return fallback;
  if (!target.startsWith("/") || target.startsWith("//") || target.includes("\\")) {
    return fallback;
  }
  return target;
}
