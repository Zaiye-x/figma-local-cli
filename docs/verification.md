# 验证记录

日期：2026-10-04。当前结论：**已在用户真实 Free 工作区的个人草稿中，完成 CLI 创建原生页面 → 原型点击 → 结构读回 → 设计资产提取 → 本地前端实现与浏览器验收。**

本次是工具能力的 smoke 验证；用户尚未提供具体业务产品需求，示例不代表业务设计或生产前端已获认可。

## 已验证

| 层级 | 证据 | 结果 |
|---|---|---|
| 构建 | `npm run check`，Node 24.20.0，TypeScript 5.9.3，Figma typings 1.140.0 | 通过；生成 `dist/plugin/manifest.json`、`main.js`、`ui.html` |
| HTTP 桥接 | `test/bridge.test.js` | 5 项测试通过：认证/Origin/Host、身份隔离、目标绑定、排队和执行、超时、不重复执行、迟到回包、请求预算 |
| 资产 | `test/assets.test.js` | 4 项测试通过：颜色透明度、模式与跨 collection 别名、循环与依赖错误、候选统计、结构保留、输出保护 |
| 插件逻辑 | `test/plugin.test.js` | 2 项测试通过：实际序列化函数、文本分段/混合值、实例引用、截断、构建后主线程的页面复核与脚本错误 |
| 浏览器 | `test/ui_smoke.py`，Python Playwright + 本机 Chromium headless shell 1243 | 通过；实际 UI、实际 HTTP 服务和实际 CLI 配合模拟 Figma host；含嵌套宿主回归 |
| 真实套餐 | Figma 桌面端 Drafts；[截图](../artifacts/real-20261004/free-workspace.jpg) | 当前 `design` 工作区显示 Free；实际草稿缩略图可见新建两屏 |
| 真实写入与读回 | [创建任务](../artifacts/real-20261004/create-job.json)、[Section 结构](../artifacts/real-20261004/section-inspect.json) | 两屏、一个组件与实例、两项变量、原型跳转均成功 |
| 真实资产 | [交接包](../artifacts/real-20261004/handoff/HANDOFF.md) | 10 个节点、2 个变量、1 个组件、3 张真实 PNG；无截断、无警告 |
| 前端闭环 | `test/frontend_smoke.py`；[实测指标](../artifacts/real-20261004/frontend-verification.json) | 复用实际 token/组件引用，点击、键盘、历史返回、刷新和 320px 布局通过 |

共 **14 项 Node 自动测试通过**。插件浏览器测试覆盖嵌套宿主消息、错误连接码、配对、CLI 派发与结果回传、断开、认证错误、深色主题、横向布局和脚本异常检查。它在独立测试服务中执行，不使用真实插件会话。

浏览器中发现并修复了受限 iframe 阻止表单提交的问题，连接改用按钮事件并支持回车。模拟测试页面明确标注“UI test · 模拟文件”，不作为 Figma 文件或账号证据。测试结束后已停止测试服务。

真实客户端中发现并修复两处模拟环境未覆盖的兼容问题：

1. `devAllowedDomains` 拒绝 `http://127.0.0.1:3055`。改用 `http://localhost:3055` 后导入成功；服务仍仅监听 IPv4 回环。
2. Figma 嵌套 sandbox 从外层官方宿主发送消息，原有 `event.source === parent` 校验丢弃上下文。保留直接父窗口，并接受精确 Figma 官方 Origin；增加本地路由构造的嵌套宿主测试。测试不会请求真实 figma.com 或使用登录态。

## 真实 Figma 证据

