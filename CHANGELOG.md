# Changelog

本项目使用语义化版本号。发布版本以 `package.json`、Git tag 和 GitHub Release 为准。

## [Unreleased]

## [0.2.0] - 2026-10-05

向后兼容的功能版本。

### Added

- `scaffold --config <file>` 第一阶段：严格配置 Schema、跨 Page 只读上下文和确定性项目骨架计划。
- 三 Page 与显式单 Page 模式、空白 `Page 1` 采用、`--adopt-page`、Starter Page 上限和名称冲突检查。
- Scaffold Plugin Data 归属、旧 Schema 迁移阻断和重复执行幂等规划。
- 插件面板支持折叠与展开；折叠状态保留连接状态、任务轮询和结果反馈。
- README 增加工作流程、插件连接、真实 Figma Prototype 和前端交接图片。

### Safety

- Scaffold 默认只生成计划；`--apply` 明确拒绝，不执行真实 Figma 写入。
- 同名未归属对象、跨项目对象、非显式非空 Page 和冲突计划均不可执行。
- 插件面板折叠不会中断正在执行的操作，也不会自动重放任务。

### Validation

- TypeScript 与 Figma Plugin API typings 构建通过。
- 27 项 Node 自动测试通过。
- 插件模拟 host 回归覆盖连接、折叠/展开、隐藏状态轮询、错误状态和深色主题。
- 真实 Figma Free Draft 的既有创建、读回、Prototype 和 Handoff 验证证据保持有效。

## [0.1.0] - 2026-10-04

首个可用版本。

### Added

- 本地 `figma-local-cli` 命令和 Figma Development Plugin。
- `serve`、`pair`、`doctor`、`sessions`、`bind`、`inspect`、`eval`、`screenshot`、`extract`、`handoff` 和 `job` 命令。
- Page 绑定、任务队列、超时、迟到结果与写任务不自动重放。
- Figma 节点、Auto Layout、文本分段、变量、组件、实例和 Prototype reaction 读取。
- PNG / SVG 导出、DTCG Token 候选、组件映射和前端交接包。
- 全局命令与 `/figma-local-cli` Skill 安装脚本。
- Free / Starter 账号的 `3 + N` 项目组织规范设计。

### Security

- 服务仅监听 `127.0.0.1:3055`。
- CLI 与插件使用独立短期凭据。
- 校验 HTTP Host、Origin、角色和绑定目标。
- 会话凭据保存在权限为 `0600` 的本地忽略目录中。
- 写任务失败、断线或结果不确定时不会自动重放。

### Validation

- TypeScript 与 Figma Plugin API typings 构建通过。
- 14 项 Node 自动测试通过。
- 插件模拟 host 浏览器回归通过。
- 在真实 Figma Free Draft 完成创建、读回、截图、Prototype 和 Handoff 闭环。

### Known limitations

- 需要 Figma 桌面端保持 Development Plugin 打开。
- 切换 Page、文件、插件或服务实例后需要重新绑定或配对。
- `eval` 执行可信本地脚本，没有事务回滚。
- 不提供 Team Library、官方 Code Connect、云端账号服务或通用前端代码生成。
- Free / Starter 账号不支持 Dev Mode、团队库和 Variable Modes。
