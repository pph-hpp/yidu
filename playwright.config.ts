import { defineConfig } from '@playwright/test'
// e2e 绝不访问真实翻译服务：未显式指定 mock 地址时，免费引擎指向一个不监听的本地端口
for (const name of ['YIDU_MT_BASE_MICROSOFT', 'YIDU_MT_BASE_GOOGLE', 'YIDU_MT_BASE_YOUDAO'])
  process.env[name] ??= 'http://127.0.0.1:9'
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  workers: 1,
  expect: { timeout: 10000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: { trace: 'retain-on-failure' }
})
