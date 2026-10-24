# 开发与测试

本文面向参与开发的贡献者，记录本地开发、检查、打包和真实接口验证的方法。功能介绍与使用方法见 [README](../README.zh.md)，完整设计见 [开发设计文档](译读-开发设计文档.md)。

## 本地开发

建议使用 Node.js 22。国内网络下载 Electron 较慢时，可先设置镜像：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm ci
npm run dev
```

字体均随应用打包，运行时不访问 Google Fonts。

### 从文本文件导入模型配置（可选）

`api.txt` 是开发辅助输入：放在项目根目录（已被 `.gitignore` 忽略，**不要提交**），格式如下，应用不会监视或自动读取它：

```text
url: https://api.example.com/v1
model: your-model-name
key: your-api-key
```

需要导入时，先启动并关闭一次应用，再执行（可加 `--model=名称` 覆盖模型名）：

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
& .\node_modules\electron\dist\electron.exe scripts/import-api.cjs api.txt
```

之后也可以直接在设置中修改。生产环境默认拒绝远程 HTTP 地址，只允许 HTTPS 和本机地址。

## 检查与打包

```powershell
npm run typecheck   # 类型检查
npm run test        # 单元测试（vitest）
npm run e2e         # 端到端测试（Playwright + 真实 Electron）
npm run dist        # 构建 Windows 安装包
npm run pack        # 只生成未安装目录 dist/win-unpacked
node scripts/verify-package.cjs
```

- E2E 使用真实 Electron 和本地模拟服务，不需要下载 Playwright 浏览器。运行时请避免其他自动化窗口抢夺焦点。
- E2E 中三个机器翻译引擎都指向本地模拟服务（`playwright.config.ts` 默认把它们指向不可达端口），不会访问真实翻译服务。
- 检查会生成 `test-results/`、`tests/evidence/`、`.local/` 等临时目录，均不纳入版本控制，可随时删除。
- `npm run fixtures` 重新生成原创 CC0 测试素材；第三方论文节选的来源与 CC BY 4.0 说明见 `tests/fixtures/LICENSE.txt`。
- Windows 上首次解压 electron-builder 的 `winCodeSign` 缓存需要符号链接权限（开发者模式或管理员），否则签名与写入图标步骤会失败，但应用代码仍会打包到 `dist/win-unpacked`。

## 真实接口验证（手动执行）

以下脚本会访问真实服务，只在需要时手动运行，均使用 `.local/` 下的独立配置，不影响正常用户设置。

大模型（会产生模型用量）：

```powershell
node scripts/verify-api.cjs                  # 先初始化测试配置
node scripts/verify-live-summary.cjs         # 全文总结
node scripts/verify-live-summary.cjs --paper # 使用公开许可论文前 12 页节选
```

免费机器翻译引擎（非官方接口，可能随时失效；会把两句固定的英文测试句发送到对应服务）：

```powershell
node scripts/verify-mt.cjs          # 先 npm run build；设置 YIDU_YOUDAO_APP_KEY / YIDU_YOUDAO_APP_SECRET 时一并验证有道
node scripts/verify-package-mt.cjs  # 先 npm run pack；验证打包版无密钥时可翻译、全文总结禁用
```

单个 PDF 的总结流程诊断（只用本机模拟模型，不调用真实 API）：

```powershell
node scripts/verify-summary-file.cjs 'E:\path\paper.pdf'
```

## 已知限制

- 总结任务和结果只保留在本次应用会话内，退出后不会恢复后台任务；需要留存的报告请保存为 Markdown。
- 「文字颜色」使用白底 FreeText 注释覆盖重绘，不修改原正文；中文首次重绘会嵌入字体，PDF 体积可能增加约 6.4 MB，重复保存会复用字体。
- 扫描版 PDF 可以阅读，但没有 OCR，无法选字翻译或总结。
- 免费翻译引擎（Bing 网页接口、谷歌网页接口）是非官方接口，可能限流或失效；谷歌在国内需要代理。
- 与 Acrobat 的互操作、安装后的文件关联尚未完整验证；尚未配置代码签名证书。
- Electron 33 及构建、测试工具存在依赖审计告警；Electron 虽列在 devDependencies 中，仍会随应用发布。
