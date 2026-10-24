/// <reference lib="dom" />
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defaultConfig } from '../../src/shared/config'
let app: ElectronApplication, page: Page, server: Server, url: string
let requests: Array<{
  url: string
  body: Record<string, unknown>
  headers: Record<string, unknown>
}>
let mode: 'normal' | 'missing' | 'retry' | 'auth' = 'normal'
test.beforeEach(async ({}, info) => {
  requests = []
  mode = 'normal'
  server = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    requests.push({ url: req.url!, body, headers: req.headers })
    if (mode === 'auth') {
      res.writeHead(401)
      res.end('sk-private should not leak')
      return
    }
    if (mode === 'retry' && requests.length < 3) {
      res.writeHead(429)
      res.end()
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const user = (body.messages as Array<{ content: string }>).at(-1)?.content || ''
    const count = [...user.matchAll(/(?:^|\n)\[(\d+)\]/g)].length || 1
    const anthropic = req.url?.endsWith('/messages')
    const emit = (s: string) =>
      res.write(
        'data: ' +
          JSON.stringify(
            anthropic
              ? { type: 'content_block_delta', delta: { text: s } }
              : { choices: [{ delta: { content: s } }] }
          ) +
          '\n\n'
      )
    for (let i = 1; i <= count; i++) {
      if (mode === 'missing' && count > 1 && i === 2) continue
      emit((i > 1 ? '\n' : '') + '[')
      await new Promise((r) => setTimeout(r, 15))
      emit(i + '] ')
      for (const text of ['时序', '裕量', '译文' + i]) {
        if (res.destroyed) return
        emit(text)
        await new Promise((r) => setTimeout(r, 70))
      }
    }
    res.end('data: [DONE]\n\n')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  url = 'http://127.0.0.1:' + (server.address() as { port: number }).port
  const data = info.outputPath('profile')
  await mkdir(data, { recursive: true })
  const env = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')
  )
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: ['.', '--user-data-dir=' + data], env })
  page = await app.firstWindow()
  const config = defaultConfig()
  config.profiles[0] = { ...config.profiles[0], model: 'mock', baseUrl: url + '/v1' }
  config.settings.translator = { kind: 'llm' }
  await page.evaluate(async (config) => {
    await window.api.setConfig(config)
    await window.api.setSecret({ profileId: 'default', apiKey: 'test-only-key' })
  }, config)
  await page.reload()
  await expect(page.getByLabel('当前模型')).toHaveAttribute('data-value', 'default')
})
test.afterEach(async () => {
  await app?.close()
  await new Promise<void>((r) => server.close(() => r()))
})
const text =
  'Static timing analysis verifies all timing constraints. However, process variation introduces uncertainty. This method improves the timing estimation.'
