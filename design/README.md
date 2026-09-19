# TaskTips Web HTML 设计稿

从 [index.html](index.html) 开始浏览。共 24 个独立页面／状态稿及 1 个总览，覆盖 [产品与前端设计文档](../docs/tasktips-web-design.md#html-designs) 的所有页面。

## 预览

直接打开任意 HTML 即可使用；CSS、JavaScript 和图标都在本目录中，无 CDN 或构建依赖。也可以在仓库根目录运行：

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

打开 `http://127.0.0.1:8765/design/`。建议查看 1440×960、1024×768、390×844，以及浅色与深色主题。

底部工具条是评审界面，包含目录、主题、页面状态和设计文档链接，正式产品不包含此工具条。

## 页面索引

| 分组 | 页面 |
| --- | --- |
| 注册与进入 | [登录](login.html)、[邀请注册](register.html)、[项目选择](projects.html)、[初始化](onboarding.html) |
| 任务视图 | [今日](today.html)、[收件箱](inbox.html)、[即将到期](upcoming.html)、[全部任务](all.html)、[已完成](completed.html) |
| 编辑 | [即时编辑](editor.html)、[左右分栏编辑](editor-split.html) |
| 整理 | [目录管理](classification.html)、[标签与分组](tags.html)、[回收站](trash.html) |
| 同步与数据 | [同步](sync.html)、[冲突](conflicts.html)、[历史](history.html)、[快照](snapshots.html)、[恢复](restore.html) |
| 设置 | [外观与编辑](settings.html)、[账号与安全](account.html)、[设备](devices.html)、[存储与备份](storage.html) |
| 状态参考 | [空态、错误与反馈](states.html) |

每页通过 `design-document` 元信息和底部“设计说明”链接，关联文档第 14 节的独立锚点。文档第 3 节直接将产品路由关联到 HTML，子视图和弹层不要求实现为独立一级路由。

## 可体验的交互

- 页面导航、手机侧栏、明暗主题、搜索命令面板（Ctrl／Cmd+K）。
- 任务完成、搜索、分类／标签筛选、排序、筛选无结果。
- 即时／分栏切换、源码实时预览、会话撤销／重做、专注编辑、分隔条拖动、同步滚动及窄屏页签；详情内可标记完成、重新打开或返回列表。
- 登录与邀请表单校验、密码显示；表单提交只在设计稿页面间跳转。
- 分类新建／编辑／颜色／位置弹层，任务操作、回收站恢复与删除确认。
- 同步反馈、冲突对比与确认、只读历史、恢复进度和重新接入选择。
- 主题偏好、设备改名／撤销、改密确认、退出前处理未同步内容、备份与清理确认。

状态可从底部选择或通过 URL 固定，例如 `today.html?state=offline`、`editor.html?state=save-error`、`restore.html?state=restored`。分栏文件默认显示专注布局，可点击专注按钮恢复侧栏和列表。

## 演示边界

这是用于实现指引的视觉与交互原型，不是业务应用。只有主题、默认编辑偏好保存在带 `tasktips-design-` 前缀的本地存储中；不存储输入的密码，不调用后端，不改动其他项目数据。

任务和 CRUD 演示仅在当前页内存中反馈，刷新即恢复固定样例。同步、快照、设备、密码、ZIP 备份与恢复不执行真实业务操作。保存失败页的“导出正文”仅下载当前示例 Markdown。

轻量 Markdown 预览只示范常用语法；生产版必须换为文档指定的 Milkdown／CodeMirror 和完整 CommonMark／GFM 管线。原型使用比例同步滚动，正式版应采用正文块与预览节点映射。复杂选择区、完整撤销语义、拖拽排序、图片字节校验、存储事务与多标签页锁由正式实现完成，不能直接用演示脚本替代。

## 维护

交付时已使用 Chrome 检查全部页面在 1440、1024、390px 宽度下的布局，并检查明暗主题、双模式编辑、撤销／重做、筛选、表单、弹层及恢复取消流程。页面无整体横向溢出或脚本报错，本地页面链接与文档锚点已校验。表格、格式工具栏等区域在窄屏下允许内部滚动；这些检查不替代正式业务测试。

| 文件 | 职责 |
| --- | --- |
| `generate.py` | 页面结构、共享导航、固定样例；生成独立 HTML |
| `assets/design.css` | 品牌令牌、组件、明暗主题、响应式规则 |
| `assets/design.js` | 演示交互、弹层、编辑模式、状态切换 |
| `assets/favicon.svg` | 本地品牌图标 |

修改结构后，在仓库根目录执行 `python3 design/generate.py`。HTML 是交付产物，应一并提交；不要只改生成后的文件。无需 npm 安装。

视觉参考兄弟项目的 `tasktips/src/styles/theme.css`、`tasktips/design/settings.html` 及 `tasktips-mobile/design/android-mobile-ui.html`。业务含义以设计文档为准，HTML 决定视觉层级、组件组合和交互入口；变更应保持两者一致。
