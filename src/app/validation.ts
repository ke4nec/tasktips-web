// 表单校验（设计文档 §8.1：邀请凭据、新密码至少 12 字符、邮箱由邀请绑定）。
export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function passwordIssue(password: string): string {
  if (!password) return "请输入密码。";
  if ([...password].length < 12) return "密码至少 12 个字符。";
  return "";
}

export function confirmPasswordIssue(password: string, confirm: string): string {
  if (!confirm) return "请再次输入密码。";
  if (password !== confirm) return "两次输入的密码不一致。";
  return "";
}

export function requiredIssue(value: string, label: string): string {
  return value.trim() ? "" : `请输入${label}。`;
}