async function translate(value = text) {
  await page.getByLabel('翻译文本', { exact: true }).fill(value)
  await page.getByLabel('翻译输入的文本').click()
}
test('A4–A6 流式顺序、模式共用数据、缓存与提示词失效', async () => {
  const start = Date.now()
  await translate()
  await expect(page.getByTestId('sentence-card')).toHaveCount(3)
  expect(Date.now() - start).toBeLessThan(300)
  await expect(page.getByTestId('sentence-card').nth(0)).toContainText('时序')
  await expect(page.getByTestId('sentence-card').nth(2)).toContainText('译文3')
  await expect(page.locator('[data-status=done]')).toHaveCount(3)
  await page.getByRole('button', { name: '整段', exact: true }).click()
  await expect(page.getByLabel('翻译栏', { exact: true })).toContainText(
    '时序裕量译文1 时序裕量译文2 时序裕量译文3'
  )
  await page.getByRole('button', { name: '逐句', exact: true }).click()
  expect(requests).toHaveLength(1)
  await translate()
  await expect(page.getByTestId('sentence-card').nth(2)).toContainText('译文3')
  expect(requests).toHaveLength(1)
  await page.getByLabel('设置', { exact: true }).click()
  await page.getByRole('tab', { name: '系统提示词', exact: true }).click()
  await page.getByLabel('领域背景 / 系统提示词').fill('slack 译为时序裕量')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await translate()
  await expect.poll(() => requests.length).toBe(2)
  expect(JSON.stringify(requests[1].body)).toContain('slack 译为时序裕量')
  await expect(page.getByTestId('sentence-card').nth(2)).toContainText('译文3')
  await page.screenshot({ path: 'test-results/m2-translation.png' })
})
test('缺失编号降级、限流重试、错误卡片与取消', async () => {
  mode = 'missing'
  await translate()
  await expect(page.getByTestId('sentence-card').nth(1)).toContainText('时序裕量译文1')
  expect(requests).toHaveLength(2)
  mode = 'retry'
  requests = []
  await page.getByRole('button', { name: '重新翻译', exact: true }).click()
  await expect(page.getByTestId('sentence-card').nth(2)).toContainText('译文3')
  expect(requests).toHaveLength(3)
  mode = 'auth'
  await page.getByRole('button', { name: '重新翻译', exact: true }).click()
  await expect(page.getByTestId('sentence-card').first()).toContainText('API Key 无效或无权限')
  await expect(page.getByLabel('翻译栏', { exact: true })).not.toContainText('sk-private')
  mode = 'normal'
  requests = []
  await translate(
    'An earlier request should be cancelled immediately. This is its second sentence.'
  )
  await translate('Only the latest request should remain visible.')
  await expect(page.getByTestId('sentence-card')).toHaveCount(1)
  await expect(page.getByTestId('sentence-card')).toContainText('Only the latest')
  await expect(page.getByTestId('sentence-card')).toContainText('译文1')
})
test('设置保存、密钥隔离、接口兼容与未保存确认', async ({}, info) => {
  const config = await page.evaluate(() => window.api.getConfig())
  expect(JSON.stringify(config)).not.toContain('test-only-key')
  const stored = await readFile(resolve(info.outputPath('profile'), 'secrets.json'), 'utf8')
  expect(stored).not.toContain('test-only-key')
  await page.getByLabel('设置', { exact: true }).click()
  const keyInput = page.getByRole('dialog', { name: '设置' }).getByLabel('API Key')
  await expect(keyInput).toHaveAttribute('type', 'password')
  await expect(keyInput).toHaveValue('')
  await page.getByRole('button', { name: '显示密钥' }).click()
  await expect(keyInput).toHaveAttribute('type', 'text')
  await expect(keyInput).toHaveValue('test-only-key')
  await page.getByRole('button', { name: '隐藏密钥' }).click()
  await expect(keyInput).toHaveAttribute('type', 'password')
  await expect(keyInput).toHaveValue('')
  await page.getByRole('button', { name: '测试连接', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '连接正常' })).toBeVisible()
  expect(requests[0].body.max_tokens).toBe(5)
  for (const provider of ['anthropic', 'azure-openai'] as const) {
    const result = await page.evaluate(
      ({ config, provider, url }) =>
        window.api.testConnection({ profile: { ...config.profiles[0], provider, baseUrl: url } }),
      { config, provider, url }
    )
    expect(result.ok).toBe(true)
  }
  expect(requests[1].url).toBe('/v1/messages')
  expect(requests[1].headers['x-api-key']).toBe('test-only-key')
  expect(requests[2].url).toContain('/openai/deployments/mock/')
  await page.getByLabel('配置名称', { exact: true }).fill('未保存的修改')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: '放弃对设置的修改？' })).toBeVisible()
  await page.getByRole('button', { name: '继续编辑' }).click()
  await page.screenshot({ path: 'test-results/m2-settings.png' })
  await page.getByRole('button', { name: '保存', exact: true }).click()
  expect((await page.evaluate(() => window.api.getConfig())).profiles[0].name).toBe('未保存的修改')
})
test('选区自动翻译、锁定和编辑原文', async () => {
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, resolve('tests/fixtures/reader.md'))
  await page.keyboard.press('Control+o')
  await expect(page.locator('article h1')).toBeVisible()
  const select = () =>
    page
      .locator('article p')
      .first()
      .evaluate((el) => {
        const r = document.createRange()
        r.selectNodeContents(el)
        const s = getSelection()!
        s.removeAllRanges()
        s.addRange(r)
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
      })
  const start = Date.now()
  await select()
  await expect(page.getByTestId('sentence-card')).toHaveCount(3)
  expect(Date.now() - start).toBeLessThan(300)
  await expect(page.getByTestId('sentence-card').last()).toContainText('译文3')
  await page.getByRole('button', { name: '锁定', exact: true }).click()
  await translate('A locked panel can still translate manually entered text.')
  await expect(page.getByTestId('sentence-card')).toHaveCount(1)
  await select()
  await page.waitForTimeout(400)
  await expect(page.getByTestId('sentence-card')).toHaveCount(1)
  await page.getByLabel('编辑第 1 句原文').click()
  await page.getByLabel('编辑原文', { exact: true }).fill('This is the edited source sentence.')
  await page.getByLabel('编辑原文', { exact: true }).press('Enter')
  await expect(page.getByTestId('sentence-card')).toContainText(
    'This is the edited source sentence.'
  )
  await expect(page.getByTestId('sentence-card')).toContainText('译文1')
})

test('编辑后点击重译提交新原文并恢复浏览模式', async () => {
  await translate('The original source sentence.')
  const card = page.getByTestId('sentence-card')
  await expect(card).toHaveAttribute('data-status', 'done')
  const editor = card.getByLabel('编辑原文', { exact: true })
  for (const source of [
    'The revised source sentence.',
    'Another revision of the source sentence.'
  ]) {
    await card.getByLabel('编辑第 1 句原文').click()
    await expect(editor).toHaveValue(
      source.startsWith('Another')
        ? 'The revised source sentence.'
        : 'The original source sentence.'
    )
    await editor.fill(source)
    const previousRequests = requests.length
    await card.getByLabel('重译第 1 句').click()
    await expect(editor).toHaveCount(0)
    await expect(card).toContainText(source)
    await expect.poll(() => requests.length).toBe(previousRequests + 1)
    const messages = requests.at(-1)!.body.messages as Array<{ content: string }>
    expect(messages.at(-1)!.content).toContain(source)
    await expect(card).toHaveAttribute('data-status', 'done')
    await expect(card).toContainText('译文1')
    await expect(editor).toHaveCount(0)
  }
  await card.getByLabel('重译第 1 句').click()
  await expect(card).toHaveAttribute('data-status', 'done')
  await expect(card).toContainText('Another revision of the source sentence.')
  await expect(editor).toHaveCount(0)
})
