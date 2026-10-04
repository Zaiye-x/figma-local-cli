# 本项目的 Agent 使用约定

- 默认使用中文。先明确用户旅程与页面状态，再写入 Figma；没有具体业务需求时不要擅自设计产品。
- 入口是 `node src/cli.js`。真实写入前运行 `sessions` 并核对绑定的文件名、页面与插件会话。
- Figma 操作使用公开 Plugin API；`eval` 脚本是异步函数体，提供 `figma` / `context`。字体先加载，组件引用/原型更新用支持 dynamic-page 的异步 API。
- 只把本地可信脚本交给 `eval`。它没有沙箱权限限制和事务回滚。改已有页面前先读取目标、确定作用范围；首次接入使用独立 smoke Section。
- 任务 ID 在 stderr，JSON 结果在 stdout。失败、网络错误或 `indeterminate` 后先查询 `job ID` 并检查画布，禁止自动重放写入。
- 不读取或输出 `.figma-local/session.json` 的凭据到聊天/日志。让用户通过 `pair --copy` 配对。不要把文件 key 当作普通插件可用的可靠身份。
- 页面和插件必须保持打开。用户切页、插件重开或服务重启后按 README 重新绑定/配对。
- 提取后检查 `snapshot.json` 的来源、范围和 `completeness`。结构截断需要分块；组件和 token 提取结果不自动代表设计已批准。
- 新资产输出到新目录，不覆盖已补充的设计规范。`candidates.json` 需语义评审，`component-map.json` 需代码映射；本地映射不称为官方 Code Connect。
- 前端开发从 `HANDOFF.md` 开始，复用已认可 token 和组件，补齐响应式与状态，并用本机 Playwright 截图验收。
- 修改桥接、序列化或导出后运行 `npm run check`。修改 UI 后在独立服务运行 `test/ui_smoke.py`，明确它使用模拟 host。
- 全局 Skill 的权威源是 `skills/figma-local-cli/SKILL.md`；修改 CLI、插件或 Skill 后运行 `npm run check` 与 `npm run install:global`，不要只改 `~/.trae-cn/skills/figma-local-cli/` 的运行时副本。
- 只有真实 Figma 创建/读回/导出的证据才能认定账号接入完成。没有真实连接时如实说明，不产生伪造的成功节点或占位预览。
