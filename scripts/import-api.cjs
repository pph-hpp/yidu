// Run only explicitly: electron scripts/import-api.cjs <api.txt>. Never print credentials.
const { app, safeStorage } = require('electron')
const fs = require('node:fs')
const Store = require('electron-store')
app.setName('yidu')
if (app.commandLine.hasSwitch('user-data-dir'))
  app.setPath('userData', app.commandLine.getSwitchValue('user-data-dir'))
app.whenReady().then(() => {
  try {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密不可用')
    const path = process.argv[2]
    if (!path || fs.statSync(path).size > 16384) throw new Error('配置文件无效')
    const lines = fs
      .readFileSync(path, 'utf8')
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
    const urlLine = lines.find((s) => /^url\s*[:：=]/i.test(s))
    const modelLine = lines.find((s) => /^model(?:[_ -]?name)?\s*[:：=]/i.test(s))
    const keyLine = lines.find((s) => s !== urlLine && s !== modelLine)
    let url = urlLine?.replace(/^url\s*[:：=]\s*/i, '').trim(),
      model = modelLine?.replace(/^model(?:[_ -]?name)?\s*[:：=]\s*/i, '').trim(),
      key = keyLine?.replace(/^(?:api[_ -]?key|key)\s*[:：=]\s*/i, '').trim()
    if (!url || !model || !key || !['https:', 'http:'].includes(new URL(url).protocol))
      throw new Error('API 配置格式无效')
    const modelOverride = process.argv.find((a) => a.startsWith('--model='))?.slice(8)
    if (modelOverride) model = modelOverride
    const parsed = new URL(url)
    if (parsed.username || parsed.password || parsed.hash) throw new Error('URL 无效')
    if (parsed.pathname === '/') url = parsed.origin + '/v1'
    if (parsed.protocol === 'http:') {
      if (!process.argv.includes('--allow-this-http')) throw new Error('未批准 HTTP')
      fs.writeFileSync(
        require('path').join(app.getPath('userData'), 'http-exceptions.json'),
        JSON.stringify({ urls: [url] })
      )
    }
    if (parsed.protocol === 'https:')
      fs.writeFileSync(
        require('path').join(app.getPath('userData'), 'http-exceptions.json'),
        JSON.stringify({ urls: [] })
      )
    const secrets = new Store({ name: 'secrets', defaults: { keys: {} } })
    const config = new Store({ name: 'config' })
    const data = config.store
    if (!Array.isArray(data.profiles) || !data.profiles.length) throw new Error('请先启动一次应用')
    const id = data.settings.activeProfileId || data.profiles[0].id
    secrets.set('keys', {
      ...secrets.get('keys'),
      [id]: safeStorage.encryptString(key).toString('base64')
    })
    config.set(
      'profiles',
      data.profiles.map((p) =>
        p.id === id
          ? { ...p, name: '我的翻译模型', provider: 'openai-compatible', baseUrl: url, model }
          : p
      )
    )
    console.log('API 配置已导入；密钥已使用系统加密存储。')
    app.quit()
  } catch {
    console.error('API 配置导入失败；未输出文件内容。')
    app.exit(1)
  }
})
