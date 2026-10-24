// 真实机器翻译接口验证（设计文档 8.7）。会把一句固定的英文测试句发送到微软、谷歌（和有道）服务器。
// 用法：npm run build 后执行 node scripts/verify-mt.cjs
// 有道智云可选：设置环境变量 YIDU_YOUDAO_APP_KEY / YIDU_YOUDAO_APP_SECRET 后一并验证；脚本不输出密钥。
// 使用 .local/ 下的独立配置，不影响正常用户设置；不进 CI。
const { _electron: electron } = require('@playwright/test')
const fs = require('node:fs'),
  path = require('node:path')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
for (const name of ['YIDU_MT_BASE_MICROSOFT', 'YIDU_MT_BASE_GOOGLE', 'YIDU_MT_BASE_YOUDAO'])
  delete env[name]
const profile = path.resolve('.local/live-mt-profile')
fs.rmSync(profile, { recursive: true, force: true })
fs.mkdirSync(profile, { recursive: true })
const SENTENCES = [
  'Static timing analysis verifies that every path meets its timing constraints.',
  'However, on-chip variation makes single-corner analysis pessimistic.'
]
;(async () => {
  const app = await electron.launch({ args: ['.', '--user-data-dir=' + profile], env })
  const report = { at: new Date().toISOString(), engines: {} }
  try {
    const page = await app.firstWindow()
    await page.getByLabel('翻译引擎').waitFor()
    const youdao = env.YIDU_YOUDAO_APP_KEY && env.YIDU_YOUDAO_APP_SECRET
    for (const engineId of ['microsoft-free', 'google-free', ...(youdao ? ['youdao'] : [])]) {
      const connection = await page.evaluate(
        (req) => window.api.testMtEngine(req),
        engineId === 'youdao'
          ? { engineId, appKey: env.YIDU_YOUDAO_APP_KEY, appSecret: env.YIDU_YOUDAO_APP_SECRET }
          : { engineId }
      )
      const entry = { connection }
      if (connection.ok) {
        // 走完整界面流程：切换引擎 → 输入翻译 → 逐句卡片
        await page.evaluate(
          async ({ engineId, appKey }) => {
            const c = await window.api.getConfig()
            await window.api.setConfig({
              ...c,
              settings: { ...c.settings, translator: { kind: 'mt', engineId } },
              mt: {
                ...c.mt,
                youdaoAppKey: appKey || c.mt.youdaoAppKey,
                privacyAcked: [...new Set([...c.mt.privacyAcked, engineId])]
              }
            })
          },
          { engineId, appKey: engineId === 'youdao' ? env.YIDU_YOUDAO_APP_KEY : undefined }
        )
        if (engineId === 'youdao')
          await page.evaluate(
            (apiKey) => window.api.setSecret({ profileId: 'youdao', apiKey }),
            env.YIDU_YOUDAO_APP_SECRET
          )
        await page.reload()
        await page.getByLabel('翻译文本', { exact: true }).fill(SENTENCES.join(' '))
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
          { timeout: 60000 }
        )
        entry.cards = await page.getByTestId('sentence-card').evaluateAll((nodes) =>
          nodes.map((n) => ({
            status: n.dataset.status,
            target: n.querySelector('[aria-label="译文"]')?.textContent || ''
          }))
        )
      }
      report.engines[engineId] = entry
    }
    if (!youdao)
      report.engines.youdao = { skipped: '未设置 YIDU_YOUDAO_APP_KEY / YIDU_YOUDAO_APP_SECRET' }
    const secret = env.YIDU_YOUDAO_APP_SECRET
    report.youdaoSecretInConfig = secret
      ? fs.readFileSync(path.join(profile, 'config.json'), 'utf8').includes(secret)
      : null
    fs.mkdirSync('tests/evidence/mt', { recursive: true })
    fs.writeFileSync('tests/evidence/mt/live-mt.json', JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
  } finally {
    await app.close().catch(() => {})
  }
})().catch((e) => {
  console.error('真实机器翻译验证未完成：' + (e && e.message ? e.message.split('\n')[0] : e))
  process.exitCode = 1
})
