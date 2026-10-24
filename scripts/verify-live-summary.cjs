const { _electron: electron } = require('@playwright/test'),
  { PDFDocument, StandardFonts } = require('pdf-lib'),
  fs = require('fs'),
  path = require('path')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
;(async () => {
  const dir = path.resolve('.local/live-summary')
  fs.mkdirSync(dir, { recursive: true })
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.TimesRoman)
  for (let n = 1; n <= 12; n++) {
    const p = pdf.addPage([612, 792])
    p.drawText('Synthetic timing analysis study - Page ' + n, { x: 50, y: 740, size: 16, font })
    ;[
      'This demonstration paper studies static timing analysis for digital circuits.',
      'The research question is how to estimate timing slack under process variation.',
      'The method compares graph-based propagation with a deterministic baseline.',
      'Illustrative experiment ' + n + ': the proposed method improves worst-case slack.',
      'All measurements are synthetic examples; no real experiment is claimed.',
      'Limitations include simplified delay models and missing physical validation.',
      'Future work should evaluate public benchmark circuits and correlated variation.'
    ].forEach((line, i) => p.drawText(line, { x: 50, y: 700 - i * 28, size: 11, font }))
  }
  const realPaper = process.argv.includes('--paper')
  const input = path.join(dir, realPaper ? 'chen-hott-excerpt-12.pdf' : 'synthetic-study-12.pdf'),
    output = path.join(dir, realPaper ? 'paper-summary.md' : 'summary.md')
  if (realPaper) {
    const original = await PDFDocument.load(fs.readFileSync('tests/fixtures/chen-hott-120.pdf')),
      excerpt = await PDFDocument.create()
    for (const p of await excerpt.copyPages(
      original,
      Array.from({ length: 12 }, (_, i) => i)
    ))
      excerpt.addPage(p)
    fs.writeFileSync(input, await excerpt.save())
  } else fs.writeFileSync(input, await pdf.save())
  const evidenceName = realPaper ? 'live-paper-summary' : 'live-summary'
  const app = await electron.launch({
    args: ['.', '--user-data-dir=' + path.resolve('.local/live-api-profile')],
    env
  })
  try {
    const page = await app.firstWindow()
    await page.getByLabel('当前模型').waitFor()
    await app.evaluate(
      ({ dialog }, { input, output }) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input] })
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: output })
      },
      { input, output }
    )
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].focus())
    await page.bringToFront()
    await page.keyboard.press('Control+o')
    await page.locator('[data-page="1"][data-ready=true]').waitFor()
    await page.getByRole('button', { name: '全文总结', exact: true }).click()
    await page.getByRole('dialog', { name: '总结已保存', exact: true }).waitFor({ timeout: 180000 })
    const report = fs.readFileSync(output, 'utf8'),
      headings = report.match(/^## .+$/gm)
    await page.getByRole('button', { name: '加入提示词', exact: true }).click()
    const snippets = await page.evaluate(
      async () => (await window.api.getConfig()).presets[0].snippets
    )
    fs.mkdirSync('tests/evidence/m3', { recursive: true })
    fs.writeFileSync('tests/evidence/m3/' + evidenceName + '.md', report)
    const result = {
      inputPages: 12,
      fixture: realPaper
        ? 'Chen & Hott, arXiv:2106.03825v5 前 12 页节选（CC BY 4.0，非完整论文）'
        : '自行生成的合成研究说明，非用户文献',
      headings,
      saved: true,
      addedToPrompt: snippets.some((s) => s.source === input),
      utf8NoBom: report.charCodeAt(0) !== 0xfeff
    }
    fs.writeFileSync('tests/evidence/m3/' + evidenceName + '.json', JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result))
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {})
  }
})().catch(() => {
  console.error('真实总结验证未完成，未输出敏感配置。')
  process.exitCode = 1
})
