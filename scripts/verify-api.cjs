const { _electron: electron } = require('@playwright/test')
const { spawnSync } = require('node:child_process')
const { mkdirSync, writeFileSync, readFileSync } = require('node:fs')
const path = require('node:path')
const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE
async function launch(){const app=await electron.launch({args:['.'],env});await app.firstWindow();return app}
;(async()=>{
  let app=await launch()
  await app.close()
  const imported=spawnSync(require('electron'),['scripts/import-api.cjs',path.resolve('api.txt')],{env,encoding:'utf8',windowsHide:true})
  if(imported.status!==0) throw new Error('API 导入未完成')
  app=await launch()
  try {
    const page=await app.firstWindow()
    await page.getByLabel('设置',{exact:true}).click()
    await page.getByRole('button',{name:'测试连接',exact:true}).click()
    const status=page.getByRole('status').filter({hasText:/连接正常|无效|失败|找不到|异常|频繁|过长/})
    await status.waitFor({timeout:90000})
    const test=await status.textContent()
    await page.getByRole('button',{name:'取消',exact:true}).click()
    await page.getByLabel('翻译文本',{exact:true}).fill('Static timing analysis checks timing constraints. Positive slack indicates that a timing requirement is satisfied.')
    await page.getByLabel('翻译输入的文本').click()
    await page.locator('[data-status=done],[data-status=error]').first().waitFor({timeout:180000})
    await page.waitForFunction(()=>[...document.querySelectorAll('[data-testid=sentence-card]')].every(el=>['done','error'].includes(el.getAttribute('data-status'))),{timeout:180000})
    const translated=await page.getByTestId('sentence-card').allTextContents()
    const safeConfig=await page.evaluate(()=>window.api.getConfig())
    const dataPath=await app.evaluate(({app})=>app.getPath('userData'))
    const raw=readFileSync('api.txt','utf8').trim().split(/\r?\n/).filter(Boolean)
    const key=raw.at(-1).replace(/^(?:api[_ -]?key|key)\s*[:：=]\s*/i,'').trim()
    const plaintextInConfig=readFileSync(path.join(dataPath,'config.json'),'utf8').includes(key)
    const plaintextInSecrets=readFileSync(path.join(dataPath,'secrets.json'),'utf8').includes(key)
    const report={test,translated,plaintextInConfig,plaintextInSecrets,profileCount:safeConfig.profiles.length}
    mkdirSync('tests/evidence/m2',{recursive:true})
    writeFileSync('tests/evidence/m2/live-api.json',JSON.stringify(report,null,2))
    console.log(JSON.stringify(report))
  } finally {await app.close()}
})().catch(()=>{console.error('真实 API 验证未完成，未输出敏感配置。');process.exitCode=1})

