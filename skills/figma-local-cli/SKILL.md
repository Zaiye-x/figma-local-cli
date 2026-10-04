---
name: figma-local-cli
description: 通过本地 CLI 和桌面插件操作可编辑的 Figma Design 文件。用户调用 /figma-local-cli，或要求连接、读取、创建、修改、导出、交接 Figma 设计时使用。不要用于纯网页浏览。
---

# Figma Local CLI

将当前安装的 `figma-local-cli` 命令所链接的源码仓库视为唯一权威源。可通过 `command -v figma-local-cli` 和该链接最终指向的 `src/cli.js` 定位仓库根目录；先阅读根目录的 `AGENTS.md` 和 `README.md`，再执行操作。

## 启动与连接

1. 运行 `figma-local-cli doctor` 检查构建、桌面端、桥接和在线会话。
2. 若桥接未运行，在持久终端启动 `figma-local-cli serve`，不要让必要的服务会话悬空。
3. 打开用户指定的可编辑 Figma Design 文件。操作桌面 UI 时使用对应的 Computer Use Skill。
4. 从 Figma 的 Development 菜单运行已导入的 **Figma Local CLI** 插件。
5. 运行 `figma-local-cli pair --copy`，只通过本机剪贴板把连接码粘贴到插件。不要读取、打印或发送 `.figma-local/session.json` 的凭据。
6. 运行 `figma-local-cli sessions`，核对文件名、页面和选区；再运行 `figma-local-cli bind <session-id>`。
7. 写入前运行 `figma-local-cli inspect` 或读取目标节点，确认作用范围。

Figma URL 只用于定位文件和 `node-id`，不能替代实时插件会话，也不能作为可靠的插件身份。切换 Page 后重新 `sessions` 和 `bind`；切换文件、插件重开或服务重启后重新配对。

## 设计与写入

- 没有具体业务需求时不要擅自设计产品。先明确用户旅程、页面、状态和验收标准。
- 只把本地可信脚本交给 `figma-local-cli eval`。字体先加载；组件引用和原型使用支持 dynamic-page 的异步 API。
- 修改已有页面前先读取目标。首次接入或能力验证只创建独立 smoke Section。
- 任务 ID 在 stderr，JSON 在 stdout。失败、网络错误或 `indeterminate` 后先运行 `figma-local-cli job <id>` 并检查画布，禁止自动重放写入。

## 提取与前端交接

- 提取到不存在的新目录，不覆盖已经补充的规范。
- 检查 `snapshot.json` 的 `source`、`scope` 和 `completeness`；截断时按节点分块。
- 将 `candidates.json` 作为待评审候选，将 `component-map.json` 作为本地代码映射，不称为官方 Code Connect。
- 前端开发从 `HANDOFF.md` 开始，复用已认可 token 和组件，补齐响应式、加载、空、错误和键盘状态，并用本机 Playwright 截图验收。
- 已有完整 handoff 且不需要实时读取或修改 Figma 时，不启动桥接和插件。

## 维护

CLI、桥接、插件和本 Skill 的权威源码都在 `figma-local-cli` 仓库。修改后运行：

```sh
cd <figma-local-cli-source>
npm run check
npm run install:global
```

`install:global` 更新全局 `figma-local-cli` 命令和当前 Skill。详细职责与排错见仓库的 `docs/global-installation.md`。
