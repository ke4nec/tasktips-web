# TaskTips Web

普通用户浏览器客户端：受邀注册、登录即用、离线记录、多端接续。产品与前端设计见
`docs/tasktips-web-design.md`，HTML 交互稿见 `design/`（`design/README.md`）。

> 当前状态：全部阶段交付（P0–P8）。Web 会话接口与云端 sync/history/snapshot
> 仍走 Mock（云端落地后替换为 HTTP），其余功能完整可用。
> 验收矩阵与已知限制见本文末尾。

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
  app/          路由（与 §3.1 路由表对应）与视图定义
  pages/        路由页面（P1 为布局占位，业务页 P2 起接入）
  components/   手写基础组件：AppIcon/IconButton/AppDialog/AppToast/EmptyState/ThemeSwitcher
  components/layout/  应用壳：AppShell/AppSidebar/AppTopbar/CommandPalette/ShellHost
  components/list/    任务行/筛选/排序弹层/取色器
  domain/       纯领域规则：标题派生/日期/色板/查询排序/分类校验（桌面端直译 + §4）
  content/      内容仓储抽象 + Dexie 实现 + demo 种子 + 快照/恢复副本/图片二进制
  editor/       双模式会话/自动保存/图片校验、Milkdown 即时与只读预览、CodeMirror 源码
  sync/         同步引擎（状态机/冲突/退避/锁与广播）+ 字节序列化 + Mock 服务端
  components/sync/  冲突处理视图
  components/settings/  外观与编辑/账号与安全/登录设备/存储与备份四分区
  backup/       ZIP 备份导出与导入（兼容移动端 formatVersion: 1）
  stores/       Pinia：theme/session/ui/project/todos（查询状态）/classification（分类与回收站）
  styles/       base.css + theme.css（设计令牌）+ components.css（产品组件样式，类名对齐设计稿）
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
npm run test:e2e  # Playwright 端到端（自动拉起 dev 服务器，需先 npx playwright install chromium）
npm run generate:api  # 从兄弟后端契约生成 src/api/schema.d.ts
```

说明：

- `vite.config.ts` 将 `/api` 代理到 `http://127.0.0.1:18080`（本地云端 API），生产由同源反代承载。
- 应用部署在 `/app/`，根路径 `/` 重定向 `/app/`（设计文档 §3.1、§11.2）。
- 后端模式：默认 `MockApi`（内存 + localStorage 刷新仿真）；
  联调时 `VITE_API_MODE=http npm run dev` 切换真实 fetch。
  Mock 预置账号 `demo@example.com / Demo12345678`、邀请 `demo-invitation-token`，仅 dev/E2E。
- access token 仅存内存；设备 ID 按浏览器安装及账号隔离（`tasktips:device-id:<email>`）。
- `generate:api` 默认读取 `../tasktips-cloud/contracts/openapi.yaml`，
  可用 `TASKTIPS_CLOUD_CONTRACT=/path/to/openapi.yaml` 覆盖。
  Web 会话接口契约（§8.2 的 4 个 Cookie 接口）已由 tasktips-cloud 提供，
  `generate:api` 将其纳入 `src/api/schema.d.ts` 类型。

## 测试

- 单元/组件：`src/**/*.test.ts`，`npm run test`。
- 端到端：`tests/e2e/*.spec.ts`，`npm run test:e2e`。
- 当前验收：完整路由表与守卫、主题持久化与跟随系统、移动端抽屉、命令面板导航、
  弹层焦点归还（设计稿动效对齐：弹层/Toast/抽屉/主题过渡/骨架呼吸）。
- P2 验收：登录/错误密码、邀请预填与激活、无效邀请拒绝、密码规则、新建/重命名项目、
  智能入口（上次项目/单项目直入）、退出清理。
- P3 验收：视图谓词/搜索/标签目录筛选/默认显式自定义排序、同批删除恢复/同名冲突/
  标签软删与重命名 propagation、三级目录校验、回收站 30 天（单测 104 + e2e 20）。
- 注意：认证 Mock 经刷新仿真跨页恢复会话，内容仓储由 Dexie 持久化；
  E2E 覆盖整页刷新后内容保留。
- P5 验收：命名空间隔离、同库新实例读取、事务回滚（非法快照不动现状）、
  恢复副本上限保留、图片记录存取。
