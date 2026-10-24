/// <reference lib="dom" />
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { resolve } from 'node:path'
import type { YiduAPI } from '../../src/shared/ipc'
declare global {
  interface Window {
    api: YiduAPI
  }
}
let app: ElectronApplication
let page: Page
test.beforeEach(async () => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  )
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: ['.'], env })
  page = await app.firstWindow()
  await expect(page.getByText('打开 PDF 或 Markdown 文件', { exact: true })).toBeVisible()
})
test.afterEach(async () => {
  await app?.close()
})
async function openFixture(name: string) {
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
test('安全边界、标签与打开失败', async () => {
  const prefs = await app.evaluate(({ BrowserWindow }) =>
    (
      BrowserWindow.getAllWindows()[0].webContents as unknown as {
        getLastWebPreferences(): {
          contextIsolation: boolean
          nodeIntegration: boolean
          sandbox: boolean
          webSecurity: boolean
        }
      }
    ).getLastWebPreferences()
  )
  expect(prefs.contextIsolation).toBe(true)
  expect(prefs.nodeIntegration).toBe(false)
  expect(prefs.sandbox).toBe(true)
  expect(prefs.webSecurity).toBe(true)
  expect(
    await page.evaluate(() => ({
      node: 'require' in window,
      process: 'process' in window,
      keys: Object.keys(window.api).sort()
    }))
  ).toEqual({ node: false, process: false, keys: ['openFile', 'openPath'] })
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
    'content',
    /connect-src 'self'/
  )
  expect(
    await page.evaluate(async () => {
      try {
        await fetch('https://example.org/')
        return false
      } catch {
        return true
      }
    })
  ).toBe(true)
  await openFixture('reader.md')
  await expect(page.getByRole('tab', { name: 'reader.md' })).toHaveCount(1)
  await openFixture('reader.md')
  await expect(page.getByRole('tab', { name: 'reader.md' })).toHaveCount(1)
  await openFixture('single-column.pdf')
  await expect(page.locator('[data-page="1"][data-ready=true]')).toBeVisible()
  await page.keyboard.press('Control+Tab')
  await expect(page.getByRole('tab', { name: 'reader.md' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(page.locator('[data-page] canvas')).toHaveCount(0)
  await page.keyboard.press('Control+w')
  await expect(page.getByRole('tab')).toHaveCount(1)
  await openFixture('corrupt.pdf')
  await expect(page.getByRole('alert')).toContainText('无法打开这个文件')
  await page.getByRole('button', { name: '关闭标签', exact: true }).click()
  await expect(page.getByRole('tab')).toHaveCount(1)
  expect(
    await page.evaluate(async () => {
      try {
        await window.api.openPath({ path: 'E:\\private.exe' })
        return false
      } catch {
        return true
      }
    })
  ).toBe(true)
  const url = page.url()
  await page.evaluate(() => {
    location.href = 'https://example.org/'
  })
  await expect.poll(() => page.evaluate(() => location.href)).toBe(url)
})
test('A2 Markdown 排版、公式、代码、原始 HTML 与选区', async () => {
  await openFixture('reader.md')
  await expect(page.locator('article h1')).toHaveText('Reading and Translation')
  await expect(page.locator('article li')).toHaveCount(2)
  await expect(page.locator('article table')).toBeVisible()
  await expect(page.locator('article .hljs-keyword').first()).toBeVisible()
  await expect(page.locator('article .katex')).toHaveCount(2)
  await expect(page.locator('article .katex-display')).toHaveCount(1)
  await expect(page.locator('article')).toContainText('<script>globalThis.pwned = true</script>')
  expect(await page.evaluate(() => 'pwned' in window)).toBe(false)
  expect(await page.locator('article img, article script').count()).toBe(0)
  await page
    .locator('article p')
    .first()
    .evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })
  await expect(page.getByRole('toolbar', { name: '选区操作' })).toBeVisible()
  await expect(page.getByTestId('sentence-card')).toHaveCount(3)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('toolbar', { name: '选区操作' })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/markdown.png' })
})
for (const fixture of ['paper-100.pdf', 'chen-hott-100.pdf'])
  test('A1 100 页首页速度、滚至末页、内存和画布释放 ' + fixture, async () => {
    await app.evaluate(
      ({ dialog }, path) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
      },
      resolve('tests/fixtures', fixture)
    )
    const start = performance.now()
    await page.keyboard.press('Control+o')
    await page.locator('[data-page="1"][data-ready=true]').waitFor()
    const firstPageMs = performance.now() - start
    expect(firstPageMs).toBeLessThan(2000)
    const endStart = performance.now()
    await page.getByTestId('pdf-scroll').evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    await page.locator('[data-page="100"][data-ready=true]').waitFor()
    const lastPageMs = performance.now() - endStart
    expect(lastPageMs).toBeLessThan(2000)
    await expect(page.getByRole('status').last()).toContainText('第 100 / 100 页')
    await expect
      .poll(() =>
        page
          .locator('canvas')
          .evaluateAll(
            (canvases) => canvases.filter((c) => (c as HTMLCanvasElement).width > 0).length
          )
      )
      .toBeLessThan(10)
    const maxFrameGapMs = await page.getByTestId('pdf-scroll').evaluate(async (el) => {
      let previous = performance.now()
      let maxGap = 0
      for (let i = 0; i <= 20; i++) {
        el.scrollTop = ((el.scrollHeight - el.clientHeight) * i) / 20
        await new Promise<void>((done) =>
          requestAnimationFrame((time) => {
            maxGap = Math.max(maxGap, time - previous)
            previous = time
            done()
          })
        )
      }
      return maxGap
    })
    expect(maxFrameGapMs).toBeLessThan(200)
    await page.locator('[data-page="100"][data-ready=true]').waitFor()
    const memoryMB = await app.evaluate(
      ({ app }) =>
        app.getAppMetrics().reduce((sum, metric) => sum + metric.memory.workingSetSize, 0) / 1024
    )
    expect(memoryMB).toBeLessThan(800)
    console.log(JSON.stringify({ fixture, firstPageMs, lastPageMs, maxFrameGapMs, memoryMB }))
    await page.screenshot({ path: 'test-results/' + fixture + '-last-page.png' })
  })
