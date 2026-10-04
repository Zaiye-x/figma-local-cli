# 免费个人账号 Figma Agent 工作流调研框架

调研日期：2026-10-04。约束：macOS、本地 Agent、Figma Starter 个人账号；在可编辑的 Figma Design 文件里生成页面，提炼资产，再交给本地 Agent 实现前端。

## 研究问题与方法

采用**能力对标**检验不同接入方式；采用**用户旅程**检查从设计到代码的闭环。优先使用官方开发者文档和套餐说明；社区文章和开源项目 README 只作为实现参考。所有额度和权限是查询当日的文档状态，不构成未来承诺。

| 章节 | 目标 / 假设 | 必需证据和检索词 | 优先级 | 可视化 |
|---|---|---|---|---|
| 免费账号边界 | Plugin API 可以实现当前文件读写；MCP、REST 和团队库存在不同限制 | Figma Starter overview、MCP plans access permissions、write to canvas、Variables REST、Code Connect | P0 | 能力矩阵 |
| 技术路线 | CLI + 插件可以独立于官方 MCP 读写额度运行 | Plugin quickstart、manifest networkAccess、variables、reactions、节点导出 | P0 | 数据流图 |
| 产品对标 | 成熟社区方案可作为备选，但依赖和定位不同 | southleft/figma-console-mcp、sonnylazuardi/cursor-talk-to-figma-mcp、Figma code-to-canvas | P1 | 对比表 |
| 资产闭环 | 提取数值不等于完成语义规范；需要保留来源、模式和组件映射 | DTCG 2025.10、VariableAlias、组件实例与变体结构 | P0 | 旅程和产物表 |
| 实现与验收 | 可本地验证传输/导出；真实 Figma 成功需要桌面端、目标文件和插件连接 | 当前目录、Node 运行环境、连接状态、测试结果 | P0 | 验收矩阵 |

## 数据收集与判断规则

1. 逐条核对用户提供文章的关键论断，尤其免费读写、字体、图片、原型。
2. 区分官方 MCP、官方 REST API、官方 Plugin API、第三方桥接，避免混淆额度。
3. 核对 Starter 草稿、共享文件、页面、变量模式、团队库及 Code Connect。
4. 验证当前机器的运行条件；未登录、未连接、未实测的项必须明示。
5. 对文档冲突保留来源，优先使用对应功能的专门说明，运行时再次探测。
6. 只制作事实对比表与结构图，不构造性能、成功率或费用估计图。
