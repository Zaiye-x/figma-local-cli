# Figma Local CLI 实现基线

## 目标

为有 shell 权限的本地 Agent 提供 Figma 原生页面操作和设计资产交接。采用 Node.js 22+、本地 HTTP 服务、Figma 开发插件。核心运行时尽量使用 Node 内置模块；插件用 TypeScript 与官方 typings 校验后构建。

实现范围来自本次用户提出的目标；不包含具体业务产品的页面设计。真实 Figma 免费工作区连接和两屏 smoke 已通过，证据见 [验证记录](verification.md)。

## 方案选择

1. 官方 MCP：维护成本低，但免费读取额度不适合密集迭代；可选补充。
2. 成熟社区 MCP：功能多；已有客户端与资产格式可以接受时优先评估。
3. **本地 CLI + 插件：本次选择。** 与 Agent 客户端无关，不要求 PAT，聚焦连接、脚本执行、结构读取和交接。

## 协议与边界

CLI 通过 HTTP 提交任务，插件 UI 轮询本地桥接，通过 `postMessage` 将任务交给插件主线程。主线程调用官方 Plugin API 并回传 JSON。服务仅监听 `127.0.0.1:3055`；CLI 直连该地址，插件使用 `http://localhost:3055`，manifest 仅允许此开发域名。真实 Figma 的 manifest 校验不接受该 IP 字面量，因此必须保留此主机名区分。默认不访问外部资源。

每次服务启动生成不同的 CLI token、插件 token 和 instance ID，保存到 `.figma-local/session.json`（目录 0700 / 文件 0600）。`pair --copy` 将插件连接码复制到本机剪贴板，不在普通日志输出密钥。会话关闭清理凭据。

插件启动产生随机 session ID。绑定时保存 session ID、page ID 和服务 instance ID，避免重启后误用旧目标。普通开发插件不能稳定读取 fileKey，因此显示真实文件名、page ID、选区，由用户在桌面端确认；不声称完成云端 file key 身份验证。切换页面后写入拒绝执行，必须重新绑定。

任务状态：`queued → running → succeeded / failed / indeterminate`。排队超时表示没有分发；已分发任务超时表示结果不确定。插件断线、网络回包丢失或脚本报错后**不自动重放写任务**。同一插件一次运行一个任务。HTTP 层有认证、Host/Origin 校验、请求大小和任务数量上限；所有文件输出默认避免覆盖。

脚本是用户本地可信代码，能访问完整公开 Plugin API；`eval` 不是沙箱权限限制，不提供事务回滚。执行前核对目标并记录任务 ID。执行失败可能留下局部修改，读回确认后再决定如何处理。

## CLI

| 命令 | 输入 / 输出 |
|---|---|
| `serve` | 启动桥接；Ctrl-C 清理会话 |
| `pair --copy` | 复制短期连接信息，供插件粘贴 |
| `doctor` | 构建产物、本机环境、桥接、插件连接状态 |
| `sessions` | 列出当前连接的插件文件、页面、选区 |
| `bind <session-id>` | 将该实时会话和页面绑定为当前项目目标 |
| `inspect [node-id]` | 读取有深度/节点预算的结构，显式报告截断 |
| `eval <script.js>` | 在绑定页面上下文执行异步脚本，必须等待结果 |
| `screenshot <node-id> --out <file>` | 导出 PNG；可指定 SVG 格式作素材 |
| `extract --out <directory>` | 读取选区（无选区时当前页）；导出结构、变量、样式、组件资料和 token |
| `handoff --out <directory>` | 提取并附选区/顶层画框预览，生成 Agent 交接说明 |
| `job <id>` | 查询状态；不重放 |

未连接时必须给出可操作错误；不创建假的 Figma 文件或成功结果。`extract` 不自动认可设计：输出是候选资产。`handoff` 不生成特定框架产品，不代替前端运行验收。

## 数据与导出

快照包括文件/页面来源、节点树、Auto Layout、文本及混合样式分段、填充/描边、尺寸、圆角、effects、变量绑定、组件属性/变体、实例主组件引用、原型 reactions、截断标记。大页面通过指定节点分段读取。

导出目录：

- `snapshot.json`：原始读回数据，包含 collection 模式和 valuesByMode。
- `tokens/*.tokens.json`：每个 collection / mode 的 DTCG 子集；color 使用 2025.10 对象格式；FLOAT 默认 number，避免猜测单位。
- `tokens.css`：默认模式 CSS 自定义属性；保留别名，不静默展开或丢失跨 collection 引用。
- `token-index.json`：稳定 token 标识、原名、collection/mode 映射、支持程度。
- `candidates.json`：未绑定数值的使用频次与来源，标为待评审。
- `component-map.json`：组件 ID / key / variant 与代码映射空值；标为 `unmapped`，不会伪称 Code Connect。
- `design.md`：已提取信息与需要人工/Agent 判断的规范事项。
- `HANDOFF.md`：供 Agent 阅读的入口、复用规则和验收要求。
- `previews/`：PNG 或素材，附来源索引；没有真实导出就不生成占位图。

DTCG 基础类型不包含通用 string/boolean。通用 STRING/BOOLEAN 保存在 snapshot 和 token-index 并给出提示，不伪造为标准 token。遇到未知别名、循环引用、命名冲突时显式报告或终止，而不是生成看似正确的数据。第一版输出工具支持的标准子集，不宣称是通用 DTCG 编译器。

## 插件交互

采用简洁表单，沿用 Figma 的主题变量和系统字体：连接码、连接/断开按钮、文件名、页面名、状态和最后任务结果。输入有显式标签、可见焦点、错误文本、禁用/忙碌反馈。无外部字体、无素材请求。一次连接期间保持窗口打开。

接收 `postMessage` 时允许直接父窗口，以及来自 `https://www.figma.com` / `https://figma.com` 的官方宿主消息，以适配真实客户端的多层 sandbox；不接受任意外部 Origin。

## 验证

1. 构建和官方 Plugin API typings 检查。
2. HTTP 集成测试：未认证访问、错误 Origin/Host、离线会话、排队/执行/回包、目标变更、超时、不重放。
3. 导出测试：颜色透明度、别名、跨 collection 引用、模式、缺失依赖、特殊名称、混合样式/截断信息保留。
4. 浏览器验证插件 UI 连接和错误状态；明确它使用模拟的插件 host。
5. 真实 Figma smoke：连接后创建独立 Frame、组件实例、变量和两屏基础跳转；PNG + 结构读回。此项必须有真实桌面端执行证据。

## 后续扩展

实际需求出现后再加入：受控 token 回写、增量设计 diff、代码组件映射编辑命令、MCP 包装、与已有网页的 Code to canvas 辅助接入。现阶段不引入云端服务、账户管理、发布团队库或自动生产业务代码。

## 实现状态

2026-10-04 已实现本基线内的 CLI 命令、服务、开发插件与交接导出；具体用法见 [README](../README.md)，实测证据见 [验证记录](verification.md)。14 项自动测试、模拟 host 浏览器回归、真实免费工作区 smoke 均通过。`examples/frontend-smoke` 进一步验证真实交接包 → HTML 前端 → Playwright 验收，不改变 CLI 只提供结构与资产交接的边界。

实现细化：DTCG token 路径显式包含模式命名空间，跨 collection 别名记录目标默认模式，避免合并模式文件时混淆引用。迟到结果记入 `lateResult`，保留原 `indeterminate` 状态；重复回包不释放其他正在执行的任务。插件连接采用直接按钮事件，以适应受限 iframe。
