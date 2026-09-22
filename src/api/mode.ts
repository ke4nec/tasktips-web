// 开发默认 Mock；生产默认连接同源 API，可显式选择 Mock 演示构建。
export const HTTP_API_MODE =
  import.meta.env.VITE_API_MODE === "http" ||
  (import.meta.env.PROD && import.meta.env.VITE_API_MODE !== "mock");
