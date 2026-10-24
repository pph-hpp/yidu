const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { chromium } = require('@playwright/test')
const { getCurrentFuseWire, FuseV1Options } = require('@electron/fuses')
const { listPackage } = require('@electron/asar')
const { PDFDocument, PDFName } = require('pdf-lib')

async function main() {
  const exe = path.resolve('dist/win-unpacked/译读.exe')
  const evidence = path.resolve('tests/evidence/m5')
  const data = path.resolve('.local/packaged-profile-' + Date.now())
  fs.mkdirSync(data, { recursive: true })
  fs.mkdirSync(evidence, { recursive: true })
  const fixture = path.join(data, 'packaged-smoke.pdf')
  fs.copyFileSync('tests/evidence/m4/standard-annotations.pdf', fixture)
  const fuses = await getCurrentFuseWire(exe)
  const expected = {
    RunAsNode: 48,
    EnableNodeOptionsEnvironmentVariable: 48,
    EnableNodeCliInspectArguments: 48,
    OnlyLoadAppFromAsar: 49
  }
  const checkedFuses = {}
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(fuses[FuseV1Options[name]], value, name)
    checkedFuses[name] = value === 49
  }
  const files = listPackage(path.resolve('dist/win-unpacked/resources/app.asar'))
  assert(!files.some((p) => /(?:^|[\\/])(?:api\.txt|secrets\.json|\.local)(?:$|[\\/])/i.test(p)))
  assert(files.some((p) => p.endsWith('NotoSansSC-Regular.ttf')))
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  const child = spawn(exe, ['--user-data-dir=' + data, '--remote-debugging-port=9341', fixture], {
    env,
    windowsHide: true,
    stdio: 'ignore'
  })
  let browser
  try {
    let endpoint
    for (let i = 0; i < 100; i++) {
      try {
        const response = await fetch('http://127.0.0.1:9341/json/version')
        endpoint = (await response.json()).webSocketDebuggerUrl
        if (endpoint) break
      } catch {}
      await new Promise((r) => setTimeout(r, 200))
    }
    assert(endpoint, 'packaged renderer debugging endpoint')
    browser = await chromium.connectOverCDP(endpoint)
    const context = browser.contexts()[0]
    let page = context.pages()[0]
    if (!page) page = await context.waitForEvent('page')
    await page.getByRole('tab', { name: 'packaged-smoke.pdf', exact: true }).waitFor()
    await page.locator('[data-page="1"][data-ready=true]').waitFor()
    for (const kind of ['highlight', 'background', 'textColor', 'note']) {
      assert.equal(await page.getByTestId('annotation-' + kind).count(), 1)
    }
    const boundary = await page.evaluate(() => ({
      require: 'require' in window,
      process: 'process' in window,
      csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]').content,
      scheme: location.protocol
    }))
    assert.equal(boundary.require, false)
    assert.equal(boundary.process, false)
    assert.equal(boundary.scheme, 'file:')
    await page.getByTestId('annotation-note').click()
    assert.equal(
      await page.getByLabel('便签内容', { exact: true }).inputValue(),
      '中文便签：时序裕量'
    )
    await page.getByLabel('便签内容', { exact: true }).fill('安装包中文保存验证')
    await page.getByRole('button', { name: '完成', exact: true }).click()
    // Browser keyboard input does not guarantee native menu focus. The shared shortcut
    // dispatcher is the same event dispatched by the actual application menu.
    await page.evaluate(() =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))
    )
    await page.getByText('已保存', { exact: true }).waitFor()
    const saved = await PDFDocument.load(fs.readFileSync(fixture))
    const annots = saved
      .getPages()[0]
      .node.Annots()
      .asArray()
      .map((ref) => saved.context.lookup(ref))
    assert(annots.some((a) => a.get(PDFName.of('Contents'))?.decodeText() === '安装包中文保存验证'))
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('dialog', { name: '设置', exact: true }).waitFor()
    await page.screenshot({ path: path.join(evidence, 'packaged-settings.png') })
    fs.writeFileSync(
      path.join(evidence, 'packaged.json'),
      JSON.stringify(
        {
          executable: 'dist/win-unpacked/译读.exe',
          fuses: checkedFuses,
          boundary,
          secretsExcludedFromAsar: true,
          chineseFontBundled: true,
          argvFileOpened: true,
          fourAnnotationsRead: true,
          chineseNoteReadAndSaved: true,
          settingsOpened: true,
          installerExecuted: false
        },
        null,
        2
      )
    )
    console.log(
      'Packaged app: fuses, ASAR, file argument, four annotations, Chinese save, settings and renderer isolation passed.'
    )
    await page.evaluate(() => window.api.confirmClose()).catch(() => {})
  } finally {
    await browser?.close().catch(() => {})
    if (child.exitCode === null) child.kill()
  }
}
main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
