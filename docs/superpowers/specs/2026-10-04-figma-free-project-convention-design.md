# Figma Free Account Project Convention

状态：待用户最终评审  
日期：2026-10-04  
适用工具：`figma-local-cli`  
适用场景：个人 Free / Starter 账号，以本人和本地 Agent 为主要编辑者

## 1. 背景

Figma Starter 当前支持无限数量的 Draft 文件，但团队空间只有一个 Folder，并限制可协作的 Figma Design / Sites 文件数量。官方同时说明 Starter 团队文件最多包含三个 Page。官方对 Starter Draft 的 Page 上限描述不完全一致，因此本规范不依赖套餐例外，统一按“一个主文件最多使用三个 Page”设计。

Starter 还存在以下重要边界：

- 没有 Team Library，跨文件组件、样式和变量不能作为正式共享库同步。
- 没有 Dev Mode。
- 变量可以在文件内创建和使用，但 Variable Modes 不属于 Starter 能力。
- 版本历史保留 30 天。
- Draft 可分享查看；免费方案不适合作为多人共同编辑的长期协作空间。

官方参考：

- https://help.figma.com/hc/en-us/articles/13838684089751-Starter-plan-overview
- https://help.figma.com/hc/en-us/articles/360038511293-Create-and-manage-pages
- https://help.figma.com/hc/en-us/articles/360040328273-Figma-plans-and-features
- https://help.figma.com/hc/en-us/articles/9771500257687-Organize-your-canvas-with-sections
- https://help.figma.com/hc/en-us/articles/360039823894-Create-and-manage-prototype-flows

## 2. 目标

本规范要在 Free / Starter 约束下满足：

1. 一个入口可以看到项目范围、用户旅程、页面清单和交付状态。
2. 一个主文件可以承载全部高保真页面、关键状态和多条交互原型。
3. 同一主文件包含该项目实际使用的组件、Token 和设计规范。
4. 探索稿、历史版本和正式交付内容互不污染。
5. `figma-local-cli` 能以明确、可读回、不可盲目重放的方式创建和维护设计。
6. 前端 Agent 可以从 Ready Section 提取完整、可追溯的交接包。

## 3. 非目标

- 不在 Free 账号中模拟 Team Library 或官方 Code Connect。
- 不把 PNG、截图或候选 Token 宣称为正式设计系统。
- 不允许 CLI 自动推断并覆盖已有业务设计。
- 不让 Figma Page 等同于产品中的业务页面。
- 不在主文件中保留无边界的低保真探索和废弃方案。
- 不依赖付费能力，例如 Dev Mode、Variable Modes、Branching 或团队库发布。

## 4. 核心模型：3 + N

每个活跃项目维护一个主 Draft：

```text
[项目代号] 产品名 · Master · v1
```

主文件固定使用三个 Page：

| Page | 职责 | 内容 |
|---|---|---|
| `00 · Map & Journey` | 项目导航 | 项目说明、用户旅程、页面清单、状态、Section 和原型入口 |
| `10 · Product & Prototype` | 交付真源 | 高保真页面、关键状态、响应式版本和交互原型 |
| `90 · System & Specs` | 文件内设计系统 | Foundations、Token、本地变量、组件、Pattern 和变更记录 |

额外 Draft 数量不受本规范限制，用于非交付内容：

```text
[项目代号] 产品名 · Explore · 2026-Q4
[项目代号] 产品名 · Archive · v0.x
[项目代号] 产品名 · Research
```

`N` 个辅助 Draft 不参与正式前端交接。探索结果经过评审后才进入 Master；过期设计从 Master 移入 Archive。

## 5. Figma 层级职责

### 5.1 Page

Page 表示稳定的工作职责，不表示某一张产品页面。

Page 名称带两位数字前缀，顺序不可随意改变。主文件不得创建第四个业务 Page；需要扩展时优先使用 Section，或拆分新的独立项目主文件。

### 5.2 Section

Section 是主文件的核心组织、导航和 CLI 操作边界。

在 `10 · Product & Prototype` 中，一个 Section 对应：

- 一条用户流；
- 一个业务模块；
- 一个独立交付批次；
- 或一个需要单独评审的状态集合。

Section 命名：

```text
F01 · Onboarding · WIP
F02 · Core Task · Review
F03 · Settings · Ready
F04 · Legacy Checkout · Deprecated
```

允许的状态只有：

```text
WIP → Review → Ready → Deprecated
```

Section 最多嵌套两层。嵌套 Section 只用于大型模块内的明确子流程，不用于代替普通 Frame。

### 5.3 Frame

Frame 表示：

- 一张完整产品页面；
- 一个页面级状态；
- 一个 Overlay、Dialog 或 Sheet；
- 一个响应式断点；
- 一块正式规范展示板。

产品 Frame 命名：

```text
F02.03 · Order List · Default · Desktop
F02.03 · Order List · Loading · Desktop
F02.03 · Order List · Empty · Desktop
F02.03 · Order List · Error · Mobile
```

只创建和产品行为有关的页面状态。默认检查：

- Default
- Loading
- Empty
- Error
- Success
- Permission
- Offline

