import { describe, expect, it } from "vitest";

import { MockApi, DEMO_EMAIL, DEMO_INVITATION_TOKEN, DEMO_PASSWORD } from "@/api/mock";
import { ApiError } from "@/api/types";
import { safeRedirect } from "@/app/navigation";
import { confirmPasswordIssue, isEmail, passwordIssue, requiredIssue } from "@/app/validation";

describe("表单校验", () => {
  it("邮箱格式", () => {
    expect(isEmail("user@example.com")).toBe(true);
    expect(isEmail("not-an-email")).toBe(false);
    expect(isEmail("")).toBe(false);
  });

  it("密码至少 12 字符（按码点计数）", () => {
    expect(passwordIssue("")).toBe("请输入密码。");
    expect(passwordIssue("short")).toBe("密码至少 12 个字符。");
    expect(passwordIssue("012345678901")).toBe("");
  });

  it("确认密码一致性", () => {
    expect(confirmPasswordIssue("abc", "")).toBe("请再次输入密码。");
    expect(confirmPasswordIssue("abc", "xyz")).toBe("两次输入的密码不一致。");
    expect(confirmPasswordIssue("abc", "abc")).toBe("");
  });

  it("必填项", () => {
    expect(requiredIssue("  ", "邀请凭据")).toBe("请输入邀请凭据。");
    expect(requiredIssue("x", "邀请凭据")).toBe("");
  });
});

describe("回跳地址校验", () => {
  it("站内路径放行，其他回退", () => {
    expect(safeRedirect("/p/demo/today")).toBe("/p/demo/today");
    expect(safeRedirect("https://evil.example/")).toBe("/projects");
    expect(safeRedirect("//evil.example/")).toBe("/projects");
    expect(safeRedirect("/\\evil")).toBe("/projects");
    expect(safeRedirect(undefined)).toBe("/projects");
  });
});

describe("MockApi 认证流程", () => {
  it("正确凭据登录并注册设备", async () => {
    const api = new MockApi();
    const result = await api.login({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      deviceId: "dev-1",
    });
    expect(result.account.email).toBe(DEMO_EMAIL);
    expect(result.accessToken).toBeTruthy();
    const device = await api.registerDevice({ deviceId: "dev-1", name: "此浏览器" });
    expect(device.platform).toBe("web");
    expect(await api.me()).toEqual({ email: DEMO_EMAIL });
  });

  it("错误密码报 INVALID_CREDENTIALS", async () => {
    const api = new MockApi();
    await expect(
      api.login({ email: DEMO_EMAIL, password: "wrong-password", deviceId: "dev-1" }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("有效邀请激活即获会话并自带默认项目", async () => {
    const api = new MockApi();
    const result = await api.activateInvitation({
      invitationToken: DEMO_INVITATION_TOKEN,
      password: "NewPassword123",
      deviceId: "dev-2",
    });
    expect(result.account.email).toBe("new@example.com");
    const projects = await api.listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe("我的任务");
  });

  it("重复使用邀请报 INVITATION_INVALID", async () => {
    const api = new MockApi();
    await api.activateInvitation({
      invitationToken: DEMO_INVITATION_TOKEN,
      password: "NewPassword123",
      deviceId: "dev-2",
    });
    await expect(
      api.activateInvitation({
        invitationToken: DEMO_INVITATION_TOKEN,
        password: "AnotherPassword123",
        deviceId: "dev-3",
      }),
    ).rejects.toMatchObject({ code: "INVITATION_INVALID" });
    // 重复激活不生成额外账号：未知邀请同样拒绝
    await expect(
      api.activateInvitation({
        invitationToken: "no-such-token",
        password: "AnotherPassword123",
        deviceId: "dev-3",
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("刷新仿真跨实例持久（对应 Cookie 语义）", async () => {
    const first = new MockApi();
    await first.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD, deviceId: "dev-1" });
    // 新实例 = 页面重新加载：内存态丢失，凭刷新仿真恢复
    const second = new MockApi();
    const refreshed = await second.refresh();
    expect(refreshed.account.email).toBe(DEMO_EMAIL);
  });

  it("注销幂等：重复注销同样成功", async () => {
    const api = new MockApi();
    await api.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD, deviceId: "dev-1" });
    await api.logout();
    await api.logout();
    await expect(api.me()).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
  });
});
