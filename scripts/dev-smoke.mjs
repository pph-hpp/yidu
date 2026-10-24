import { _electron } from '@playwright/test'
const env = { ...process.env, ELECTRON_RENDERER_URL: 'http://localhost:5173/' }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ args: ['.'], env })
const page = await app.firstWindow()
page.on('pageerror', (error) => console.log('PAGEERROR', error.message))
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('CONSOLE', msg.text())
})
try {
  await page.reload()
  await page.getByText('打开 PDF 或 Markdown 文件', { exact: true }).waitFor({ timeout: 10000 })
  await page.screenshot({ path: 'test-results/dev-window.png' })
  console.log('DEV_WINDOW_OK')
} finally {
  await app.close()
}
