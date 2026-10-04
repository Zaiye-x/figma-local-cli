# 真实 Figma → 前端 smoke

此示例只实现 `examples/smoke.js` 的 Start → Continue → Complete 两屏，证明 Agent 可以消费 CLI 的真实交接包。它不是通用 Figma 转代码工具，也不代表已认可的业务产品。

本次已生成的前端位于 `artifacts/real-20261004/frontend/`，含离线字体和 SIL OFL 许可证。双击 `index.html`，或在项目根目录运行：

```sh
python3 -m http.server 3913 --bind 127.0.0.1 --directory artifacts/real-20261004/frontend
```

## 重新构建

先按项目 README 在真实 Figma 执行 smoke，并选中两屏及按钮组件导出 handoff。阅读该包的 `HANDOFF.md`、来源、完整性与认可状态，再传入新目录：

```sh
node examples/frontend-smoke/build.mjs <handoff目录> <新前端目录>
```

构建器核对两屏与原型目标，使用真实节点文案、Auto Layout 数值、变量绑定和 `token-index.json`。它复制原 `tokens.css`，在新目录记录本地 HTML 组件映射及来源，保留原始候选资产包。

把 Inter 字体及许可放入前端目录，文件名分别为 `InterVariable.woff2` 和 `Inter-OFL.txt`。来源：

- https://raw.githubusercontent.com/rsms/inter/master/docs/font-files/InterVariable.woff2
- https://raw.githubusercontent.com/rsms/inter/master/LICENSE.txt

本次浏览器验证使用 `test/frontend_smoke.py`，读取 `artifacts/real-20261004/handoff/snapshot.json`。服务地址可通过 `FRONTEND_SMOKE_URL` 设置。已测 360×420 画框、按钮坐标与高度、鼠标点击、Tab/Enter、焦点、返回、深链接刷新、320px 不溢出与至少 44px 触屏目标。

Figma 与浏览器字体宽度可能存在微小偏差；本次按钮相差约 1.4px。正式项目应使用一致的字体版本，并根据具体需求补齐业务状态和完整响应式设计。
