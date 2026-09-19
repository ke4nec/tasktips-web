# TaskTips Web

普通用户浏览器客户端：受邀注册、登录即用、离线记录、多端接续。产品与前端设计见
`docs/tasktips-web-design.md`，HTML 交互稿见 `design/`（`design/README.md`）。

> 当前状态：P0 工程脚手架。正式业务功能按任务计划逐步接入，设计文档 §12.2 为实施顺序依据。

## 技术框架

| 层次     | 选型                                                                         |
| -------- | ---------------------------------------------------------------------------- |
| 界面     | Vue 3、TypeScript、Vue Router、Pinia（手写基础组件，无 UI 库，与桌面端对齐） |
| 构建     | Vite，开发端口 **5174**（避免与管理后台 5173 冲突）                          |
| 质量     | ESLint、Prettier、Vitest + Vue Test Utils + happy-dom、Playwright            |
| API 类型 | openapi-typescript 从兄弟后端 OpenAPI 生成（`npm run generate:api`）         |
| 后续阶段 | Dexie（IndexedDB）、Milkdown + CodeMirror 6、Service Worker（P4 起接入）     |

运行时：Node.js 22（见 `.nvmrc`）。依赖版本与桌面端对齐（Vue 3.5、Pinia 4、Vite 8、Vitest 4、TS 5.9），
锁文件 `package-lock.json` 已提交。例外：Vitest 钉在 `4.0.7`，
因 `4.1.10/4.1.11` 的 peer 元数据触发 npm 10 解析器 bug
（`Cannot read properties of null (reading 'edgesOut')`），待上游修复后再对齐。

## 目录结构

```text
src/
  app/          路由与应用级装配（完整路由表 P1 补齐）
  pages/        路由页面（业务页 P2 起接入）
  components/   手写基础组件（P1 起）
  styles/       base.css + theme.css（全量令牌 P1 从桌面端迁移）
  api/          生成的契约类型 schema.d.ts（gitignore，由 generate:api 生成）
  editor/       双模式编辑会话（P4）
  domain/       纯领域规则（P5，由桌面/移动端直译）
  application/  用例层（P5）
  storage/      Dexie 持久化（P5）
  sync/         同步引擎（P6）
tests/
  e2e/          Playwright 端到端
public/         静态资源（favicon 等）
scripts/        generate-api.mjs 等工程脚本
design/         HTML 设计稿基线（不格式化、不参与构建）
docs/           产品与前端设计文档
```

## 本地开发

需求：Node.js 22（`nvm use` 读取 `.nvmrc`）。

```bash
npm ci            # 安装依赖（CI 同样使用 npm ci）
npm run dev       # 启动开发服务器 http://127.0.0.1:5174/app/
npm run build     # 类型检查 + 生产构建
npm run preview   # 预览生产构建
npm run lint      # Prettier 检查 + ESLint
npm run format    # 自动格式化
npm run test      # Vitest 单测
npm run test:e2e  # Playwright 端到端（自动拉起 dev 服务器）
npm run generate:api  # 从兄弟后端契约生成 src/api/schema.d.ts
```

说明：

- `vite.config.ts` 将 `/api` 代理到 `http://127.0.0.1:18080`（本地云端 API），生产由同源反代承载。
- 应用部署在 `/app/`，根路径 `/` 重定向 `/app/`（设计文档 §3.1、§11.2）。
- `generate:api` 默认读取 `../tasktips-cloud/contracts/openapi.yaml`，
  可用 `TASKTIPS_CLOUD_CONTRACT=/path/to/openapi.yaml` 覆盖。
  Web 会话接口（§8.2 的 4 个 Cookie 接口）落地前输出占位声明，不阻塞构建。

## 测试

- 单元/组件：`src/**/*.test.ts`，`npm run test`。
- 端到端：`tests/e2e/*.spec.ts`，`npm run test:e2e`。
- 当前验收：路由基座（`/` → `/app/`、未知路径 not-found）、应用壳可访问。

## 已知阻塞依赖

云端 4 个 Web 会话接口（`POST /api/v1/web/auth/login`、
`POST /api/v1/web/auth/invitations/activate`、
`POST /api/v1/web/auth/refresh`、
`POST /api/v1/web/auth/logout`）在 `tasktips-cloud` 尚不存在。
前端按设计文档 §8.2 契约先行 Mock，云端实现后联调替换（见任务计划 P2）。
业务接口（`/me`、`/devices`、`/projects`、sync/history/snapshots/restores/payloads）复用现有实现。
