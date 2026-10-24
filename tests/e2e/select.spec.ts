/// <reference lib="dom" />
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { mkdir } from 'node:fs/promises'
let app: ElectronApplication
let page: Page
test.beforeEach(async ({}, info) => {
  const data = info.outputPath('profile')
  await mkdir(data, { recursive: true })
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  )
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: ['.', '--user-data-dir=' + data], env })
  page = await app.firstWindow()
  await expect(page.getByText('打开 PDF 或 Markdown 文件', { exact: true })).toBeVisible()
})
test.afterEach(async () => {
  await app?.close()
})
test('设置中的下拉：尺寸与输入框协调、鼠标与键盘选择、Esc 只关闭列表', async () => {
  await page.getByLabel('设置', { exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '设置' })
  await dialog.getByRole('tab', { name: '模型 API' }).click()
  const provider = dialog.getByRole('combobox', { name: '接口类型' })
  await expect(provider).toHaveAttribute('data-value', 'openai-compatible')
  await provider.click()
  const list = page.getByRole('listbox')
  await expect(list).toBeVisible()
  await list.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  const field = (await provider.boundingBox())!,
    box = (await list.boundingBox())!,
    option = (await list.getByRole('option').first().boundingBox())!
  // 选项行高接近输入框（40px 对 36px），列表与输入框同宽、紧贴下方
  expect(option.height).toBeGreaterThanOrEqual(field.height * 0.85)
  expect(Math.abs(box.width - field.width)).toBeLessThanOrEqual(1)
  expect(box.y - (field.y + field.height)).toBeGreaterThanOrEqual(2)
  expect(box.y - (field.y + field.height)).toBeLessThanOrEqual(8)
  await expect(list.getByRole('option', { selected: true })).toHaveText('OpenAI 兼容接口（推荐）')
  await page.getByRole('option', { name: 'Anthropic Messages' }).click()
  await expect(list).toHaveCount(0)
  await expect(provider).toHaveAttribute('data-value', 'anthropic')
  await expect(dialog.getByLabel('Base URL')).toHaveValue('https://api.anthropic.com')

  await provider.focus()
  await page.keyboard.press('ArrowDown')
  await expect(list).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(provider).toHaveAttribute('data-value', 'azure-openai')

  await page.keyboard.press('Enter')
  await expect(list).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(list).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await expect(provider).toBeFocused()

  await dialog.getByRole('tab', { name: '翻译偏好' }).click()
  await expect(dialog.getByRole('combobox', { name: '目标语言' })).toBeDisabled()
})
test('翻译栏与顶栏的下拉', async () => {
  const engine = page.getByRole('combobox', { name: '翻译引擎' })
  await engine.click()
  const list = page.getByRole('listbox', { name: '翻译引擎' })
  await expect(list).toBeVisible()
  // 分组标题不是选项，键盘导航只在选项间移动
  await expect(list.getByText('大模型', { exact: true })).toBeVisible()
  await expect(list.getByText('机器翻译', { exact: true })).toBeVisible()
  await expect(list.getByRole('option')).toHaveCount(4)
  await expect(list.getByRole('option', { selected: true })).toHaveText('微软翻译（免费）')
  await page.mouse.click(10, 500)
  await expect(page.getByRole('listbox')).toHaveCount(0)
  // 机器翻译不支持提示词
  await expect(page.getByRole('combobox', { name: '当前提示词' })).toBeDisabled()

  const theme = page.getByRole('combobox', { name: '界面主题' })
  await theme.click()
  await page.getByRole('option', { name: '深色' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(theme).toHaveAttribute('data-value', 'dark')
})
