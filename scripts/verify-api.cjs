const { _electron: electron } = require('@playwright/test')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs'),
  path = require('node:path')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const profile = path.resolve('.local/live-api-profile')
fs.mkdirSync(profile, { recursive: true })
async function launch() {
  const app = await electron.launch({ args: ['.', '--user-data-dir=' + profile], env })
  const page = await app.firstWindow()
  await page.getByLabel('当前模型').waitFor()
  await page.waitForFunction(
    () => document.querySelector('[aria-label="当前模型"]')?.value === 'default'
  )
  return app
}
;(async () => {
  let app = await launch()
  await app.evaluate(({ app }) => app.exit(0))
  const imported = spawnSync(
    require('electron'),
    [
      'scripts/import-api.cjs',
      path.resolve('api.txt'),
      '--allow-this-http',
      '--user-data-dir=' + profile,
      ...process.argv.slice(2).filter((a) => a.startsWith('--model='))
    ],
    { env, encoding: 'utf8', windowsHide: true }
  )
  if (imported.status !== 0) throw new Error('导入未完成')
  app = await launch()
  try {
    const page = await app.firstWindow()
    const connection = await page.evaluate(async () => {
      const config = await window.api.getConfig()
      return window.api.testConnection({ profile: config.profiles[0] })
    })
    const config = await page.evaluate(async () => {
      const cfg = await window.api.getConfig()
      cfg.presets[0].systemPrompt += '\nslack 译为时序裕量。'
      await window.api.setConfig(cfg)
      return {
        profileCount: cfg.profiles.length,
        protocol: new URL(cfg.profiles[0].baseUrl).protocol
      }
    })
    await page.reload()
    await page.getByLabel('当前模型').waitFor()
    await page
      .getByLabel('翻译文本', { exact: true })
      .fill(
        'Static timing analysis checks timing constraints. Positive slack indicates that a timing requirement is satisfied.'
      )
    await page.getByLabel('翻译输入的文本').click()
    await page.waitForFunction(
      () => {
        const cards = [...document.querySelectorAll('[data-testid=sentence-card]')]
        return (
          cards.length === 2 &&
          cards.every((el) => ['done', 'error'].includes(el.getAttribute('data-status')))
        )
      },
      undefined,
      { timeout: 180000 }
    )
    const translations = await page.getByTestId('sentence-card').allTextContents(),
      statuses = await page
        .getByTestId('sentence-card')
        .evaluateAll((nodes) => nodes.map((n) => n.dataset.status))
    const raw = fs.readFileSync('api.txt', 'utf8').trim().split(/\r?\n/).filter(Boolean),
      key = raw
        .at(-1)
        .replace(/^(?:api[_ -]?key|key)\s*[:：=]\s*/i, '')
        .trim()
    const report = {
      connection,
      translations,
      statuses,
      ...config,
      httpException: config.protocol === 'http:' ? '仅用户批准的 API Base URL' : '无（HTTPS）',
      plaintextInConfig: fs.readFileSync(path.join(profile, 'config.json'), 'utf8').includes(key),
      plaintextInSecrets: fs.readFileSync(path.join(profile, 'secrets.json'), 'utf8').includes(key)
    }
    fs.mkdirSync('tests/evidence/m2', { recursive: true })
    fs.writeFileSync('tests/evidence/m2/live-api.json', JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report))
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {})
  }
})().catch(() => {
  console.error('真实 API 验证未完成，未输出敏感配置。')
  process.exitCode = 1
})
