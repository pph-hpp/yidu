/// <reference lib="dom" />
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { mkdir, copyFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
let app: ElectronApplication, page: Page, path: string
test.beforeEach(async ({}, info) => {
  const data = info.outputPath('profile')
  await mkdir(data, { recursive: true })
  path = info.outputPath('editable.pdf')
  await copyFile(resolve('tests/fixtures/single-column.pdf'), path)
  const env = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')
  )
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: ['.', '--user-data-dir=' + data], env })
  page = await app.firstWindow()
  await expect(page.getByLabel('当前模型')).toHaveValue('default')
  await open(path)
  await page.locator('[data-page="1"][data-ready=true]').waitFor()
})
test.afterEach(async () => {
  if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => {})
})
async function open(value: string) {
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, value)
  await page.keyboard.press('Control+o')
  await expect(
    page.getByRole('tab', { name: value.split(/[\\/]/).at(-1)!, exact: true })
  ).toHaveAttribute('aria-selected', 'true')
}
async function mark(tool: string, index = 0) {
  await page.getByRole('button', { name: tool, exact: true }).click()
  await page
    .locator('[data-page="1"] .textLayer span')
    .nth(index)
    .evaluate((span) => {
      const range = document.createRange()
      range.selectNodeContents(span)
      const selection = getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
      span.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })
}
test('A10 四类标注、撤销重做、保存和重开继续编辑', async () => {
  for (const [tool, kind, index] of [
    ['高亮', 'highlight', 0],
    ['背景色', 'background', 1],
    ['文字颜色', 'textColor', 2]
  ] as const) {
    await mark(tool, index)
    await expect(page.getByTestId('annotation-' + kind)).toHaveCount(1)
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    await expect(page.getByTestId('annotation-' + kind)).toHaveCount(0)
    await page.getByRole('button', { name: '重做', exact: true }).click()
    await expect(page.getByTestId('annotation-' + kind)).toHaveCount(1)
  }
  await page.getByRole('button', { name: '注释', exact: true }).click()
  const bounds = await page.locator('[data-page="1"]').boundingBox()
  await page.mouse.click(bounds!.x + 550, bounds!.y + 120)
  await page.getByLabel('便签内容', { exact: true }).fill('中文便签：时序裕量')
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await expect(page.getByTestId('annotation-note')).toHaveCount(1)
  await expect(page.getByLabel('有未保存的修改')).toBeVisible()
  await page.keyboard.press('Control+s')
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await expect(page.getByLabel('有未保存的修改')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/m4-annotations.png' })
  await page.keyboard.press('Control+w')
  await expect(page.getByRole('tab')).toHaveCount(0)
  await open(path)
  await page.locator('[data-page="1"][data-ready=true]').waitFor()
  for (const kind of ['highlight', 'background', 'textColor', 'note'])
    await expect(page.getByTestId('annotation-' + kind)).toHaveCount(1)
  await page.getByTestId('annotation-note').click()
  await expect(page.getByLabel('便签内容', { exact: true })).toHaveValue('中文便签：时序裕量')
  await page.getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.getByTestId('annotation-note')).toHaveCount(0)
  await page.keyboard.press('Control+s')
  await expect(page.getByLabel('有未保存的修改')).toHaveCount(0)
})
test('A11 关标签、Ctrl+W、关窗口取消，保存失败不关闭', async () => {
  await mark('高亮')
  await expect(page.getByTestId('annotation-highlight')).toHaveCount(1)
  await page.getByRole('button', { name: '关闭 editable.pdf', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '保存对文件的修改吗？' })).toBeVisible()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByRole('tab')).toHaveCount(1)
  await page.keyboard.press('Control+w')
  await expect(page.getByRole('dialog', { name: '保存对文件的修改吗？' })).toBeVisible()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await expect(page.getByRole('dialog', { name: '保存对文件的修改吗？' })).toBeVisible()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  const original = await readFile(path)
  const lock: ChildProcessWithoutNullStreams = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      "$f=[IO.File]::Open($env:YIDU_LOCK_PATH,'Open','ReadWrite','None');[Console]::WriteLine('locked');[Console]::ReadLine() | Out-Null;$f.Dispose()"
    ],
    { env: { ...process.env, YIDU_LOCK_PATH: path }, windowsHide: true }
  )
  try {
    await new Promise<void>((res, rej) => {
      lock.stdout.once('data', () => res())
      lock.once('error', rej)
    })
    await page.keyboard.press('Control+w')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('文件正被其他程序使用')
    await expect(page.getByRole('tab')).toHaveCount(1)
    await page.getByRole('button', { name: '取消', exact: true }).click()
  } finally {
    lock.stdin.write('\n')
    await new Promise<void>((r) => lock.once('exit', () => r()))
  }
  expect(await readFile(path)).toEqual(original)
  await page.keyboard.press('Control+w')
  await page.getByRole('button', { name: '不保存', exact: true }).click()
  await expect(page.getByRole('tab')).toHaveCount(0)
})
test('另存为更新标签路径；缩放后标注仍对齐；Markdown 工具不可编辑', async ({}, info) => {
  await mark('高亮')
  const svg = page.locator('g[data-kind=highlight] rect').first(),
    first = await svg.getAttribute('x')
  await page.getByLabel('缩放比例').click()
  await page.getByRole('button', { name: '200%', exact: true }).click()
  await page.locator('[data-page="1"][data-ready=true]').waitFor()
  expect(Number(await svg.getAttribute('x'))).toBeCloseTo(Number(first) * 2, 1)
  const target = info.outputPath('copy.pdf')
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
  }, target)
  await page.keyboard.press('Control+Shift+s')
  await expect(page.getByRole('tab', { name: 'copy.pdf', exact: true })).toHaveAttribute(
    'title',
    target
  )
  await open(resolve('tests/fixtures/reader.md'))
  await expect(page.getByRole('button', { name: '高亮', exact: true })).toBeDisabled()
})
