import { HttpApi } from "./http";
import { MockApi } from "./mock";
import type { ApiPort } from "./port";

// 后端选择：默认 mock（云端 Web 会话接口落地前，UI 与 E2E 全走 MockApi）。
// 联调时 VITE_API_MODE=http。HttpApi 的 access token 由 session store 经 setTokenProvider 注入。
let tokenProvider: () => string | null = () => null;

export function setTokenProvider(provider: () => string | null) {
  tokenProvider = provider;
}

function createApi(): ApiPort {
  if (import.meta.env.VITE_API_MODE === "http") {
    return new HttpApi("", () => tokenProvider());
  }
  return new MockApi();
}

export const api: ApiPort = createApi();
export { MockApi };
