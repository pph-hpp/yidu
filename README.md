# 译读

Electron + React + TypeScript 桌面文献翻译阅读器。按 `docs/译读-开发设计文档.md` 实现 M1～M5；PDF / Markdown 阅读、流式翻译、全文总结、标准 PDF 标注、深色模式和 Windows 安装包已完成。完整验收结果与未验证项目见 [M5-验收报告.md](M5-验收报告.md)。`docs/` 保持原样。

## 启动

当前机器已装好依赖，在 PowerShell 中执行：

```powershell
Set-Location E:\CS\zhiyun
npm run dev
```

也可直接启动 `dist/win-unpacked/译读.exe`（保留整个目录），或运行 `dist/Yidu-Setup-0.1.0-x64.exe` 安装。安装器尚未实际安装验证；未配置代码签名证书。

新环境建议 Node.js 22，先安装依赖：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm ci
npm run dev
```

字体均随应用打包，运行时不访问 Google Fonts。扫描 PDF 可以阅读，但没有 OCR，无法选字翻译或总结。

## 模型配置

右上角设置（Ctrl+,）包含「模型 API」「系统提示词」「翻译偏好」。支持 OpenAI 兼容、Azure 和 Anthropic 协议。填入 Base URL、模型名称、API Key，测试连接后保存。密钥由 Electron safeStorage 加密，只在主进程使用，不回传渲染进程。

当前用户 `api.txt` 的 HTTPS 配置及 `deepseek-flash` 已导入这台机器的用户配置。请关闭旧的开发窗口再启动，以加载新配置。安装包不包含个人模型地址、密钥或 api.txt；复制给另一台机器后需要重新配置。

`api.txt` 只是开发辅助输入，应用不会监视或自动重新读取它；之后可直接在设置中修改模型。需要重新导入时，先启动并关闭一次应用，再执行：

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
& .\node_modules\electron\dist\electron.exe scripts/import-api.cjs api.txt
```

不要把 api.txt 放进版本库。生产默认拒绝远程 HTTP；仅主进程私有的精确地址例外用于先前明确批准的地址。新 HTTPS 配置已清空旧例外。

## 手动试用

1. Ctrl+O、顶栏「+」、最近文件或拖放打开 PDF / Markdown。可先试 `tests/fixtures/reader.md` 和 `single-column.pdf`，再试真实论文 `chen-hott-100.pdf`。
2. 选择英文，右侧显示逐句流式译文。试用整段切换、锁定（Ctrl+L）、原文编辑、重新翻译、复制，以及底部输入翻译。
3. 拖动中间分栏调整右栏，双击恢复 420px；分栏获得键盘焦点后用方向键调整。主题选择器支持浅色、深色、跟随系统。
4. 全文总结（Ctrl+Shift+M）生成后选择 Markdown 保存位置，再决定是否加入系统提示词。设置里可关闭或删除总结背景。
5. PDF 工具栏选择高亮、背景色、文字颜色后拖选；便签可通过注释工具点击页面或对选区添加。Ctrl+Z / Ctrl+Y 撤销重做。Ctrl+S 保存，Ctrl+Shift+S 另存为。先用测试文件或文献副本试用。
6. 修改后关闭标签或窗口，试用取消、保存、不保存；外部修改或占用时会保留当前编辑并提示。
7. 缩放 50%～300%，Ctrl+Tab 切换文档，Home / End 到首页 / 末页。V / H / B / T / N 切换工具，Esc 取消浮层或返回选择工具。

「文字颜色」按设计使用白底 FreeText 近似覆盖重绘，不修改原正文。中文首次重绘会嵌入完整字体，PDF 可能增加约 6.4MB；重复保存复用字体。

## 检查与打包

```powershell
npm run typecheck
npm run test
npm run e2e
npm run dist
node scripts/verify-package.cjs
```

E2E 使用真实 Electron 和本地模拟模型，不需要下载 Playwright 浏览器。运行时请避免同时启动其他自动化窗口抢夺焦点。临时替换原生文件选择对话框仅发生在测试进程，应用没有测试专用 IPC。失败输出在 `test-results/`；验收截图和脱敏记录在 `tests/evidence/`。

真实 API 检查脚本会调用用户配置的服务并产生模型用量，只在需要时手动执行：

```powershell
node scripts/verify-api.cjs
node scripts/verify-live-summary.cjs
node scripts/verify-live-summary.cjs --paper
```

最后一条使用有公开许可的论文前 12 页节选，许可证见 `tests/fixtures/LICENSE.txt`。真实验证使用 `.local/` 下独立配置，不把测试术语和背景写进正常用户设置。

`npm run fixtures` 生成原创 CC0 测试素材；第三方真实论文及节选保留来源与 CC BY 4.0 说明。第 15.1 节列举的清洗、分句、流解析、坐标和四类 PDF 注释测试均已实现。

## 当前交付限制

- Acrobat 互操作、实际安装后的资源管理器文件关联、在线设计画布逐像素比较尚未验证；OpenAI 官方和 Ollama 的真实端点未提供。
- 文档指定的 Electron 33 和构建/测试工具存在依赖审计告警；生产依赖筛选仅余 2 个 low，但 Electron 虽列在 devDependencies 中仍会随应用发布。详细审计见验收报告，不能把生产筛选结果解释为整个安装包没有漏洞。
- Windows 构建缓存首次解压 winCodeSign 时可能需要符号链接权限。本机已保留官方归档中的 Windows 工具并排除不使用的 Darwin 条目后成功构建，没有修改应用安全配置。
