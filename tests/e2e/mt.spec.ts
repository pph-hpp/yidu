/// <reference lib="dom" />
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defaultConfig } from '../../src/shared/config'
import type { YiduAPI } from '../../src/shared/ipc'
declare global {
  interface Window {
    api: YiduAPI
  }
}
// 本地模拟三个机器翻译引擎（设计文档 8.7 的请求格式）
let server: Server, base: string
const mock = {
  google: 'ok' as 'ok' | 'fail',
  llm: 'fail' as 'ok' | 'fail',
  requests: { microsoft: 0, google: 0, youdao: 0, llm: 0 }
}
let app: ElectronApplication, page: Page
test.beforeEach(async ({}, info) => {
  mock.google = 'ok'
  mock.requests = { microsoft: 0, google: 0, youdao: 0, llm: 0 }
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const url = req.url || ''
      const json = (value: unknown, status = 200) => {
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(value))
      }
      // 微软（免费）= Bing 网页翻译：先取页面参数，再调用 ttranslatev3
      if (url.startsWith('/ms/translator'))
        return res.end(
          '<script>var params_AbusePreventionHelper = [1700000000000,"mock-token",3600000];' +
            '_G={IG:"0123456789ABCDEF0123456789ABCDEF"};</script><div data-iid="translator.5023"></div>'
        )
      if (url.startsWith('/ms/ttranslatev3')) {
        mock.requests.microsoft++
        const form = new URLSearchParams(body)
        if (form.get('token') !== 'mock-token' || !url.includes('IG=0123456789ABCDEF'))
          return json({ statusCode: 400 })
        const text = (form.get('text') || '')
          .split('\n\n')
          .map((t) => '微软译文：' + t)
          .join('\n\n')
        return json([{ translations: [{ text, to: 'zh-Hans' }] }])
      }
      if (url.startsWith('/g/translate_a/single')) {
        mock.requests.google++
        if (mock.google === 'fail') return json({}, 503)
        const q = new URLSearchParams(body).get('q') || ''
        return json([
          q
            .split('\n')
            .map((line, i, all) => ['谷歌译文：' + line + (i < all.length - 1 ? '\n' : ''), line])
        ])
      }
      if (url.startsWith('/yd/api')) {
        mock.requests.youdao++
        const form = new URLSearchParams(body)
        if (form.get('appKey') !== 'abcdef0123456789') return json({ errorCode: '108' })
        if (form.get('signType') !== 'v3' || !/^[0-9a-f]{64}$/.test(form.get('sign') || ''))
          return json({ errorCode: '202' })
        return json({ errorCode: '0', translation: ['有道译文：' + form.get('q')] })
      }
      if (url.startsWith('/v1/chat/completions')) {
        mock.requests.llm++
        return json({ error: 'unavailable' }, 500)
      }
      json({}, 404)
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = 'http://127.0.0.1:' + (server.address() as { port: number }).port
  const data = info.outputPath('profile')
  await mkdir(data, { recursive: true })
  const env = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')
  )
  delete env.ELECTRON_RUN_AS_NODE
  env.YIDU_MT_BASE_MICROSOFT = base + '/ms'
  env.YIDU_MT_BASE_GOOGLE = base + '/g'
  env.YIDU_MT_BASE_YOUDAO = base + '/yd'
  app = await electron.launch({ args: ['.', '--user-data-dir=' + data], env })
  page = await app.firstWindow()
  await expect(page.getByText('打开 PDF 或 Markdown 文件', { exact: true })).toBeVisible()
})
test.afterEach(async () => {
  await app?.close()
  await new Promise<void>((r) => server.close(() => r()))
})
const cards = () => page.getByTestId('sentence-card')
async function translate(text: string) {
  await page.getByLabel('翻译文本', { exact: true }).fill(text)
  await page.getByLabel('翻译输入的文本').click()
}
async function chooseEngine(name: string) {
  await page.getByRole('combobox', { name: '翻译引擎' }).click()
  await page.getByRole('option', { name, exact: true }).click()
}
async function ackPrivacy(...ids: string[]) {
  await page.evaluate(async (ids) => {
    const c = await window.api.getConfig()
    await window.api.setConfig({ ...c, mt: { ...c.mt, privacyAcked: ids as never } })
  }, ids)
  await page.reload()
}
async function openFixture(name: string) {
  const path = resolve('tests/fixtures', name)
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, path)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].focus())
  await page.bringToFront()
  await page.keyboard.press('Control+o')
  await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
}
const text = 'Static timing analysis verifies constraints. However, variation adds uncertainty.'

