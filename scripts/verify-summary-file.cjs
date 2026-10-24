const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const assert = require('node:assert/strict')
const { _electron: electron } = require('@playwright/test')
const { PDFDocument } = require('pdf-lib')

async function main() {
  const input = path.resolve(process.argv[2] || '')
  assert(path.extname(input).toLowerCase() === '.pdf', '请提供 PDF 文件路径')
  const expectInvalid = process.argv.includes('--expect-invalid')
  const pages = (await PDFDocument.load(fs.readFileSync(input))).getPageCount()
  const dir = path.resolve('.local/summary-file-' + Date.now())
  fs.mkdirSync(dir, { recursive: true })
  const output = path.join(dir, 'mock-summary.md')
  const counts = { requests: 0, mapRequests: 0, nulCharacters: 0 }
  const seenPages = new Set()
  const report =
    '# 本地模拟验证\n' +
    ['一句话概括', '研究问题与动机', '方法', '实验与结论', '关键术语', '局限与可追问的问题']
      .map((h) => '## ' + h + '\n这是本地测试响应，不是论文总结。')
      .join('\n')
  const server = http.createServer(async (req, res) => {
    try {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString())
      counts.requests++
      for (const message of body.messages) {
        counts.nulCharacters += (message.content.match(/\0/g) || []).length
        for (const match of message.content.matchAll(/<<PAGE (\d+)>>/g))
          seenPages.add(Number(match[1]))
      }
      if (body.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' })
        res.end(
          'data: ' +
            JSON.stringify({ choices: [{ delta: { content: report } }] }) +
            '\n\ndata: [DONE]\n\n'
        )
      } else {
        counts.mapRequests++
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ choices: [{ message: { content: '本地模拟分块提炼完成。' } }] }))
      }
    } catch {
      res.destroy()
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  let app
  try {
    app = await electron.launch({
      args: ['.', '--user-data-dir=' + path.join(dir, 'profile')],
      env
    })
    const page = await app.firstWindow()
    await page.getByLabel('当前模型', { exact: true }).waitFor()
    await page.evaluate(
      async (url) => {
        const config = await window.api.getConfig()
        config.profiles[0] = {
          ...config.profiles[0],
          baseUrl: url,
          model: 'local-summary-check',
          contextWindow: 8000
        }
        await window.api.setConfig(config)
      },
      'http://127.0.0.1:' + server.address().port + '/v1'
    )
    await page.reload()
    await page.getByLabel('当前模型', { exact: true }).waitFor()
    await app.evaluate(
      ({ dialog, BrowserWindow }, { input, output }) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input] })
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: output })
        BrowserWindow.getAllWindows()[0].focus()
      },
      { input, output }
    )
    await page.bringToFront()
    await page.keyboard.press('Control+o')
    await page.getByRole('tab', { name: path.basename(input), exact: true }).waitFor()
    await page.getByRole('button', { name: '全文总结', exact: true }).click()
    await page.waitForFunction(
      () =>
        ['确认全文总结', '总结未完成', '总结已保存'].includes(
          document.querySelector('[role=dialog]')?.getAttribute('aria-label')
        ),
      undefined,
      { timeout: 90000 }
    )
    if (await page.getByRole('dialog', { name: '确认全文总结', exact: true }).count()) {
      await page.getByRole('button', { name: '继续总结', exact: true }).click()
      await page.waitForFunction(
        () =>
          ['总结未完成', '总结已保存'].includes(
            document.querySelector('[role=dialog]')?.getAttribute('aria-label')
          ),
        undefined,
        { timeout: 90000 }
      )
    }
    let reproduced = false
    if (expectInvalid) {
      assert((await page.getByRole('alert').innerText()).includes('文本参数无效'))
      assert.equal(counts.requests, 0)
      reproduced = true
    } else {
      assert.equal(
        await page.getByRole('dialog', { name: '总结已保存', exact: true }).count(),
        1,
        '总结未完成'
      )
      assert.equal(counts.nulCharacters, 0)
      assert.equal(seenPages.size, pages, '必须包含全部页面')
      assert.equal((fs.readFileSync(output, 'utf8').match(/^## /gm) || []).length, 6)
    }
    const result = {
      file: path.basename(input),
      inputPages: pages,
      localMockOnly: true,
      reproducedInvalidText: reproduced,
      saved: !expectInvalid,
      ...counts,
      extractedPageMarkers: seenPages.size
    }
    fs.writeFileSync(path.join(dir, 'verification.json'), JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result))
  } finally {
    await app?.evaluate(({ app }) => app.exit(0)).catch(() => {})
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
}
main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