[打开 Design 草稿](https://www.figma.com/design/sGnWOnT2gBgxqk75b4JvJA/Untitled?node-id=2-5) · [打开可点原型](https://www.figma.com/proto/sGnWOnT2gBgxqk75b4JvJA/Untitled?page-id=0%3A1&node-id=2-6&starting-point-node-id=2%3A6)

| 对象 | 读回 ID / 内容 |
|---|---|
| 页面 / Section | `0:1` / `2:5`，`CLI Smoke · d239ffc0` |
| 两屏 | `2:6`（Start）、`2:7`（Complete），各 360×420 |
| 组件 / 实例 | `2:12` / `2:14`，`mainComponent.id = 2:12` |
| 变量 | `VariableID:2:3`（COLOR）、`VariableID:2:4`（FLOAT=24） |
| 绑定 | 按钮 fills → COLOR；画框 paddingLeft → FLOAT |
| 原型 | 实例 `ON_CLICK → NAVIGATE → 2:7` |
| 写任务 | `d239ffc0-3cce-4432-a492-7bdb2ce18006`，`succeeded` |
| 读回 / 提取任务 | `d6edec17-4087-46d2-afc5-7c01ac0b84c7` / `23d14497-fbab-4d92-b9d7-c1d27f890e30` |

首次写入前已通过 `sessions` 核对 `Untitled / Page 1`，`inspect` 确认空页。随后只执行了一次 `examples/smoke.js`。文件 key 来自真实桌面 UI URL，仅用于记录链接；插件绑定仍使用会话与页面 ID。

在 Figma Present 中点击了原型的 **Continue** 链接，观察到节点 URL 从 `2-6` 变为 `2-7`，内容变为 **Ready for handoff**。[点击前截图](../artifacts/real-20261004/prototype-start.jpg) · [点击后截图](../artifacts/real-20261004/prototype-complete.jpg)。

另外通过实际 `screenshot --format SVG` 导出[按钮矢量](../artifacts/real-20261004/button.svg)。独立 UI 回归结束后已恢复真实服务、重新配对与绑定，再读回原 Section：仍为 11 个节点（含 Section），没有重复创建。最终[环境检查](../artifacts/real-20261004/doctor.json)与[读回数据](../artifacts/real-20261004/final-inspect.json)已保存；原创建任务在重启前留存，后续服务不保留旧内存任务。

## 前端读取消费证据

按实际 `HANDOFF.md` 读取快照、token 索引与组件映射，以 `examples/frontend-smoke/build.mjs` 实现该两屏流程。[运行产物](../artifacts/real-20261004/frontend/index.html)复用原 `tokens.css`；本地组件映射记录在新前端目录，没有覆盖原始候选包，也没有创建官方 Code Connect。

- [Figma 原始 PNG](../artifacts/real-20261004/start.png)
- [浏览器 Start](../artifacts/real-20261004/web-start.png) · [Complete](../artifacts/real-20261004/web-complete.png) · [320px 窄屏](../artifacts/real-20261004/web-mobile-320.png)
- Frame 为 360×420；按钮相对位置为 (24,114)，高度 42，与读回一致。浏览器按钮宽 105.625px，Figma 为 107px；Inter 字体版本/渲染存在约 1.4px 偏差，未声称像素级一致。
- 触屏将操作目标补为至少 44px；跳转后焦点移至目标标题；支持 Tab/Enter、浏览器返回与 hash 刷新，无横向溢出或页面脚本异常。

这证明交接资料足以支持本地 Agent 开发这一真实流程。通用业务逻辑、响应式设计意图和状态仍须按具体产品需求设计，不能从图层自动推断。

## 浏览器截图

- [未连接](../artifacts/ui/01-disconnected.png)
- [连接码错误](../artifacts/ui/02-invalid-code.png)
- [连接与任务完成](../artifacts/ui/03-connected.png)
- [深色模式](../artifacts/ui/04-dark.png)
- [认证错误](../artifacts/ui/05-auth-error.png)

已人工查看连接成功与深色认证错误截图：标签、按钮、状态和文件上下文正常显示。截图由浏览器捕获，没有生成占位页面预览。`artifacts/` 默认不提交版本控制。

## 本次验证边界

未验证付费团队库发布、Starter 多模式、高级条件原型、跨文件批处理、超大文件和所有字体/图片组合。真实截图使用 Inter、基础 Auto Layout 与文件内资产。本次没有替用户定义业务产品，也未将候选规范宣称为已认可的完整设计系统。

## 后续文件的接入验收步骤

按 README 完成登录、导入、配对与绑定后：

```sh
node src/cli.js eval examples/smoke.js
node src/cli.js inspect <返回的section-id> --depth 10
node src/cli.js screenshot <返回的第一个frame-id> --out artifacts/real-smoke.png
node src/cli.js handoff --out artifacts/real-handoff
```

检查画布中独立 Section 的两屏、按钮组件及实例；在原型模式点击 Continue；核对快照中的节点类型、主组件 ID、变量绑定与 reactions，查看 PNG 和资产文件。遇到错误保留任务 ID，先查询 `job ID`，不直接重放脚本。

新文件仍需独立核对目标和结果；不能把本次草稿成功自动推广到任意文件。`doctor` 只报告环境与在线状态，并给出本记录路径。
