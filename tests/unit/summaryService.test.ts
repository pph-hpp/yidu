import { it, expect, vi, afterEach } from 'vitest'
vi.mock('electron', () => ({ net: { fetch: vi.fn() } }))
import { SummaryService } from '../../src/main/services/summary.service'
import { LLMService } from '../../src/main/services/llm/llm.service'
import { FetchAdapter, LLMError } from '../../src/main/services/llm/adapter'
import { defaultConfig } from '../../src/shared/config'
import { SUMMARY_HEADINGS } from '../../src/shared/summary'
import type { ConfigService } from '../../src/main/services/config.service'
import type { SecretService } from '../../src/main/services/secret.service'
import type { FileService } from '../../src/main/services/file.service'
afterEach(() => vi.restoreAllMocks())
it('Map 失败重试复用已完成分块，总结选择指定模型', async () => {
  const cfg = defaultConfig()
  cfg.profiles[0].model = 'translate'
  cfg.profiles.push({ ...cfg.profiles[0], id: 'summary', model: 'summary', contextWindow: 1000 })
  cfg.settings.summaryProfileId = 'summary'
  const llm = new LLMService(
    { get: () => cfg } as ConfigService,
    { has: () => true, get: () => '' } as unknown as SecretService
  )
  const service = new SummaryService(llm, {
    paths: new Map([['file', 'E:/papers/paper.pdf']])
  } as unknown as FileService)
  let failed = false
  const completed = new Set<string>()
  const chat = vi.spyOn(FetchAdapter.prototype, 'chat').mockImplementation(async (msgs) => {
    if (msgs[0].content.includes('第 2/') && !failed) {
      failed = true
      throw new LLMError('AUTH')
    }
    completed.add(msgs[1].content)
    return '已完成分块'
  })
  const stream = vi
    .spyOn(llm, 'stream')
    .mockImplementation(async (_p, _m, _s, emit) =>
      emit('# report\n' + SUMMARY_HEADINGS.map((h) => '## ' + h + '\n内容').join('\n'))
    )
  const req = {
    jobId: 'job',
    fileId: 'file',
    title: 'paper',
    text: Array.from(
      { length: 50 },
      (_, i) => 'Paragraph ' + i + ' scientific findings and experiments. '.repeat(10)
    ).join('\n\n')
  }
  await expect(
    service.start(
      req,
      () => {},
      () => {}
    )
  ).rejects.toThrow('API Key')
  const previouslyCompleted = [...completed]
  chat.mockClear()
  const result = vi.fn()
  await service.start({ ...req, jobId: 'retry' }, () => {}, result)
  for (const args of chat.mock.calls) expect(previouslyCompleted).not.toContain(args[0][1].content)
  expect(stream.mock.calls[0][0].id).toBe('summary')
  expect(result.mock.calls.at(-1)![0].markdown).toContain('模型：summary')
  chat.mockClear()
  await service.start({ ...req, jobId: 'fresh-after-success' }, () => {}, vi.fn())
  expect(chat.mock.calls.length).toBeGreaterThan(1)
  expect(chat.mock.calls.some((args) => previouslyCompleted.includes(args[0][1].content))).toBe(
    true
  )
})
