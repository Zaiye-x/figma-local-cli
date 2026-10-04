# 全局命令与 Skill 维护

用户克隆的 `figma-local-cli` 仓库是唯一权威源码。业务项目不复制 CLI 或插件代码，只保存自己的 Figma 链接、设计资产和前端实现。全局命令通过 `npm link` 指向该仓库；移动仓库后需要重新安装链接。

## 三层职责

| 层级 | 位置 | 作用 | 修改后 |
|---|---|---|---|
| CLI 与桥接 | `src/` | 全局命令、服务、任务协议、导出 | `npm run check` |
| Figma 插件 | `plugin/` | 在当前文件调用公开 Plugin API | `npm run check` 后重开插件 |
| Skill 源文件 | `skills/figma-local-cli/SKILL.md` | `/figma-local-cli` 的触发条件与操作规程 | `npm run install:global` |

`npm run install:global` 执行两项发布：

1. `npm link` 将全局 `figma-local-cli` 命令链接到本仓库的 `src/cli.js`，不复制第二份 CLI。
2. 原子同步 Skill 到 `~/.trae-cn/skills/figma-local-cli/`，并核对文件哈希。

全局 Skill 是运行时副本，仓库中的 `skills/figma-local-cli/` 才是维护源。不要只手工修改全局副本，否则下一次发布会覆盖该改动。

## 日常维护

修改完成后：

```sh
cd /path/to/figma-local-cli
npm run check
npm run install:global
```

若只修改 CLI JavaScript，全局命令因软链接会立即读取新源码，但仍应运行测试。若修改插件，必须重新构建 `dist/plugin/`，并在 Figma 中关闭后重新运行插件。若修改 Skill，必须再次同步全局副本；通常需要开启新对话才能稳定触发最新说明。

全局命令默认读取本仓库的 `.figma-local/`，因此从任意业务目录执行都能找到同一桥接服务。必要时仍可用 `--state` 或 `FIGMA_LOCAL_STATE` 覆盖。

当前全局命令安装在正在使用的 Node 版本中。若通过 nvm 切换或升级 Node 后找不到 `figma-local-cli`，回到本仓库重新运行 `npm run install:global`。

## 从业务项目使用

在任意目录：

```sh
figma-local-cli doctor
figma-local-cli sessions
figma-local-cli bind <session-id>
```

也可以在对话中调用 `/figma-local-cli`，同时提供：

- Figma Design URL，最好包含 `node-id`
- 本地业务项目绝对路径
- 用户旅程、页面状态和验收目标

URL 只是目标线索。实际读写仍要求桌面端打开文件、开发插件运行、连接码配对，并由 `sessions` 和 `bind` 核对实时文件与 Page。

## 路径变更

移动或重命名本仓库后：

1. 在新路径运行 `npm run install:global`，刷新命令链接和 Skill。
2. 在 Figma Development 菜单重新导入新路径下的 `dist/plugin/manifest.json`。
3. 重新启动服务、配对并绑定目标文件。

不要删除本仓库；全局命令链接依赖它。卸载时可运行 `npm unlink -g figma-local-cli`，并删除 `~/.trae-cn/skills/figma-local-cli/`。
