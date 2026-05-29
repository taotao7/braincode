# 发布记录

## v0.2.6

- 图片制造者路由改用专门的 OpenAI-compatible Images API 策略，不再把图片生成模型加入普通文本模型目录。
- 图像输入路由更严格：带图 prompt 必须由 routeBrain 规划，并选择具备视觉能力的文本角色模型链；Image Maker 只用于生成或编辑图片。
- Config Web 把目录模型、已保存 provider、provider `/models` 和手动模型配置合并为一个添加模型入口，并支持 Anthropic-compatible 模型列表。
- Provider context 预算估算会跳过内联图片 payload 字节但保留元数据，减少图像 prompt 的误报 context overflow。
- npm wrapper 和发布元数据同步到 `0.2.6`，用于匹配同版本 GitHub release 资产。

## v0.2.5

- TUI 升级到 Ink 7 和 React 19，并通过 `markdansi` 渲染 assistant/help transcript 里的 Markdown，标题、列表、inline code、代码块和表格不再以原始 Markdown 形式显示。
- 刷新运行时和前端依赖，包括 Pi packages `0.77.0`、Vite `8.0.14`、React Router `7.16.0`、TypeBox `1.1.39`。
- npm wrapper 和发布元数据同步到 `0.2.5`，用于匹配同版本 GitHub release 资产。

## v0.2.4

- `read_file` 现在会在大文件遇到过小 `limit` 时自动扩大读取窗口，并返回结构化 `nextOffset` metadata，减少一页一页碎片读取导致 transcript 和 provider context 爆炸的问题。

## v0.2.3

- Config Web UI 改为多 tab 管理，模型 tab 放在最前；usage tab 展示按模型、role、运行阶段聚合的 token 统计，并加入 Recharts 图表和点击详情过滤。
- 认证过 Claude Pro/Max、ChatGPT Plus/Pro Codex、GitHub Copilot 等 Pi OAuth 订阅后，可以在模型目录里直接选择对应订阅商模型，不需要重复填写 API key。
- TUI running 状态有独立的一秒计时和轻量动画：前缀符号循环，状态文字逐字高亮，没 token/tool 事件时耗时也会继续更新。
- TUI transcript 折叠改为键盘驱动，按 `Ctrl+T` 可在展开/收起所有可折叠行之间切换；工具调用默认保持短行，参数和结果摘要放到折叠详情里。鼠标捕获仅用于滚轮滚动，可设置 `BRAINCODE_TUI_MOUSE=false` 关闭。
- provider 返回 message size 超限时，会作为 Braincode handoff 边界提示 `/handoff`，让用户从紧凑的 `@@session` packet 继续，而不是静默压缩当前 transcript。
- read-only evidence cache 在 write/execute 工具后会清理缓存和重复计数，减少文件或命令输出变化后的 stale duplicate-read 提醒。
- npm wrapper 和发布元数据同步到 `0.2.3`，用于匹配同版本 GitHub release 资产。

## v0.2.2

- TUI transcript 折叠不再使用鼠标点击，改为 `Ctrl+T` 切换，避免选择文本和折叠命中互相干扰。
- TUI transcript 渲染改为内部 viewport，输入框为空时支持 Up/Down 滚动内容，也支持 PageUp/PageDown、Ctrl+Up/Ctrl+Down 和鼠标滚轮浏览历史，流式输出时不再强制重绘整段终端 scrollback；prompt 历史使用 Ctrl+P/Ctrl+N 切换。
- BrainPet 固定到右下角 footer，默认使用稳定低刷新渲染，会根据当前工具、worker、队列和最近事件汇报进度或简短吐槽；如需动画可设置 `BRAINCODE_TUI_ANIMATIONS=true`。
- npm wrapper 和发布元数据同步到 `0.2.2`，用于匹配同版本 GitHub release 资产。
