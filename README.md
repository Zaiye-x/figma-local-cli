# Figma Local CLI

让本地 Agent 通过 Figma 开发插件操作当前 Design 文件，并将页面结构、变量、组件资料和预览整理成可版本化的前端交接包。

<p align="center">
  <img src="docs/images/overview.svg" width="100%" alt="Figma Local CLI 工作流程：本地 Agent 经过本机桥接连接 Figma 插件，再导出版本化交接包">
</p>

**运行条件：macOS + Node.js 22+ + Figma 桌面端 + 当前文件的编辑权限。** 主路径不需要 Figma PAT，不调用官方 MCP，也不消耗 MCP 读取额度。

当前 Release：**`v0.2.0`**。真实 Free 工作区已经验证原生 Page、组件、实例、变量和可点击原型的创建、读回、资产提取与前端验收。构建、27 项自动测试和插件模拟 host 浏览器回归均通过。

| 能力 | 说明 |
|---|---|
| 连接 | 本机 HTTP 桥接 + Figma Development Plugin |
| 读取 | Page、Section、Frame、文本、Auto Layout、变量、组件和原型 |
| 写入 | 执行本地可信的异步 Plugin API 脚本 |
| 导出 | PNG、SVG、结构快照、DTCG Token 候选和前端交接包 |
| 安全 | 回环地址、短期凭据、目标绑定、任务状态和写入不自动重放 |

详细依据见 [架构](docs/architecture.md)、[验证记录](docs/verification.md)、[Free 账号项目规范](docs/superpowers/specs/2026-10-04-figma-free-project-convention-design.md)和 [CHANGELOG](CHANGELOG.md)。

## 先理解三个对象

Figma Local CLI 由三个协作对象组成，它们的安装方式和生命周期不同：

| 对象 | 作用 | 安装或运行位置 | 是否每个 Figma 文件重复安装 |
|---|---|---|---|
| Agent Skill | 告诉 Agent 如何安全操作 CLI | 全局 Skill 目录 | 否 |
| CLI 与本机桥接 | 提交任务、保存绑定、接收结果和导出资产 | 本地终端 | 否；使用时保持服务运行 |
| Figma 开发插件 | 在当前文件内调用公开 Plugin API | Figma 桌面端 | 通常只导入一次；每个文件都要运行和连接 |

**插件不是安装到某一个 Figma 项目里的。** 在同一台电脑的 Figma 桌面端导入一次后，可以从 Development 菜单在其他可编辑 Design 文件中运行。打开新文件时不需要再次导入 manifest，但需要重新运行插件、配对和绑定。

## 首次安装

### 1. 安装 CLI 和 Skill

```sh
git clone https://github.com/Zaiye-x/figma-local-cli.git
cd figma-local-cli
npm ci
npm run check
npm run install:global
```

`install:global` 会：

1. 使用 `npm link` 注册全局 `figma-local-cli` 命令。
2. 将仓库中的 Skill 同步到全局 Skill 目录。