test('A15 无密钥默认微软翻译：隐私确认取消不发送、确认后只弹一次；提示词置灰；总结禁用', async () => {
  await expect(page.getByRole('combobox', { name: '翻译引擎' })).toHaveAttribute(
    'data-value',
    'mt:microsoft-free'
  )
  await expect(page.getByRole('combobox', { name: '当前提示词' })).toBeDisabled()
  await expect(page.getByText('正在使用免费引擎，配置大模型术语更准确')).toBeVisible()

  await translate(text)
  const privacy = page.getByRole('dialog', { name: '使用微软翻译（免费）翻译' })
  await expect(privacy).toContainText('选中的文字会发送到微软的服务器进行翻译')
  await privacy.getByRole('button', { name: '取消' }).click()
  await expect(cards().first()).toContainText('已取消，可在设置中更换翻译引擎')
  expect(mock.requests.microsoft).toBe(0)

  await page.getByRole('button', { name: '重新翻译' }).click()
  await page.getByRole('button', { name: '继续使用' }).click()
  await expect(cards()).toHaveCount(2)
  await expect(cards().nth(0)).toContainText(
    '微软译文：Static timing analysis verifies constraints.'
  )
  await expect(cards().nth(1)).toContainText('微软译文：However, variation adds uncertainty.')
  expect((await page.evaluate(() => window.api.getConfig())).mt.privacyAcked).toEqual([
    'microsoft-free'
  ])

  await translate('A second request needs no confirmation.')
  await expect(cards().first()).toContainText('微软译文：A second request needs no confirmation.')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // 关闭免费引擎提示后持久化
  await page.getByRole('button', { name: '不再显示此提示' }).click()
  await expect(page.getByText('正在使用免费引擎，配置大模型术语更准确')).toHaveCount(0)
  expect((await page.evaluate(() => window.api.getConfig())).mt.hideFreeHint).toBe(true)

  await openFixture('single-column.pdf')
  const summary = page.getByRole('button', { name: '全文总结' })
  await expect(summary).toHaveAttribute('data-unavailable', 'true')
  await expect(summary).toHaveAttribute('title', '全文总结需要配置大模型 API')
  await summary.click()
  const settings = page.getByRole('dialog', { name: '设置' })
  await expect(settings.getByRole('tab', { name: '模型 API' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+Shift+M')
  await expect(settings).toBeVisible()
  await expect(page.getByRole('dialog', { name: '正在总结全文' })).toHaveCount(0)
})

test('A16/A17 切换引擎不命中旧缓存；引擎失效时一键切换到微软翻译', async () => {
  await ackPrivacy('microsoft-free', 'google-free')
  await translate(text)
  await expect(cards().nth(1)).toContainText('微软译文')
  const microsoft = mock.requests.microsoft
  // 同一引擎再次翻译命中缓存，不发请求
  await translate(text)
  await expect(cards().nth(1)).toContainText('微软译文')
  expect(mock.requests.microsoft).toBe(microsoft)

  await chooseEngine('谷歌翻译（免费）')
  await expect(page.getByRole('combobox', { name: '翻译引擎' })).toHaveAttribute(
    'data-value',
    'mt:google-free'
  )
  await page.getByRole('button', { name: '重新翻译' }).click()
  await expect(cards().nth(0)).toContainText(
    '谷歌译文：Static timing analysis verifies constraints.'
  )
  await expect(cards().nth(1)).toContainText('谷歌译文：However, variation adds uncertainty.')
  expect(mock.requests.google).toBe(1) // 两句合并成一次请求

  mock.google = 'fail'
  await translate('Google is unreachable now.')
  await expect(cards().first()).toContainText('谷歌翻译不可用（可能需要代理）')
  await cards().first().getByRole('button', { name: '切换到微软翻译（免费）' }).click()
  await expect(cards().first()).toContainText('微软译文：Google is unreachable now.')
  await expect(page.getByRole('combobox', { name: '翻译引擎' })).toHaveAttribute(
    'data-value',
    'mt:microsoft-free'
  )
})

test('A17 开启回退时大模型失败改用微软翻译并提示', async () => {
  const config = defaultConfig()
  config.profiles[0] = { ...config.profiles[0], model: 'mock', baseUrl: base + '/v1' }
  config.settings.translator = { kind: 'llm' }
  config.settings.llmFallbackToMt = true
  await page.evaluate(async (config) => {
    await window.api.setConfig(config)
    await window.api.setSecret({ profileId: 'default', apiKey: 'test-only-key' })
  }, config)
  await page.reload()
  await expect(page.getByRole('combobox', { name: '当前提示词' })).toBeEnabled()
  await translate(text)
  await expect(
    page.getByRole('status').filter({ hasText: '大模型请求失败，已改用微软翻译（免费）' })
  ).toBeVisible({ timeout: 20000 })
  await expect(cards().nth(1)).toContainText('微软译文：However, variation adds uncertainty.')
  expect(mock.requests.llm).toBeGreaterThan(0)
})

test('A18 有道智云：剪贴板识别、测试连接、保存后翻译，密钥不写入配置', async () => {
  await page.getByLabel('设置', { exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置' })
  await expect(settings.getByRole('tab', { name: '翻译引擎' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await settings.getByRole('radio', { name: /有道智云/ }).check()
  const appKey = settings.getByLabel('应用 ID'),
    secret = settings.getByLabel(/^应用密钥/)
  // 错误的应用 ID 显示中文原因
  await appKey.fill('0000000000000000')
  await secret.fill('S'.repeat(32))
  await settings.getByRole('button', { name: '测试连接' }).last().click()
  await expect(settings.getByRole('status').filter({ hasText: '应用 ID 无效' })).toBeVisible()

  await app.evaluate(({ clipboard }) =>
    clipboard.writeText('应用ID：abcdef0123456789\n应用密钥：' + 'K1'.repeat(16))
  )
  await settings.getByRole('button', { name: '从剪贴板识别' }).click()
  const confirm = page.getByRole('dialog', { name: '从剪贴板识别' })
  await expect(confirm).toContainText('应用 ID abcd…6789')
  await confirm.getByRole('button', { name: '填入' }).click()
  await expect(appKey).toHaveValue('abcdef0123456789')
  await expect(settings.getByRole('status').filter({ hasText: '连接正常' })).toBeVisible()

  await settings.getByRole('button', { name: '保存', exact: true }).click()
  await expect(settings).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: '翻译引擎' })).toHaveAttribute(
    'data-value',
    'mt:youdao'
  )
  const config = JSON.stringify(await page.evaluate(() => window.api.getConfig()))
  expect(config).toContain('abcdef0123456789')
  expect(config).not.toContain('K1K1K1')

  // 官方接口不弹免费引擎的隐私确认
  await translate(text)
  await expect(cards().nth(1)).toContainText('有道译文：However, variation adds uncertainty.')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(mock.requests.youdao).toBeGreaterThanOrEqual(3)
})