test('A3 50%–300% 每 10% 鼠标选字、文字层与画布对齐、浮层', async () => {
  test.setTimeout(120000)
  await openFixture('single-column.pdf')
  const zoomButton = page.getByRole('button', { name: '缩放比例' })
  await zoomButton.click()
  await page.getByRole('button', { name: '50%', exact: true }).click()
  for (let percent = 50; percent <= 300; percent += 10) {
    await expect(zoomButton).toHaveText(percent + '%')
    await page.getByTestId('pdf-scroll').evaluate((el) => {
      el.scrollTop = 0
      el.scrollLeft = 0
    })
    const first = page.locator('[data-page="1"][data-ready=true]')
    await first.waitFor()
    const geometry = await first.evaluate((element, scale) => {
      const span = element.querySelector('.textLayer span')!
      const range = document.createRange()
      range.setStart(span.firstChild!, 0)
      range.setEnd(span.firstChild!, 6)
      const rect = range.getBoundingClientRect(),
        pageRect = element.getBoundingClientRect()
      const canvas = element.querySelector('canvas')!
      const all = span.getBoundingClientRect()
      const x = all.left - pageRect.left,
        y = all.top - pageRect.top
      const ctx = canvas.getContext('2d')!,
        dpr = devicePixelRatio
      const pixels = ctx.getImageData(
        Math.floor(x * dpr),
        Math.floor(y * dpr),
        Math.ceil(all.width * dpr),
        Math.ceil(all.height * dpr)
      ).data
      let ink = 0
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 100 && pixels[i + 3] > 0) ink++
      return {
        left: rect.left,
        right: rect.right,
        y: rect.top + rect.height / 2,
        ink,
        offset: Math.abs(x / scale - 54),
        scale: getComputedStyle(element).getPropertyValue('--scale-factor')
      }
    }, percent / 100)
    expect(geometry.offset).toBeLessThan(0.5)
    expect(geometry.ink).toBeGreaterThan(10)
    expect(Number(geometry.scale)).toBeCloseTo(percent / 100)
    await page.mouse.move(geometry.left + 0.5, geometry.y)
    await page.mouse.down()
    await page.mouse.move(geometry.right - 0.5, geometry.y, { steps: 8 })
    await page.mouse.up()
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('Timing')
    await expect(page.getByRole('toolbar', { name: '选区操作' })).toBeVisible()
    await expect(page.getByTestId('sentence-card')).toHaveCount(1)
    if ([50, 100, 200, 300].includes(percent))
      await page.screenshot({ path: 'test-results/selection-' + percent + '.png' })
    await page.keyboard.press('Escape')
    if (percent < 300) await page.getByRole('button', { name: '放大', exact: true }).click()
  }
})
test('320 页与扫描 PDF 可打开，最小窗口无整体溢出', async () => {
  await openFixture('large-320.pdf')
  await page.locator('[data-page="1"][data-ready=true]').waitFor()
  await page.getByTestId('pdf-scroll').evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await page.locator('[data-page="320"][data-ready=true]').waitFor()
  await openFixture('scanned.pdf')
  await page.locator('[data-page="1"][data-ready=true]').waitFor()
  expect(await page.locator('.textLayer span').count()).toBe(0)
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(960, 600)
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/minimum-window.png' })
})

