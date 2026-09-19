import { beforeEach, describe, expect, it } from "vitest";

import { DEMO_EMAIL, DEMO_PASSWORD, MockApi } from "@/api/mock";

describe("设备与改密（Mock）", () => {
  let api: MockApi;
  beforeEach(() => {
    localStorage.clear();
    api = new MockApi();
  });

  it("设备注册/列表/重命名/撤销", async () => {
    await api.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD, deviceId: "dev-1" });
    await api.registerDevice({ deviceId: "dev-1", name: "此浏览器" });
    // 重复注册更新而非新增
    await api.registerDevice({ deviceId: "dev-1", name: "改名后" });
    const devices = await api.listDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0].platform).toBe("web");
    const renamed = await api.renameDevice("dev-1", "主力机");
    expect(renamed.name).toBe("主力机");
    await expect(api.renameDevice("dev-1", "   ")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("撤销其他设备保留会话，撤销本机退出", async () => {
    await api.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD, deviceId: "dev-1" });
    await api.registerDevice({ deviceId: "dev-1", name: "本机" });
    await api.registerDevice({ deviceId: "dev-2", name: "备用机" });
    await api.revokeDevice("dev-2");
    expect((await api.listDevices()).map((device) => device.id)).toEqual(["dev-1"]);
    // 本机设备 id 经 device-id 键解析：直接以 dev-1 撤销需先写入该键
    localStorage.setItem("tasktips:device-id:other", "dev-1");
    await api.revokeDevice("dev-1");
    await expect(api.me()).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
  });

  it("改密后会话失效，需新密码登录", async () => {
    await api.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD, deviceId: "dev-1" });
    await expect(
      api.changePassword({ currentPassword: "wrong", newPassword: "NewPassword123" }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await api.changePassword({ currentPassword: DEMO_PASSWORD, newPassword: "NewPassword123" });
    await expect(api.me()).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
    const result = await api.login({
      email: DEMO_EMAIL,
      password: "NewPassword123",
      deviceId: "dev-1",
    });
    expect(result.account.email).toBe(DEMO_EMAIL);
  });
});
