# Repository Guidelines

## Project Structure & Module Organization

This repository is currently an empty Git repository. No application source, tests, assets, or dependency manifests exist yet. When scaffolding the project, document the chosen framework and directory layout in `README.md`. Keep application code, tests, and static assets in distinct locations appropriate to that framework; for example, `src/`, `tests/`, and `public/`. These are suggested locations, not existing directories.

## Build, Test, and Development Commands

No development, build, lint, or test commands are configured. Do not assume commands such as `npm test` work. When introducing tooling:

- Document dependency installation and local startup commands in `README.md`.
- Provide explicit commands for production builds, linting, and tests.
- Commit the appropriate dependency lockfile and specify required runtime versions.

Until tooling exists, use `git status --short` to review changed files and `git diff --check` to check tracked changes for whitespace errors.

## Coding Style & Naming Conventions

No language, formatter, or linter has been selected. Configure formatting and linting when adding the first implementation, and follow the chosen language's conventions. Keep indentation consistent within each file. Use descriptive names for files, functions, and variables, and group related functionality into focused modules. Avoid introducing competing formatting tools.

## Testing Guidelines

No test framework or coverage threshold is configured. Add tests alongside new application behavior once a framework is selected. Use descriptive test names that identify the behavior and expected result. Document test locations, filename patterns, and execution commands before relying on them in reviews or automation.

## Commit & Pull Request Guidelines

提交信息采用 `<type>: <中文说明>` 格式，可选范围使用 `<type>(<scope>): <中文说明>`。类型使用以下英文标识，标题说明及正文使用中文；代码标识符、路径和专有名词可保留原文。

- `feat`：新增功能。
- `fix`：修复缺陷。
- `docs`：文档变更。
- `style`：格式调整，不改变代码行为。
- `refactor`：代码重构，不新增功能或修复缺陷。
- `perf`：性能优化。
- `test`：新增或修改测试。
- `build`：构建流程或依赖变更。
- `ci`：持续集成配置变更。
- `chore`：其他维护工作。
- `revert`：撤销已有提交。

每次提交聚焦一个目的，说明简洁具体，例如 `feat: 添加任务创建功能`、`fix: 修复任务状态更新失败的问题`、`docs: 补充本地开发说明`。需要正文时，说明变更原因及影响。

Pull requests should explain the change, link relevant issues, and describe validation performed. Include screenshots for visible interface changes and disclose any checks that could not be run.

## Security & Configuration

Never commit credentials or local secrets. If environment configuration is introduced, provide an example file containing placeholders and ignore local secret files and generated artifacts.