test('加密 PDF 就地报错，不执行文档动作', async () => {
  await openFixture('encrypted.pdf')
  await expect(page.getByRole('alert')).toContainText('已加密')
  await page.getByRole('button', { name: '关闭标签', exact: true }).click()
  await expect(page.getByRole('tab')).toHaveCount(0)
})
test('双栏 PDF、键盘选区、滚动隐藏浮层与阅读位置恢复', async () => {
  await openFixture('double-column.pdf')
  await page.locator('[data-page="1"][data-ready=true]').waitFor()
  await page
    .locator('[data-page="1"] .textLayer span')
    .filter({ hasText: 'Smith et al. proposed a method.' })
    .first()
    .evaluate((span) => {
      const selection = window.getSelection()!
      const range = document.createRange()
      range.selectNodeContents(span)
      selection.removeAllRanges()
      selection.addRange(range)
      span.dispatchEvent(
        new KeyboardEvent('keyup', { key: 'ArrowRight', shiftKey: true, bubbles: true })
      )
    })
  await expect(page.getByRole('toolbar', { name: '选区操作' })).toBeVisible()
  await expect(page.getByTestId('sentence-card')).toHaveCount(1)
  await expect(page.getByTestId('sentence-card')).toContainText('Smith et al. proposed a method.')
  await page.getByTestId('pdf-scroll').evaluate((el) => {
    el.scrollTop = 1000
  })
  await expect(page.getByRole('toolbar', { name: '选区操作' })).toHaveCount(0)
  await openFixture('reader.md')
  await page.getByRole('tab', { name: 'double-column.pdf' }).click()
  await expect.poll(() => page.getByTestId('pdf-scroll').evaluate((el) => el.scrollTop)).toBe(1000)
  const scroll = page.getByTestId('pdf-scroll')
  await scroll.focus()
  await page.keyboard.press('Control+=')
  await expect(page.getByRole('button', { name: '缩放比例' })).toHaveText('110%')
  await page.keyboard.press('Control+0')
  await expect(page.getByRole('button', { name: '缩放比例' })).toHaveText('100%')
})