全局命令链接到当前仓库，不会复制第二份 CLI。不要删除或随意移动该仓库；路径变化后的处理见[更新与路径变化](#更新与路径变化)。

### 2. 启动本机桥接

```sh
figma-local-cli serve
```

保持该终端运行。同一状态目录同一时间只启动一个服务。以后可以先运行 `figma-local-cli doctor` 检查服务是否已经在线。

默认状态目录固定为本仓库的 `.figma-local`，因此从其他业务项目目录执行全局命令时，仍会找到同一个桥接服务。需要隔离时可使用 `--state /绝对路径/.figma-local` 或环境变量 `FIGMA_LOCAL_STATE`。

### 3. 首次导入 Figma 插件

1. 登录 Figma 桌面端。
2. 打开任意一个有编辑权限的 Figma Design 文件。
3. 选择 **Plugins → Development → Import plugin from manifest**。
4. 选择本仓库中的 `dist/plugin/manifest.json`。
5. 从 Development 菜单运行 **Figma Local CLI**。

不同 Figma 客户端语言或版本的菜单名称可能略有不同。只要仓库路径和 manifest 没有变化，这个导入步骤通常只执行一次。

## 连接当前文件

每次开始处理一个新的 Figma 文件，都按以下顺序操作。

### 1. 检查环境

```sh
figma-local-cli doctor
```

若 `bridge=false`，先在一个持久终端运行：

```sh
figma-local-cli serve
```

### 2. 在目标文件中运行插件

打开目标 Design 文件，并从 **Plugins → Development** 运行 **Figma Local CLI**。插件必须保持打开，CLI 才能持续下发任务。

### 3. 生成并粘贴连接码

在终端运行：

```sh
figma-local-cli pair --copy
```

该命令不会把凭据打印到日志，只会将连接码写入本机剪贴板。在插件中：

1. 将剪贴板内容粘贴到“本地连接码”。
2. 点击“连接当前文件”。
3. 等待状态变为“已连接到本地 Agent”。

| 1. 粘贴 CLI 复制的连接码 | 2. 确认插件已连接 |
|---|---|
| <img src="docs/images/plugin-disconnected.png" width="340" alt="Figma Local CLI 插件等待粘贴本地连接码"> | <img src="docs/images/plugin-connected.png" width="340" alt="Figma Local CLI 插件已经连接到本地 Agent"> |

> 上图来自模拟 Figma host 的插件 UI 回归，用于说明操作位置；真实账号接入证据见下方“真实账号验证”。

插件只需要填写**本地连接码**。不需要填写：

- Figma PAT 或 Access Token
- Figma 账号密码
- Figma 文件 URL 或 File Key
- 本机服务地址或端口
- Agent Skill 名称

### 4. 核对并绑定页面

```sh
figma-local-cli sessions
figma-local-cli bind <session-id>
figma-local-cli inspect
```

在 `sessions` 输出中核对文件名、Page 名、Page ID 和选区。`bind` 将当前插件会话及 Page 设为 CLI 目标；`inspect` 用于在写入前确认实际作用范围。

只有文件和 Page 均正确时，才能继续读取、写入或导出。Figma URL 只能帮助定位文件或 `node-id`，不能替代实时插件会话和页面绑定。

## 什么时候重新操作

| 场景 | 重新导入插件 | 重新运行插件 | 重新 `pair --copy` | 重新 `sessions` / `bind` |
|---|---:|---:|---:|---:|
| 同一文件继续工作，状态未变化 | 否 | 否 | 否 | 否 |
| 在当前文件切换 Page | 否 | 否 | 否 | 是 |
| 打开另一个 Figma 文件 | 否 | 是 | 是 | 是 |
| 插件关闭后重新打开 | 否 | 是 | 是 | 是 |
| 本机桥接服务重启 | 否 | 保持或重开 | 是 | 是 |
| 插件代码更新，manifest 路径不变 | 否 | 关闭后重开 | 是 | 是 |
| 仓库移动或重命名 | 是，导入新路径 | 是 | 是 | 是 |

如果不确定当前状态，执行 `doctor → sessions → bind → inspect`，不要直接写入。

## 常用工作流

### 读取当前设计

`inspect` 默认读取当前选区；没有选区时读取当前 Page。也可以指定节点：

```sh
figma-local-cli inspect
figma-local-cli inspect <node-id> --depth 10
```

默认节点预算为 2000、深度为 8；最大值为 10000 / 30。若结果中 `completeness.truncated=true`，通过节点 ID 分块读取。

### 预览 Free / Starter 项目骨架

设计工作应先明确用户旅程、页面、状态和验收目标。Free / Starter 账号建议使用固定三 Page 主文件：

```text
00 · Map & Journey
10 · Product & Prototype
90 · System & Specs
```

业务模块和用户流使用 Section，页面及状态使用 Frame，正式结构使用 Auto Layout，Group 不作为长期布局边界。完整规则见 [Figma Free Account Project Convention](docs/superpowers/specs/2026-10-04-figma-free-project-convention-design.md)。

第一阶段的 `scaffold` 只读取当前文件并生成计划，不写入 Figma。完成连接和绑定后运行：

```sh
figma-local-cli scaffold --config examples/figma-project.json
```

配置格式：

```json
{
  "schemaVersion": 1,
  "project": {
    "code": "PRJ",
    "name": "Product Name",
    "version": "v1"
  },
  "pageMode": "three",
  "platforms": ["desktop", "mobile"],
  "flows": [
    { "code": "F01", "name": "Onboarding" },
    { "code": "F02", "name": "Core Task" }
  ]
}
```

计划会列出当前文件、Page、选区、预期操作、Starter Page 上限、名称冲突和预计 Section 数量。无冲突时 `executable=true`；冲突时仍输出计划，但进程退出码为 `2`。

- 默认只自动采用唯一、空白且名为 `Page 1` 的 Page。
- 非空或无法唯一判断的 Page 必须显式指定 `--adopt-page <page-id>`。
- `--page-mode single` 是显式单 Page 回退，不会自动启用。
- 当前版本不支持 `--apply`，不能将计划描述成已经写入 Figma。

### 执行受控写入

`eval` 接收一个本地可信的异步函数体，可以使用 `figma`、`context`、`await` 和 `return`：

```js
await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
const frame = figma.createFrame();
frame.name = 'Approved screen';
frame.layoutMode = 'VERTICAL';
frame.resize(480, 320);
return { id: frame.id };
```

```sh
figma-local-cli eval path/to/script.js
```

脚本运行在 Figma Plugin API 环境中，不支持 Node 文件/网络模块、`import` 或 `require`。它不是只读沙箱，也没有事务回滚：

- 只执行本地可信脚本。
- 设置文本前先加载字体。
- 修改已有页面前先 `inspect`。
- 长脚本执行期间不要手动切换 Page。
- 首次接入或能力验证只创建独立 smoke Section。
- 失败或超时后先查询任务并检查画布，不要自动重放写操作。

### 导出截图和交接包

```sh
# 导出节点图片或矢量
figma-local-cli screenshot <node-id> --out design-assets/frame.png
figma-local-cli screenshot <node-id> --format SVG --out design-assets/icon.svg

# 提取已认可页面的结构与设计资产
figma-local-cli extract --node <frame-id> --out design-assets/v1
figma-local-cli handoff --out design-assets/v2 --depth 10 --max-previews 6
```

输出目录必须不存在。每次导出到新目录，再评审差异，避免覆盖已经补充的设计规范。

## 从设计到前端

推荐流程：

```text
目标与用户旅程
→ 页面与状态
→ 认可代表页面
→ 提取资产
→ 语义命名与组件映射
→ 前端实现
→ 浏览器验收
```

`extract` 和 `handoff` 的主要产物：

| 文件 | 用途 |
|---|---|
| `snapshot.json` | 来源、范围、截断状态、节点结构、Auto Layout、文本分段、变量、样式、组件和原型 |
| `tokens/*.tokens.json` | 按 collection / mode 导出的 DTCG 2025.10 子集 |
| `tokens.css` | 各 collection 默认模式的 CSS 自定义属性，保留别名 |
| `token-index.json` | Token 与原始变量、模式、CSS 名称的映射 |
| `candidates.json` | 未显式绑定值的频次和节点来源，需要设计评审 |
| `component-map.json` | 组件与实例来源，代码映射初始为 `unmapped` |
| `design.md` | 提取摘要与需要确认的规范 |
| `HANDOFF.md` | 前端 Agent 的实施入口与验收要求 |
| `previews/` | `handoff` 生成的实际节点 PNG 和来源索引 |

提取后先检查 `snapshot.json` 的 `source`、`scope` 和 `completeness`。`candidates.json` 是候选数值，不等于已认可 Token；`component-map.json` 是本地代码映射，不是官方 Code Connect。

Token 路径包含 collection、mode 和 variable 标识。`COLOR` 使用标准 sRGB 对象和透明度；`FLOAT` 默认保留为 `number`，不会自动猜成 px。通用 `STRING/BOOLEAN` 保留原值，不伪装成标准 Token 类型。组件资料覆盖选定子树及实例主组件引用，变量和样式覆盖整个文件的本地资产。

快照不是 `.fig` 完整备份，PNG 也不是可复用组件。前端实现应从 `HANDOFF.md` 开始，复用已认可 Token 和组件，并补齐响应式、空态、错误态、加载态和键盘交互。

真实 smoke 的前端示例可通过以下命令预览：

```sh
python3 -m http.server 3913 --bind 127.0.0.1 --directory artifacts/real-20261004/frontend
```

打开 `http://127.0.0.1:3913`。复现过程见 [前端示例说明](examples/frontend-smoke/README.md)。

| Figma 原生 Frame | 浏览器起点 | 浏览器完成态 |
|---|---|---|
| <img src="docs/images/figma-frame.png" width="280" alt="从真实 Figma 导出的原生 Frame 预览"> | <img src="docs/images/web-start.png" width="280" alt="根据真实交接包实现的浏览器起点"> | <img src="docs/images/web-complete.png" width="280" alt="根据真实交接包实现的浏览器完成态"> |

## 命令速查

运行 `figma-local-cli help` 查看完整参数。未安装全局命令时可以使用 `node src/cli.js`。

| 命令 | 行为 |
|---|---|
| `serve` | 启动本机桥接 |
| `doctor` | 检查构建产物、Figma 桌面端、桥接和插件会话 |
| `pair --copy` | 将短期插件连接码复制到本机剪贴板 |
| `sessions` | 列出已连接插件的文件、Page 和选区 |
| `bind <session-id>` | 绑定目标插件会话和当前 Page |
| `inspect [node-id]` | 读取选区、当前 Page 或指定节点 |
| `scaffold --config <file>` | 只读生成项目骨架计划 |
| `eval <file>` | 执行本地异步 Plugin API 脚本 |
| `screenshot <node-id> --out <file>` | 导出 PNG 或 SVG |
| `extract --out <directory>` | 导出结构、Token 和组件候选资料 |
| `handoff --out <directory>` | 导出资产并生成预览与前端入口文档 |
| `job <job-id>` | 查询任务结果，不重新执行 |

## 任务状态与安全边界

任务状态为：

```text
queued → running → succeeded / failed / indeterminate
```

任务 ID 在提交前写入 stderr，JSON 结果写 stdout。默认执行超时为 60 秒，`--timeout` 最多 300 秒；排队超时为 20 秒。

出现超时、网络错误或 `indeterminate` 时：

1. 运行 `figma-local-cli job <job-id>`。
2. 在 Figma 中检查目标画布。
3. 明确任务没有生效后，才能决定是否重新执行。

迟到回包保存在 `lateResult`，主状态仍保持 `indeterminate`。插件一次只执行一项任务，写任务不会自动重试；服务重启后内存中的任务记录会丢失。

连接码只在本机剪贴板中使用，不要发到聊天或提交仓库。服务凭据保存在忽略提交的 `.figma-local/session.json` 中，文件权限为 `0600`，正常退出时会删除。服务只监听本机回环地址。

## 真实账号验证

完成首次连接后，可以在空白草稿或独立测试区域运行 smoke。示例只新建一个独立 Section、两个 Frame、一个按钮组件及实例、两项变量和点击跳转，不删除已有图层：

<p align="center">
  <img src="docs/images/free-workspace.jpg" width="900" alt="Figma Free 工作区中的真实个人草稿验证文件">
</p>

先核对 `sessions` 中的文件名和 Page，再执行：

```sh
figma-local-cli eval examples/smoke.js
```

保存返回的节点 ID，在 Figma 中确认图层可编辑、原型可从第一屏跳转到第二屏，然后读回和导出：

```sh
figma-local-cli inspect <section-id> --depth 10
figma-local-cli screenshot <first-frame-id> --out artifacts/first-frame.png
figma-local-cli handoff --out artifacts/smoke-handoff
```

对照 `snapshot.json` 中的 `INSTANCE`、`mainComponent`、`boundVariables` 和 `reactions`，确认结果来自原生结构。只有真实 Figma 创建、读回和导出成功，才能认定账号已经接通；示例本身不是业务产品设计。

| Prototype 起点 | 点击后的完成态 |
|---|---|
| <img src="docs/images/prototype-start.jpg" width="560" alt="真实 Figma Prototype 的起始画面"> | <img src="docs/images/prototype-complete.jpg" width="560" alt="真实 Figma Prototype 点击后的完成画面"> |

完整任务 ID、节点结构、截图和验证边界见 [验证记录](docs/verification.md)。

## 排错

| 现象 | 处理 |
|---|---|
| 找不到 `figma-local-cli` | 确认 Node 版本；切换 nvm 版本后在仓库重新运行 `npm run install:global` |
| 服务不可达 | 运行 `figma-local-cli serve`；若使用自定义状态目录，检查 `--state` 或 `FIGMA_LOCAL_STATE` 是否一致 |
| `sessions` 没有在线会话 | 打开目标 Figma 文件，运行开发插件，使用最新连接码配对，并保持插件窗口打开 |
| 插件连不上 | 确认使用 Figma 桌面端、服务端口 3055 和最新连接码；检查 manifest 开发网络权限 |
| 401 / 服务已重启 | 重新执行 `pair --copy`，然后重新 `sessions` 和 `bind` |
| `Origin rejected` | 查看插件控制台实际 Origin；只调整来自 Figma 的精确白名单，不改成 `*` |
| 当前 Page 已变化 | 重新执行 `sessions`，核对后 `bind` |
| 任务超时或状态不确定 | 先运行 `job <job-id>` 并检查 Figma；未确认前不要重放同一写脚本 |
| 字体不可用 | 用 `figma.listAvailableFontsAsync()` 查询字体，设置文本前执行 `loadFontAsync` |
| 变量别名依赖未提取 | 将外部库变量导入当前文件或另行解析；当前版本不自动复制团队库 |
| 预览缺失 | 检查选区类型；`handoff` 只导出前 N 个选中或顶层 Frame、Component、Instance、Section |

## 开发与维护

### 项目检查

```sh
npm run check
```

该命令运行 TypeScript 检查、插件构建和 Node 自动测试。

插件 UI 回归使用 Python Playwright 和本机 Chromium，并要求独立测试服务：

```sh
# 终端 1
npm start

# 终端 2
python3 -m http.server 3912 --bind 127.0.0.1

# 终端 3
python3 test/ui_smoke.py
```

如果浏览器不在 Playwright 默认路径，设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/浏览器可执行文件路径`。测试会使用 `.figma-local` 并绑定模拟会话；结束后关闭测试服务，真实使用前重新启动、配对和绑定。

### 源码职责

| 路径 | 职责 |
|---|---|
| `src/` | CLI、本机桥接、任务协议和资产导出 |
| `plugin/` | Figma 插件主线程与 UI |
| `skills/figma-local-cli/` | 全局 Agent Skill 的权威源 |
| `examples/` | 真实接入与前端交接示例 |
| `docs/` | 架构、验证、项目规范和维护说明 |

项目不包含云端账号服务、付费团队库发布或官方 Code Connect。

### 更新与路径变化

修改 CLI、插件或 Skill 后运行：

```sh
npm run check
npm run install:global
```

- 只修改 CLI：全局命令会读取链接后的新源码，但仍需运行检查。
- 修改插件：重新构建后，在 Figma 中关闭并重新运行插件；manifest 路径不变时通常不需要再次导入。
- 修改 Skill：运行 `install:global` 同步全局副本。
- 移动或重命名仓库：在新路径重新运行 `install:global`，并从新路径重新导入 `dist/plugin/manifest.json`。

详细维护规则见 [全局命令与 Skill 维护](docs/global-installation.md)。

## 发布版本

| 版本 | 日期 | 状态 |
|---|---|---|
| `v0.2.0` | 2026-10-05 | Scaffold 只读规划、可折叠插件面板和 README 可视化 |
| `v0.1.0` | 2026-10-04 | 首个可用版本；真实 Free Draft 读写与交接闭环通过 |

版本号以 `package.json`、Git tag 和 GitHub Release 为准。完整变更见 [CHANGELOG](CHANGELOG.md)。