不相关的状态不创建。Hover、Focus、Pressed、Disabled 等局部状态应由组件 Variant 表达，不复制整张页面。

### 5.4 Component 和 Component Set

可复用 UI 必须转换为 Component；同一交互对象的状态和尺寸差异使用 Component Set。

组件命名使用斜杠层级：

```text
Button/Primary
Input/Text/Default
Navigation/Sidebar/Item
Feedback/Toast/Success
Data/Table/Row
```

实例不得在业务页面中被随意 Detach。确需例外时，在 Frame 附近放置说明。

### 5.5 Group 和 Auto Layout

Auto Layout 是正式结构的默认布局方式。

Group 仅允许用于：

- 临时选择；
- 不参与布局的纯装饰图层；
- 短期矢量组合。

Group 不得承担页面结构、组件结构、响应式布局或 CLI 语义边界。正式层级优先使用 Section、Frame、Component 和 Auto Layout。

## 6. 三个 Page 的内容规范

### 6.1 `00 · Map & Journey`

固定包含以下 Section：

```text
00.1 · Start Here
00.2 · User Journey
00.3 · Screen Inventory
00.4 · Flow Directory
00.5 · Milestones
```

`Start Here` 至少记录：

- 项目名称与代号；
- 当前版本；
- 目标用户；
- 关键任务；
- 主文件状态；
- 最近一次评审日期；
- Product Page、System Page 和 Prototype Flow 链接。

`Screen Inventory` 使用表格式 Frame，字段固定为：

```text
Screen ID | Screen name | Flow | Platform | Required states | Status | Owner
```

此 Page 不承载正式组件和高保真业务页面。

### 6.2 `10 · Product & Prototype`

一个用户流对应一个顶层 Section。

Section 内部从上到下排列：

1. `Brief`：用户目标、入口、前置条件、验收标准。
2. `Desktop Primary Path`：主流程从左到右。
3. `Mobile Primary Path`：主流程从左到右。
4. `States`：Loading、Empty、Error 等状态放在对应主页面下方。
5. `Overlays`：Dialog、Sheet、Toast 等辅助状态。

推荐几何规则：

- 同一流程按从左到右表达时间顺序。
- Frame 水平间距为 160。
- 状态 Frame 放在基础 Frame 正下方，垂直间距为 240。
- 顶层 Section 之间至少保留 480 的画布间距。
- 不同 Section 的原型连线不得穿越其他 Section。

每条可演示路径建立命名明确的 Flow Starting Point：

```text
F01 · Onboarding · Happy Path
F01 · Onboarding · Invalid Credentials
F02 · Core Task · Empty to Complete
```

跨模块连接优先指向 Section。利用 Figma 的 Section 原型行为返回该 Section 最近访问的 Frame。

### 6.3 `90 · System & Specs`

固定包含：

```text
90.1 · Foundations
90.2 · Local Variables
90.3 · Components
90.4 · Patterns
90.5 · Content & Accessibility
90.6 · Changelog
```

`Foundations` 至少定义：

- Color
- Typography
- Spacing
- Radius
- Grid
- Icon size
- Elevation
- Motion duration

`Local Variables` 使用单默认 Mode。推荐变量命名：

```text
color/bg/default
color/text/primary
color/action/primary
space/100
space/200
radius/control
size/control/default
```

由于 Starter 不支持 Variable Modes，主题、品牌或平台差异不能依赖 Mode 自动切换。确需展示第二主题时，使用明确命名的平行变量或展示 Frame，并在交接文档说明映射关系。

此 Page 中的本地 Component 和 Variable 是当前主文件的唯一设计真源。辅助 Draft 可以复制，但不得宣称与 Master 实时同步。

## 7. 设计生命周期

设计按以下顺序推进：

```text
用户旅程
→ 页面清单
→ Explore 草图
→ Golden Screen
→ 本地组件化
→ 全量高保真与关键状态
→ Prototype Flow
→ Ready Review
→ Handoff
→ Archive
```

晋级规则：

1. 未确认用户旅程，不创建高保真全量页面。
2. Golden Screen 未认可，不批量生成其他页面。
3. 组件规则未稳定，不将临时图层提升为正式 Component。
4. 关键状态未补齐，Section 不得进入 Ready。
5. `handoff` 只读取 Ready Section。
6. 重大里程碑导出新的交接目录，并保存本地 `.fig` 或完整快照，弥补 30 天版本历史限制。

## 8. CLI 操作合同

### 8.1 写入前

每次真实写入必须：

```text
doctor → sessions → bind → inspect
```

并核对：

- 文件名；
- Page ID 和名称；
- 当前选区；
- 在线状态；
- 目标 Section ID；
- 读回是否截断。

### 8.2 写入范围

- 新需求默认写入新的 `WIP` Section。
- 已有 Section 必须通过显式节点 ID 指定。
- Page 根节点已有内容时，禁止无范围批量写入。
- Ready Section 未被显式指定时禁止修改。
- CLI 不通过模糊名称猜测唯一目标。
- CLI 不自动删除、移动或重命名现有业务节点。

### 8.3 失败处理

