// 打包后实测免费翻译引擎（todo-list 阶段 4）：运行 dist/win-unpacked/译读.exe（不安装），
// 全新配置、无任何密钥，经真实的微软（Bing 网页）接口翻译两句固定测试句，并检查全文总结被禁用。
// 同时把测试专用的引擎地址变量指向不可达端口：翻译成功即说明打包版忽略了这些变量。
// 用法：npm run pack 后执行 node scripts/verify-package-mt.cjs
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { chromium } = require('@playwright/test')

async function main() {
  const exe = path.resolve('dist/win-unpacked/译读.exe')
  const data = path.resolve('.local/packaged-mt-profile-' + Date.now())
  fs.mkdirSync(data, { recursive: true })
  const fixture = path.join(data, 'single-column.pdf')
  fs.copyFileSync('tests/fixtures/single-column.pdf', fixture)
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  for (const name of ['YIDU_MT_BASE_MICROSOFT', 'YIDU_MT_BASE_GOOGLE', 'YIDU_MT_BASE_YOUDAO'])
    env[name] = 'http://127.0.0.1:9'
  const child = spawn(exe, ['--user-data-dir=' + data, '--remote-debugging-port=9342', fixture], {
    env,
    windowsHide: true,
    stdio: 'ignore'
  })
  let browser
  try {
    let endpoint
    for (let i = 0; i < 100 && !endpoint; i++) {
      try {
        endpoint = (await (await fetch('http://127.0.0.1:9342/json/version')).json())
          .webSocketDebuggerUrl
      } catch {}
      if (!endpoint) await new Promise((r) => setTimeout(r, 200))
    }
    assert(endpoint, '打包应用未启动')
    browser = await chromium.connectOverCDP(endpoint)
    const page = browser.contexts()[0].pages()[0]
    await page.getByRole('tab', { name: 'single-column.pdf' }).waitFor({ timeout: 20000 })
    const report = { at: new Date().toISOString() }
    report.engine = await page
      .getByRole('combobox', { name: '翻译引擎' })
      .getAttribute('data-value')
    assert.equal(report.engine, 'mt:microsoft-free')
    const summary = page.getByRole('button', { name: '全文总结' })
    report.summary = {
      unavailable: await summary.getAttribute('data-unavailable'),
      title: await summary.getAttribute('title')
    }
    assert.equal(report.summary.unavailable, 'true')
    await page
      .getByLabel('翻译文本', { exact: true })
      .fill(
        'Static timing analysis verifies that every path meets its timing constraints. However, on-chip variation makes single-corner analysis pessimistic.'
      )
    await page.getByLabel('翻译输入的文本').click()
    await page.getByRole('dialog', { name: '使用微软翻译（免费）翻译' }).waitFor()
    report.privacyDialog = true
    await page.getByRole('button', { name: '继续使用' }).click()
    await page.waitForFunction(
      () => {
        const cards = [...document.querySelectorAll('[data-testid=sentence-card]')]
        return (
          cards.length === 2 &&
          cards.every((el) => ['done', 'error'].includes(el.getAttribute('data-status')))
        )
      },
      undefined,
      { timeout: 60000 }
    )
    report.cards = await page.getByTestId('sentence-card').evaluateAll((nodes) =>
      nodes.map((n) => ({
        status: n.dataset.status,
        target: n.querySelector('[aria-label="译文"]')?.textContent || ''
      }))
    )
    assert(report.cards.every((c) => c.status === 'done' && /[一-鿿]/.test(c.target)))
    report.testOverrideIgnored = true
    fs.mkdirSync('tests/evidence/mt', { recursive: true })
    fs.writeFileSync('tests/evidence/mt/packaged-mt.json', JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
  } finally {
    await browser?.close().catch(() => {})
    child.kill()
  }
}
main().catch((e) => {
  console.error('打包实测未通过：' + (e && e.message ? e.message.split('\n')[0] : e))
  process.exitCode = 1
})
