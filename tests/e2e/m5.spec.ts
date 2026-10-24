/// <reference lib="dom" />
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
let app: ElectronApplication, page: Page, profile: string
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    (e): e is [string, string] => typeof e[1] === 'string' && e[0] !== 'ELECTRON_RUN_AS_NODE'
  )
)
test.beforeEach(async ({}, info) => {
  profile = info.outputPath('profile')
  await mkdir(profile, { recursive: true })
  app = await electron.launch({ args: ['.', '--user-data-dir=' + profile], env })
  page = await app.firstWindow()
  // 首次使用免费引擎的隐私确认另有专门测试，这里预先确认，避免弹窗打断选字流程
  await page.evaluate(async () => {
    const c = await window.api.getConfig()
    await window.api.setConfig({ ...c, mt: { ...c.mt, privacyAcked: ['microsoft-free'] } })
  })
  await page.reload()
  await expect(page.getByLabel('翻译引擎')).toHaveAttribute('data-value', 'mt:microsoft-free')
})
test.afterEach(async () => {
  if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => {})
})
async function open(name: string) {
  const path = resolve('tests/fixtures', name)
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, path)
  await page.keyboard.press('Control+o')
  await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
}
test('分栏鼠标/键盘/复位/持久化，最近文件及单实例转交', async () => {
  const split = page.getByRole('separator', { name: '调整翻译栏宽度' })
  await split.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(split).toHaveAttribute('aria-valuenow', '430')
  await expect
    .poll(() => page.evaluate(async () => (await window.api.getConfig()).settings.rightPaneWidth))
    .toBe(430)
  await split.dblclick()
  await expect(split).toHaveAttribute('aria-valuenow', '420')
  const box = await split.boundingBox()
  await page.mouse.move(box!.x + 4, box!.y + 60)
  await page.mouse.down()
  await page.mouse.move(box!.x - 80, box!.y + 60)
  await page.mouse.up()
  expect(Number(await split.getAttribute('aria-valuenow'))).toBeGreaterThan(490)
  await open('reader.md')
  await page.keyboard.press('Control+w')
  await expect(
    page.getByRole('navigation', { name: '最近文件' }).getByRole('button', { name: 'reader.md' })
  ).toBeVisible()
  await page
    .getByRole('navigation', { name: '最近文件' })
    .getByRole('button', { name: 'reader.md' })
    .click()
  await expect(page.getByRole('tab')).toHaveCount(1)
  const child = spawn(
    resolve('node_modules/electron/dist/electron.exe'),
    ['.', '--user-data-dir=' + profile, resolve('tests/fixtures/single-column.pdf')],
    { env, windowsHide: true, stdio: 'ignore' }
  )
  await new Promise<void>((res, rej) => {
    child.once('exit', () => res())
    child.once('error', rej)
  })
  await expect(page.getByRole('tab', { name: 'single-column.pdf', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
  expect(await page.evaluate(async () => (await window.api.recentFiles()).length)).toBe(2)
})
test('追加、排序、悬停联动及全局快捷键', async () => {
  await open('single-column.pdf')
  await page.locator('[data-page="1"][data-ready=true]').waitFor()
  const select = async (index: number) =>
    page
      .locator('[data-page="1"] .textLayer span')
      .nth(index)
      .evaluate((span) => {
        const r = document.createRange()
        r.selectNodeContents(span)
        const s = getSelection()!
        s.removeAllRanges()
        s.addRange(r)
        span.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
      })
  await select(1)
  await expect(page.getByTestId('sentence-card')).toHaveCount(1)
  const first = await page.getByTestId('sentence-card').innerText()
  await select(2)
  await page.getByRole('button', { name: '追加到上一段', exact: true }).click()
  expect(await page.getByTestId('sentence-card').count()).toBeGreaterThan(1)
  await expect(page.getByTestId('sentence-card').first()).toContainText('Static timing')
  await page.getByTestId('sentence-card').first().hover()
  await expect(page.locator('[data-source-outline]').first()).toBeVisible()
  await page.locator('[data-page="1"] .textLayer span').nth(1).hover()
  await expect(page.locator('[data-testid=sentence-card][data-linked=true]')).toHaveCount(1)
  expect(first).toContain('Static timing')
  await page.keyboard.press('Control+l')
  await expect(page.getByRole('button', { name: '已锁定', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await page.keyboard.press('Control+,')
  await expect(page.getByRole('dialog', { name: '设置', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByLabel('PDF 文档', { exact: true }).focus()
  await page.keyboard.press('End')
  await expect
    .poll(() => page.getByLabel('PDF 文档', { exact: true }).evaluate((e) => e.scrollTop))
    .toBeGreaterThan(2000)
  await page.keyboard.press('Home')
  await expect
    .poll(() => page.getByLabel('PDF 文档', { exact: true }).evaluate((e) => e.scrollTop))
    .toBe(0)
})
test('A13/A14 两种尺寸、双主题、token 尺寸/对比度和对话框键盘', async () => {
  await mkdir('tests/evidence/m5', { recursive: true })
  let cdp = await page.context().newCDPSession(page)
  const results: unknown[] = []
  await open('reader.md')
  for (const [width, height, dpr] of [
    [1366, 768, 1],
    [1707, 960, 1.5]
  ]) {
    await app.evaluate(({ app }) => app.exit(0))
    app = await electron.launch({
      args: ['.', '--user-data-dir=' + profile, '--force-device-scale-factor=' + dpr],
      env
    })
    page = await app.firstWindow()
    await expect(page.getByLabel('翻译引擎')).toHaveAttribute('data-value', 'mt:microsoft-free')
    await open('reader.md')
    cdp = await page.context().newCDPSession(page)
    await app.evaluate(
      ({ BrowserWindow }, { width, height }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(width, height),
      { width, height }
    )
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: dpr,
      mobile: false
    })
    for (const theme of ['light', 'dark']) {
      await page.getByRole('combobox', { name: '界面主题' }).click()
      await page.getByRole('option', { name: theme === 'light' ? '浅色' : '深色' }).click()
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: dpr,
        mobile: false
      })
      await page.waitForTimeout(200)
      const result = await page.evaluate(() => {
        const css = getComputedStyle(document.documentElement),
          get = (n: string) => css.getPropertyValue(n).trim()
        const l = (hex: string) => {
          const v = hex
            .slice(1)
            .match(/../g)!
            .map((x) => parseInt(x, 16) / 255)
            .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
          return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
        }
        const contrast = (a: string, b: string) =>
          (Math.max(l(get(a)), l(get(b))) + 0.05) / (Math.min(l(get(a)), l(get(b))) + 0.05)
        return {
          theme: document.documentElement.dataset.theme,
          width: innerWidth,
          height: innerHeight,
          dpr: devicePixelRatio,
          overflow: document.documentElement.scrollWidth > innerWidth,
          top: document.querySelector('header')!.getBoundingClientRect().height,
          status: document.querySelector('footer[role=status]')!.getBoundingClientRect().height,
          right: document.querySelector('aside')!.getBoundingClientRect().width,
          contrasts: [
            contrast('--text-secondary', '--bg-panel'),
            contrast('--text-primary', '--bg-panel'),
            contrast('--bg-panel', '--accent'),
            contrast('--accent-ink', '--accent-soft')
          ],
          unnamedButtons: Array.from(document.querySelectorAll('button')).filter(
            (b) =>
              b.getClientRects().length && !b.textContent?.trim() && !b.getAttribute('aria-label')
          ).length
        }
      })
      expect(result.dpr).toBeCloseTo(dpr, 2)
      expect(result.overflow).toBe(false)
      expect(result.top).toBe(52)
      expect(result.status).toBe(28)
      expect(result.right).toBe(420)
      expect(result.unnamedButtons).toBe(0)
      for (const contrast of result.contrasts) expect(contrast).toBeGreaterThanOrEqual(4.5)
      results.push(result)
      await page.screenshot({ path: 'tests/evidence/m5/layout-' + width + '-' + theme + '.png' })
    }
  }
  await page.keyboard.press('Control+,')
  const dialog = page.getByRole('dialog', { name: '设置', exact: true })
  await expect(dialog).toBeVisible()
  await page.screenshot({ path: 'tests/evidence/m5/settings-dark.png' })
  for (let i = 0; i < 35; i++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate((e) => e.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await writeFile('tests/evidence/m5/layout.json', JSON.stringify(results, null, 2))
})

test('原生文件拖放、相对图片 blob 与远程图片禁用', async ({}, info) => {
  const dir = info.outputPath('images')
  await mkdir(dir, { recursive: true })
  const { copyFile } = await import('node:fs/promises')
  await copyFile(resolve('resources/icon.png'), resolve(dir, 'plot.png'))
  const md = resolve(dir, 'images.md')
  await writeFile(
    md,
    '# Local image\n\n![示意图](plot.png)\n\n![远程图片](https://example.org/remote.png)\n\n![越界](../secret.png)'
  )
  const cdp = await page.context().newCDPSession(page)
  const data = { items: [], files: [md], dragOperationsMask: 1 }
  for (const type of ['dragEnter', 'dragOver', 'drop'] as const)
    await cdp.send('Input.dispatchDragEvent', { type, x: 300, y: 300, data })
  await expect(page.getByRole('tab', { name: 'images.md', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  const img = page.getByRole('img', { name: '示意图', exact: true })
  await expect(img).toHaveAttribute('src', /^blob:/)
  await expect.poll(() => img.evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBe(256)
  await expect(page.locator('article img')).toHaveCount(1)
  await expect(page.locator('article')).toContainText('远程图片')
  expect(await page.evaluate(() => 'require' in window || 'process' in window)).toBe(false)
})
