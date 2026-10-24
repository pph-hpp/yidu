/// <reference lib="dom" />
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { defaultConfig } from '../../src/shared/config'
let app: ElectronApplication,
  page: Page,
  server: Server,
  url: string,
  output: string,
  fixture: string
let requests: { stream: boolean; user: string }[],
  slow = false,
  active = 0,
  maxActive = 0
const report =
  '# 《示例论文》阅读总结\n## 一句话概括\n本文提出时序分析方法。\n## 研究问题与动机\n提高时序估计准确性。\n## 方法\n使用静态时序分析。\n## 实验与结论\n原文报告了实验对比。\n## 关键术语\n| 英文 | 中文 | 一句话解释 |\n| --- | --- | --- |\n| slack | 时序裕量 | 时序约束余量 |\n## 局限与可追问的问题\n需要进一步评估不同工艺。'
test.beforeEach(async ({}, info) => {
  requests = []
  slow = false
  active = 0
  maxActive = 0
  output = info.outputPath('report.md')
  fixture = info.outputPath('paper-12.pdf')
  await mkdir(info.outputPath('profile'), { recursive: true })
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.TimesRoman)
  for (let i = 1; i <= 12; i++) {
    const p = pdf.addPage([612, 792])
    for (let line = 0; line < 60; line++)
      p.drawText(
        'Page ' +
          i +
          ' line ' +
          line +
          ': Static timing analysis examines constraints and reports experimental results.',
        { x: 30, y: 760 - line * 12, size: 9, font }
      )
  }
  await writeFile(fixture, await pdf.save())
  server = createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = JSON.parse(Buffer.concat(chunks).toString()),
      user = body.messages.at(-1).content
    requests.push({ stream: body.stream, user })
    active++
    maxActive = Math.max(maxActive, active)
    res.on('close', () => active--)
    if (!body.stream) {
      await new Promise((r) => setTimeout(r, slow ? 3000 : 80))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          choices: [{ message: { content: '本块研究时序分析，关键术语 slack 表示时序裕量。' } }]
        })
      )
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    for (let i = 0; i < report.length; i += 20) {
      if (res.destroyed) return
      res.write(
        'data: ' +
          JSON.stringify({ choices: [{ delta: { content: report.slice(i, i + 20) } }] }) +
          '\n\n'
      )
      await new Promise((r) => setTimeout(r, slow ? 500 : 20))
    }
    res.end('data: [DONE]\n\n')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  url = 'http://127.0.0.1:' + (server.address() as { port: number }).port
  const env = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')
  )
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: ['.', '--user-data-dir=' + info.outputPath('profile')], env })
  page = await app.firstWindow()
  const config = defaultConfig()
  config.profiles[0] = {
    ...config.profiles[0],
    model: 'mock-summary',
    baseUrl: url + '/v1',
    contextWindow: 8000
  }
  await page.evaluate((config) => window.api.setConfig(config), config)
  await page.reload()
  await expect(page.getByLabel('当前模型')).toHaveValue('default')
  await app.evaluate(({ dialog }, output) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: output })
  }, output)
})
test.afterEach(async () => {
  await app?.close()
  server.closeAllConnections()
  await new Promise<void>((r) => server.close(() => r()))
})
async function open(path: string) {
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, path)
  await page.keyboard.press('Control+o')
  await expect(
    page.getByRole('tab', { name: path.split(/[\\/]/).at(-1)!, exact: true })
  ).toHaveAttribute('aria-selected', 'true')
}
test('A9 12 页 Map-Reduce、保存六节报告、加入背景并关闭背景', async () => {
  await open(fixture)
  await page.locator('[data-page="1"][data-ready=true]').waitFor()
  await page.getByRole('button', { name: '全文总结', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '正在总结全文' })).toBeVisible()
  await page.getByText('实时预览', { exact: true }).click()
  await expect(page.getByRole('dialog', { name: '总结已保存' })).toBeVisible({ timeout: 30000 })
  const saved = await readFile(output, 'utf8')
  expect(saved.match(/^## /gm)).toHaveLength(6)
  expect(saved).toContain('源文件：paper-12.pdf')
  expect(saved.charCodeAt(0)).not.toBe(0xfeff)
  expect(requests.filter((r) => !r.stream).length).toBeGreaterThan(1)
  expect(maxActive).toBeLessThanOrEqual(3)
  expect(requests.filter((r) => !r.stream).some((r) => r.user.includes('<<PAGE 12>>'))).toBe(true)
  await page.screenshot({ path: 'test-results/m3-summary-saved.png' })
  await page.getByRole('button', { name: '加入提示词', exact: true }).click()
  await page.getByLabel('设置', { exact: true }).click()
  await page.getByRole('tab', { name: '系统提示词', exact: true }).click()
  const check = page.getByRole('checkbox')
  await expect(check).toBeChecked()
  await check.uncheck()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const config = await page.evaluate(() => window.api.getConfig())
  expect(config.presets[0].snippets).toHaveLength(1)
  expect(config.presets[0].snippets[0].enabled).toBe(false)
  expect(config.presets[0].snippets[0].text).toContain('研究问题与动机')
  expect(config.presets[0].snippets[0].text).not.toContain('## 方法')
})
test('取消网络任务、扫描版检测、取消保存后重新选择', async () => {
  slow = true
  await open(resolve('tests/fixtures/reader.md'))
  await page.getByRole('button', { name: '全文总结', exact: true }).click()
  await expect.poll(() => requests.length).toBeGreaterThan(0)
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(() => active).toBe(0)
  await open(resolve('tests/fixtures/scanned.pdf'))
  await page.getByRole('button', { name: '全文总结', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('扫描版')
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  slow = false
  await open(resolve('tests/fixtures/reader.md'))
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' })
  })
  await page.getByRole('button', { name: '全文总结', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '总结尚未保存' })).toBeVisible()
  await app.evaluate(({ dialog }, output) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: output })
  }, output)
  await page.getByRole('button', { name: '重新选择位置' }).click()
  await expect(page.getByRole('dialog', { name: '总结已保存' })).toBeVisible()
  await page.getByRole('button', { name: '暂不加入' }).click()
})
test('超过 30k token 先确认，不发送模型请求', async ({}, info) => {
  const path = info.outputPath('long.md')
  await writeFile(
    path,
    'A scientific report explains timing constraints and experimental conclusions. '.repeat(4000),
    'utf8'
  )
  await open(path)
  await page.getByRole('button', { name: '全文总结', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '确认全文总结' })).toBeVisible({ timeout: 30000 })
  expect(requests).toHaveLength(0)
  await page.getByRole('button', { name: '取消', exact: true }).click()
  expect(requests).toHaveLength(0)
})
