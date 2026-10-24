/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { OpenedFile } from '../../src/shared/types'
import type { SummaryProgress, SummaryRequest, SummaryResult } from '../../src/shared/summary'
vi.mock('../../src/renderer/src/lib/extractText', () => ({
  extractText: vi.fn(async () => 'Research findings. '.repeat(30))
}))
vi.mock('../../src/renderer/src/stores/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      config: {
        settings: { activeProfileId: 'default' },
        profiles: [{ id: 'default', contextWindow: 64000 }]
      }
    })
  }
}))
vi.mock('../../src/shared/summary', () => ({ summaryPlan: () => ({ tokens: 100, requests: 1 }) }))
vi.mock('../../src/renderer/src/stores/uiStore', () => ({
  useUIStore: { getState: () => ({ showToast: vi.fn() }) }
}))
import { extractText } from '../../src/renderer/src/lib/extractText'
import {
  bindSummaryEvents,
  summaryKey,
  useSummaryStore
} from '../../src/renderer/src/stores/summaryStore'
const file = (name = 'a'): OpenedFile => ({
  fileId: name,
  path: 'E:/papers/' + name + '.md',
  name: name + '.md',
  kind: 'md',
  text: 'Research findings. '.repeat(30),
  mtimeMs: 1
})
function deferred() {
  let resolve!: () => void, reject!: (e: Error) => void
  const promise = new Promise<void>((ok, fail) => {
    resolve = ok
    reject = fail
  })
  return { promise, resolve, reject }
}
let progress: (p: SummaryProgress) => void, result: (r: SummaryResult) => void, off: () => void
let calls: Array<{ request: SummaryRequest; task: ReturnType<typeof deferred> }>
const api = {
  startSummary: vi.fn(),
  cancelSummary: vi.fn(),
  saveSummary: vi.fn(),
  onSummaryProgress: vi.fn(),
  onSummaryResult: vi.fn()
}
const current = (name = 'a') => useSummaryStore.getState().jobs[summaryKey(file(name))]
const complete = (index: number) => {
  const call = calls[index]
  result({
    jobId: call.request.jobId,
    markdown: '# Completed ' + call.request.title,
    keyTerms: 'terms',
    question: 'question'
  })
  progress({ jobId: call.request.jobId, stage: 'reduce', done: 1, total: 1 })
  call.task.resolve()
}
beforeEach(() => {
  vi.clearAllMocks()
  calls = []
  vi.mocked(extractText).mockResolvedValue('Research findings. '.repeat(30))
  api.startSummary.mockImplementation((request: SummaryRequest) => {
    const task = deferred()
    calls.push({ request, task })
    return task.promise
  })
  api.cancelSummary.mockResolvedValue(undefined)
  api.saveSummary.mockResolvedValue({ ok: true, path: 'E:/reports/saved.md' })
  api.onSummaryProgress.mockImplementation((cb) => {
    progress = cb
    return () => {}
  })
  api.onSummaryResult.mockImplementation((cb) => {
    result = cb
    return () => {}
  })
  vi.stubGlobal('window', { api })
  useSummaryStore.setState({ jobs: {}, activeKey: null, visible: false, cancellingKey: null })
  off = bindSummaryEvents()
})
afterEach(() => {
  off()
  vi.unstubAllGlobals()
})
it('关闭后后台进度继续；再次打开复用任务，完成结果和保存结果均可重看', async () => {
  const store = useSummaryStore.getState(),
    pending = store.start(file())
  await vi.waitFor(() => expect(calls).toHaveLength(1))
  store.close()
  expect(api.cancelSummary).not.toHaveBeenCalled()
  progress({ jobId: calls[0].request.jobId, stage: 'map', done: 2, total: 4 })
  await store.start(file())
  expect(current().progress?.done).toBe(2)
  expect(calls).toHaveLength(1)
  store.close()
  complete(0)
  await pending
  expect(current().status).toBe('unsaved')
  expect(api.saveSummary).not.toHaveBeenCalled()
  expect(useSummaryStore.getState().visible).toBe(false)
  await store.start(file())
  expect(current().result?.markdown).toContain('Completed')
  expect(calls).toHaveLength(1)
  await store.save()
  expect(current().status).toBe('saved')
  store.close()
  await store.start(file())
  expect(current().status).toBe('saved')
  expect(current().promptOpen).toBe(false)
  expect(calls).toHaveLength(1)
})
it('取消二次确认前不终止；确认后忽略迟到进度和结果', async () => {
  const store = useSummaryStore.getState(),
    pending = store.start(file())
  await vi.waitFor(() => expect(calls).toHaveLength(1))
  store.cancel()
  expect(useSummaryStore.getState().cancellingKey).toBe(summaryKey(file()))
  expect(api.cancelSummary).not.toHaveBeenCalled()
  store.dismissCancel()
  expect(current().status).toBe('running')
  store.cancel()
  store.confirmCancel()
  expect(api.cancelSummary).toHaveBeenCalledWith({ jobId: calls[0].request.jobId })
  complete(0)
  await pending
  expect(current()).toBeUndefined()
  expect(useSummaryStore.getState().visible).toBe(false)
  expect(api.saveSummary).not.toHaveBeenCalled()
})
it('错误关闭后保留并可重试，成功后只有显式重试才新建任务', async () => {
  const store = useSummaryStore.getState(),
    first = store.start(file())
  await vi.waitFor(() => expect(calls).toHaveLength(1))
  calls[0].task.reject(new Error('API unavailable'))
  await first
  store.close()
  await store.start(file())
  expect(current().error).toBe('API unavailable')
  expect(calls).toHaveLength(1)
  const retry = store.retry()
  await vi.waitFor(() => expect(calls).toHaveLength(2))
  progress({ jobId: calls[0].request.jobId, stage: 'map', done: 9, total: 9 })
  expect(current().progress?.done).toBe(0)
  complete(1)
  await retry
  expect(current().status).toBe('saved')
  const fresh = store.retry()
  await vi.waitFor(() => expect(calls).toHaveLength(3))
  expect(current().result).toBeNull()
  complete(2)
  await fresh
})
it('切换文档不会取消另一篇的任务，也不会串用进度与完成结果', async () => {
  const store = useSummaryStore.getState(),
    first = store.start(file('a'))
  await vi.waitFor(() => expect(calls).toHaveLength(1))
  store.close()
  const second = store.start(file('b'))
  await vi.waitFor(() => expect(calls).toHaveLength(2))
  complete(0)
  await first
  expect(current('a').status).toBe('unsaved')
  expect(current('b').status).toBe('running')
  expect(api.saveSummary).not.toHaveBeenCalled()
  complete(1)
  await second
  expect(current('b').status).toBe('saved')
  expect(api.saveSummary.mock.calls[0][0].markdown).toContain('Completed b')
  await store.start(file('a'))
  expect(current('a').result?.markdown).toContain('Completed a')
  expect(api.cancelSummary).not.toHaveBeenCalled()
  expect(calls).toHaveLength(2)
})
it('取消提取阶段并重新启动时，旧提取回包不能启动模型请求', async () => {
  let finish!: (text: string) => void
  vi.mocked(extractText).mockImplementationOnce((_file, signal) => {
    expect(signal?.aborted).toBe(false)
    return new Promise<string>((resolve) => {
      finish = resolve
    })
  })
  const store = useSummaryStore.getState(),
    pending = store.start(file())
  store.close()
  await store.start(file())
  expect(extractText).toHaveBeenCalledTimes(1)
  store.cancel()
  store.confirmCancel()
  finish('Research findings. '.repeat(30))
  await pending
  expect(calls).toHaveLength(0)
  const fresh = store.start(file())
  await vi.waitFor(() => expect(calls).toHaveLength(1))
  complete(0)
  await fresh
})
it('取消确认期间完成任务不弹保存窗口；放弃取消仍可查看完成结果', async () => {
  const store = useSummaryStore.getState(),
    pending = store.start(file())
  await vi.waitFor(() => expect(calls).toHaveLength(1))
  store.cancel()
  complete(0)
  await pending
  expect(api.saveSummary).not.toHaveBeenCalled()
  store.dismissCancel()
  expect(current().status).toBe('unsaved')
  expect(current().result?.markdown).toContain('Completed')
})

it('运行中重试取消旧请求，迟到的失败不会覆盖新任务', async () => {
  const store = useSummaryStore.getState(),
    first = store.start(file())
  await vi.waitFor(() => expect(calls).toHaveLength(1))
  const retry = store.retry()
  await vi.waitFor(() => expect(calls).toHaveLength(2))
  expect(api.cancelSummary).toHaveBeenCalledWith({ jobId: calls[0].request.jobId })
  calls[0].task.reject(new Error('Old request cancelled'))
  await first
  expect(current().status).toBe('running')
  expect(current().error).toBe('')
  complete(1)
  await retry
  expect(current().status).toBe('saved')
})