- 记录 stderr 中的 Job ID。
- `failed`、网络错误或 `indeterminate` 后先查询 `job <id>`。
- 未确认画布状态前禁止重放相同写任务。
- 写入脚本必须尽量先创建独立容器，再创建内部节点。
- 脚本返回 Section、Frame、Component、Variable 等关键节点 ID。

### 8.4 交接

交接前选择一个或多个 Ready Section：

```sh
figma-local-cli handoff --out design-assets/<version>
```

验收：

- `snapshot.json` 来源与选区正确；
- `completeness.truncated=false`；
- `component-map.json` 中实例引用正确；
- Token 和变量依赖无错误；
- Prototype reactions 指向当前 Ready 节点；
- 预览 PNG 与 Figma 画布一致；
- 输出目录为新目录，不覆盖旧版本。

## 9. 自动创建项目骨架的命令设计

未来增加：

```sh
figma-local-cli scaffold --config figma-project.json
figma-local-cli scaffold --config figma-project.json --apply
```

默认命令只生成计划，不写入。`--apply` 才执行真实创建。

配置示例：

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

### 9.1 计划阶段

计划输出：

- 当前文件、Page 和选区；
- 将创建、重命名和保留的对象；
- Page 数量与套餐兼容性；
- 名称冲突；
- 预计创建的 Section 和 Frame；
- 是否需要采用现有空白 Page；
- 是否会触碰已有节点。

任何冲突都使计划不可执行。

### 9.2 三 Page 创建策略

空白新文件通常包含一个 `Page 1`：

1. 若 `Page 1` 完全为空，计划可将其重命名为 `00 · Map & Journey`。
2. 创建 `10 · Product & Prototype`。
3. 创建 `90 · System & Specs`。
4. 建立固定规范 Section 和配置中的 Flow Section。
5. 将页面、Section 和 Scaffold 版本写入 Plugin Data，便于后续识别。

若现有 Page 含任何业务节点，命令必须停止，不自动接管。用户需要显式提供：

```sh
--adopt-page <page-id>
```

### 9.3 单 Page 回退

若文件无法创建三个 Page，提供显式回退：

```sh
figma-local-cli scaffold --config figma-project.json --page-mode single --apply
```

单 Page 模式创建三个顶层边界 Section：

```text
PAGE 00 · Map & Journey
PAGE 10 · Product & Prototype
PAGE 90 · System & Specs
```

命令不得在失败后自动切换为单 Page 模式，必须由用户明确选择。

### 9.4 幂等与冲突

- Scaffold 使用 Plugin Data 标识 `schemaVersion`、项目代号和对象职责。
- 同一配置再次执行时只报告现状，不重复创建。
- 同名但无 Plugin Data 的对象视为冲突，不自动接管。
- 版本升级必须通过迁移计划，不直接改写旧结构。
- 超时或 `indeterminate` 后遵循普通写任务规则，不自动重放。

## 10. 测试策略

### 10.1 自动测试

- 空文件三 Page 计划。
- 已有空白 `Page 1` 的采用逻辑。
- 非空 Page 拒绝接管。
- 三 Page 名称冲突。
- 单 Page 回退计划。
- 重复执行不创建重复对象。
- Page 切换后拒绝旧绑定任务。
- 执行超时不自动重放。
- Scaffold 输出可由 `inspect` 完整读回。

### 10.2 模拟插件测试

- 验证 Page、Section、Frame 和 Plugin Data 创建。
- 验证组件与变量保持文件内引用。
- 验证配置中的 Flow Section 顺序和命名。

### 10.3 真实 Figma 验收

在新的独立 Draft 中执行，不复用当前 smoke 文件：

1. 创建三 Page 骨架。
2. 读取三个 Page 和固定 Section。
3. 创建一条两屏 Flow。
4. 创建本地组件和变量并应用到实例。
5. 创建并播放 Prototype Flow。
6. 选择 Ready Section 生成 Handoff。
7. 核对截图、结构、变量绑定和 reactions。

## 11. 验收标准

- 主文件不超过三个 Page。
- Page 职责固定且命名统一。
- Product Page 的每条主要用户流有独立 Section。
- 每张正式页面由 Frame 表达，关键状态命名完整。
- 正式布局不依赖 Group。
- 可复用 UI 使用本地 Component / Component Set。
- System Page 包含可追溯的 Foundations、Variables、Components 和 Changelog。
- 每条可演示流程有命名明确的 Flow Starting Point。
- Ready Section 可以单独链接、读取、截图和 handoff。
- CLI 所有写入都有目标、Job ID、读回结果和失败恢复路径。
- Scaffold 默认只预览，显式 `--apply` 才写入。
- 当前 `Untitled` smoke 文件不作为正式项目模板，也不会被自动迁移。

## 12. 后续实施边界

本规范批准后，实施阶段拆为三个独立增量：

1. 增加 Scaffold 配置 Schema 和纯计划器。
2. 增加安全的真实 Figma Scaffold 写入。
3. 增加模板 Handoff、规范检查和真实 Free Draft 验收。

每个增量分别实现、测试和验收，避免把项目模板、批量写入与交接检查一次性耦合。
