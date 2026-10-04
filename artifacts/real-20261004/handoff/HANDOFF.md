# 前端 Agent 交接入口

先读 design.md、snapshot.json 的 source/scope/completeness，再读 token-index.json 和 component-map.json。
本目录是设计读回资料；语义规范、代码映射和视觉认可状态仍需按 design.md 审核。

1. 选定已认可的画框，核对 previews 与节点结构；截断时先分块重新提取。
2. 复用变量别名、Auto Layout、文本分段和已有代码组件；不要机械地绝对定位所有图层。
3. 补充响应式规则、键盘焦点、可访问名称与状态行为。
4. 在浏览器运行并截图，对照 Figma；没有运行证据不得声称通过验收。
5. 后续提取写入新目录，通过 diff 审核，再更新规范与映射；不要覆盖人工补充的资产。

真实导出预览：3 张，索引见 previews/index.json。
