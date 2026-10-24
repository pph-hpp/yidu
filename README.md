# 译读 · M1

Electron + React + TypeScript 桌面文献阅读器。需求来源为 `docs/译读-开发设计文档.md`；当前只实现第 16 节的 M1。

## 启动

在 Windows PowerShell 中执行：

```powershell
cd E:\CS\zhiyun
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm ci
npm run dev
```

建议使用 Node.js 22 或更新版本。当前机器已安装依赖，可以直接执行 `npm run dev`。字体从 npm 包随构建产物打包，运行时不访问 Google Fonts。

```powershell
npm run typecheck
npm run test
npm run e2e
npm run build
npm run start
```

`npm run e2e` 会先构建，再由 Playwright 启动真实 Electron。无需下载 Playwright 浏览器。测试临时替换系统文件选择框，应用内没有测试专用接口。`test-results/` 保存截图与 JSON 结果；失败时另存 trace。

## 手动试用

1. 用顶栏「+」、空状态「打开文件」或 Ctrl+O 打开 PDF / Markdown。
2. 先打开 `tests/fixtures/reader.md`，查看标题、列表、表格、代码高亮、两类公式和作为文字显示的 script 标签。
3. 打开 `tests/fixtures/chen-hott-100.pdf`，滚动到末页，观察状态栏页码。
4. 在文档里拖选英文，约 300 ms 后右侧出现分句原文卡片；浮层支持复制。M1 尚不调用翻译模型，译文区域保留占位。
5. 用「− / 百分比 / +」、文档区 Ctrl+= / Ctrl+- / Ctrl+0 / Ctrl+滚轮缩放。范围 50%～300%。
6. 打开多个文件，用标签切换、Ctrl+Tab / Ctrl+Shift+Tab 切换，Ctrl+W 或关闭按钮关闭。切回文档保留阅读位置。
7. `encrypted.pdf` 和 `corrupt.pdf` 用于观察打开错误；加密文件密码为 yidu-test，仅用于测试，M1 不提供密码输入。
8. 拖放、最近文件、翻译设置、总结及 PDF 编辑按第 16 节留在后续里程碑；相关按钮禁用。

## 测试素材与范围

- `npm run fixtures` 重新生成原创 CC0 的单栏、双栏、100 页、320 页、扫描页、外部注释等测试素材。
- 真实公式论文及其前 100 页节选保留作者、来源、许可证说明，见 `tests/fixtures/LICENSE.txt`。
- `tests/fixtures/derive.py` 可用 pypdf 重新生成加密文件及 100 页节选；这是可选测试素材工具，不是应用运行依赖。
- M1 的第 15.1 节必测内容为 textClean / splitSentences。streamParser 属于 M2；pdfGeometry / pdf-writer 属于 M4，本次未创建空壳测试假装通过。
- 完整验收及限制见根目录 `M1-验收报告.md`。

