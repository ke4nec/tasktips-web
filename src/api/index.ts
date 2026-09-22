import { HTTP_API_MODE } from "./mode";
import { HttpApi } from "./http";
import { MockApi } from "./mock";
import type { ApiPort } from "./port";

// 后端选择：开发默认 Mock，生产默认 HTTP。
// 联调时 VITE_API_MODE=http。HttpApi 的 access token 由 session store 经 setTokenProvider 注入。
let tokenProvider: () => string | null = () => null;

export function setTokenProvider(provider: () => string | null) {
  tokenProvider = provider;
}

function createApi(): ApiPort {
  if (HTTP_API_MODE) {
    return new HttpApi("", () => tokenProvider());
  }
  return new MockApi();
}

export const api: ApiPort = createApi();
export { MockApi };
