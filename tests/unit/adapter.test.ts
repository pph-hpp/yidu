import { it, expect, vi } from 'vitest'
vi.mock('electron', () => ({ net: { fetch: vi.fn() } }))
import { requestSpec, FetchAdapter } from '../../src/main/services/llm/adapter'
import { defaultConfig } from '../../src/shared/config'
import { ProfileQueue } from '../../src/main/services/llm/queue'
const p = { ...defaultConfig().profiles[0], model: 'test' },
  opts = { temperature: 0.2, signal: new AbortController().signal }
it('三种接口 URL、鉴权、system 字段', () => {
  const a = requestSpec(
    { ...p, baseUrl: 'https://example.org/v1/chat/completions/' },
    'secret',
    [{ role: 'system', content: 'system' }],
    opts,
    true
  )
  expect(a.url).toBe('https://example.org/v1/chat/completions')
  expect(a.headers.Authorization).toBe('Bearer secret')
  const b = requestSpec(
    { ...p, provider: 'azure-openai', baseUrl: 'https://example.org' },
    'secret',
    [],
    opts,
    true
  )
  expect(b.url).toContain('/openai/deployments/test/chat/completions?api-version=')
  expect(b.headers['api-key']).toBe('secret')
  const c = requestSpec(
    { ...p, provider: 'anthropic', baseUrl: 'https://example.org/v1' },
    'secret',
    [
      { role: 'system', content: 'rules' },
      { role: 'user', content: 'hello' }
    ],
    opts,
    true
  )
  expect(c.url).toBe('https://example.org/v1/messages')
  expect(c.body.system).toBe('rules')
  expect(c.body.messages).toEqual([{ role: 'user', content: 'hello' }])
})
it('流式提取及错误不回显服务端密钥', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response('data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: [DONE]\n\n')
    )
  const adapter = new FetchAdapter(p, 'private', fetcher)
  let result = ''
  for await (const text of adapter.chatStream([{ role: 'user', content: 'hi' }], opts))
    result += text
  expect(result).toBe('你好')
  fetcher.mockResolvedValue(
    new Response(JSON.stringify({ choices: [{ message: { content: '非流式' } }] }))
  )
  expect(await adapter.chat([], opts)).toBe('非流式')
  fetcher.mockResolvedValue(new Response('private sk-sensitive', { status: 401 }))
  await expect(adapter.chat([], opts)).rejects.toThrow('API Key 无效或无权限')
})
it('同模型并发 3、队列中的取消不会占用槽位', async () => {
  const q = new ProfileQueue(),
    c = new AbortController()
  let active = 0,
    max = 0
  const jobs = Array.from({ length: 10 }, () =>
    q.run('p', c.signal, async () => {
      active++
      max = Math.max(max, active)
      await new Promise((r) => setTimeout(r, 2))
      active--
    })
  )
  await Promise.all(jobs)
  expect(max).toBe(3)
  const hold: (() => void)[] = []
  const occupied = Array.from({ length: 3 }, () =>
    q.run('p', c.signal, () => new Promise<void>((r) => hold.push(r)))
  )
  const abort = new AbortController(),
    waiting = q.run('p', abort.signal, async () => 1)
  abort.abort()
  await expect(waiting).rejects.toThrow('已取消')
  hold.forEach((r) => r())
  await Promise.all(occupied)
  expect(await q.run('p', c.signal, async () => 42)).toBe(42)
})
