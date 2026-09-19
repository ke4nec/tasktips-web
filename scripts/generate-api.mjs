/* 从兄弟后端契约生成 TypeScript 类型（设计文档 §11.1）。
 *
 * 用法：npm run generate:api
 * 契约来源：../tasktips-cloud/contracts/openapi.yaml（CI 显式获取对应版本，
 * 不假设构建机器天然存在兄弟目录，可用 TASKTIPS_CLOUD_CONTRACT 覆盖路径）。
 * 在 Web 会话接口（§8.2）落地前，该契约尚无 /api/v1/web/auth/*，
 * 此时生成占位声明并退出 0，保证脚手架与 CI 可用；契约就绪后输出真实类型。
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contract =
  process.env.TASKTIPS_CLOUD_CONTRACT ?? resolve(root, "../tasktips-cloud/contracts/openapi.yaml");
const outFile = resolve(root, "src/api/schema.d.ts");

const placeholder = `/* 由 scripts/generate-api.mjs 生成的占位声明。
 * 原因：兄弟后端契约中尚无 Web 会话接口（/api/v1/web/auth/*）。
 * 契约就绪后重新执行 npm run generate:api 即可输出真实类型。
 */
export {};
`;

if (!existsSync(contract)) {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, placeholder);
  console.warn(`[generate:api] 未找到契约文件，已写入占位声明：${contract}`);
  process.exit(0);
}

if (!existsSync(contract)) {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, placeholder);
  console.warn(`[generate:api] 未找到契约文件，已写入占位声明：${contract}`);
  process.exit(0);
}

// 经由官方 CLI 生成，避免直接依赖其编程式 API 的版本差异。
mkdirSync(dirname(outFile), { recursive: true });
const result = spawnSync(
  "npx",
  ["--no-install", "openapi-typescript", contract, "--output", outFile],
  { stdio: "inherit" },
);
if (result.status !== 0) {
  console.error("[generate:api] 生成失败，写入占位声明以保持构建可用。");
  writeFileSync(outFile, placeholder);
  process.exit(result.status ?? 1);
}
console.log(`[generate:api] 已生成：${outFile}`);
