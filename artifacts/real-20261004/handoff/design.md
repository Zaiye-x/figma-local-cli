# 设计资产提取记录

来源：Untitled / Page 1 (0:1)
采集：2026-10-04T09:27:56.481Z

结构节点：10；截断：否。
变量：2；本地样式：0；组件/组件引用：1。

## 待确认的规范

- 确认哪些画框已批准，补齐桌面、移动端与加载/空/错误状态。
- 审核 candidates.json 的数值频次，结合用途命名语义 token。
- FLOAT 保持 number；尺寸需要明确单位后再转成 dimension，CSS 使用时可乘 1px。
- Token 路径含模式命名空间；按 token-index.json 合并所需模式及依赖文件，不要删除模式层。
- 跨 collection 别名明确指向目标的默认模式；CSS 仅导出各 collection 默认模式。
- STRING/BOOLEAN 不在标准 token 子集内，保留原值；不要当作已丢弃。
- 在 component-map.json 补充代码路径和导出名；当前均为 unmapped。
- snapshot.json 保留本地样式与原型 reactions；不推断业务逻辑。

