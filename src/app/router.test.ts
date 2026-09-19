import { describe, expect, it } from "vitest";

import { router } from "@/app/router";

describe("应用路由基座", () => {
  it("base 下的 / 即线上 /app/ 首页", () => {
    const route = router.resolve("/");
    expect(route.name).toBe("home");
    expect(route.path).toBe("/");
  });

  it("未知路径进入 not-found", () => {
    const route = router.resolve("/does-not-exist");
    expect(route.name).toBe("not-found");
  });
});