- P6 验收：首次上传/增量拉取、双端编辑冲突与双向解决、远端删除冲突、墓碑跨端、
  幂等重试、单项拒绝、代次重建、退避与维护暂停、任务编辑锁只读。
- P6 边界：回收站本地保留不上传；分栏同步滚动为比例映射；MockSyncServer 替代真实云端。
- P7 验收：历史分页与只读版本、快照创建/恢复轮询/取消/重新接入、ZIP 往返与非法拒绝、
  改密清会话、设备改名撤销（含本机）、存储占用与恢复副本（单测 156 + e2e 35）。
- P7 待办（P8 联调）：历史/快照/恢复 HTTP 化、备份导出后退出选项、CSP/部署。
- P4 验收：即时↔分栏内容一致、跨模式撤销重做、输入法组合延后切换、400ms/2s 自动保存
  与序号回执、图片魔数校验与 Blob 展示、元数据与完成切换（单测 115 + e2e 25）。
- 已知债务：分栏同步滚动为比例映射（设计稿行为），正式块映射待 P8 前补齐；
  预览与即时共用 Milkdown 管线，语法与安全规则一致。

## 部署

生产部署见 `deploy/`：`Caddyfile.example`（推荐，反代+安全头）、`nginx.conf` 与
`Dockerfile.web`（备选）。要点（设计文档 §11.2）：

- 应用部署在 `/app/`，根路径 `/` 重定向 `/app/`；history fallback 仅限 `/app/` 内。
- 生产要求 HTTPS；`TASKTIPS_WEB_ORIGIN` 与浏览器实际 origin 一致。
- Service Worker 注册在 `/app/`，只缓存版本化应用外壳（发版递增 `public/sw.js`
  的 `CACHE_VERSION`），不缓存认证响应、API 响应与带凭据下载。
- CSP 经反代下发（`script-src 'self'` + 内联主题引导哈希，见示例文件注释）；
  Milkdown/CodeMirror 运行时样式需要 `style-src 'unsafe-inline'`（已在示例中权衡注明）。
- 新版本下载后提示用户刷新（先完成本地保存），不在输入中自动 reload。

## 验收矩阵（设计文档 §12.1 落点）

- 邀请/登录/项目空间/智能入口/退出清理：单测 + `auth.spec.ts`。
- 主题持久化、抽屉导航、命令面板：`shell.spec.ts`。
- 查询/筛选/排序/拖拽、目录标签生命周期、回收站 30 天：`workbench.spec.ts` + 领域单测。
- 双模式编辑、跨模式撤销、自动保存、图片、元数据：`editor.spec.ts` + 会话单测。
- 同步全链路（bootstrap/增量/冲突双向/墓碑/幂等/拒绝/代次/退避/维护）：引擎单测 12 项。
- 历史/快照/恢复/ZIP/改密/设备/存储：`settings.spec.ts` + 单测。
- 性能：千条查询 P95 <100ms（`queryPerf.test.ts`，node 实测）；平直大列表虚拟化。
- 多标签页任务锁：单测 + 探测跳过（headless-shell 不实现跨页互斥，真机手动验证）。

## 已知阻塞依赖与限制

- 4 个 Web 会话 Cookie 接口（`POST /api/v1/web/auth/*`）已在 `tasktips-cloud` 落地
  （`login/invitations/activate/refresh/logout`，Cookie `tasktips_web_refresh` +
  `TASKTIPS_WEB_ORIGIN` Origin 校验 + `no-store`，集成测试见其
  `crates/api/tests/web_auth.rs`）。`HttpApi` 已对接，`VITE_API_MODE=http npm run dev`
  联调前需设置 `TASKTIPS_WEB_ORIGIN=http://127.0.0.1:5174`。
- 云端 sync/history/snapshot 的浏览器侧 HTTP 语义仍未落地：前端按契约 Mock 先行
  （`MockSyncServer`，状态经 localStorage 跨页持久），云端实现后替换。
- 业务接口（`/me`、`/devices`、`/projects`、改密）已有 HttpApi 实现待联调。
- 回收站本地保留不上传；分栏同步滚动为比例映射（正式块映射待补）；
  ZIP 超大空间不足、中文输入法真机组合键、焦点可见性需真机复核。
