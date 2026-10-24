import { createHash } from 'node:crypto'
import { basename } from 'node:path'
import {
  summaryPlan,
  reportPrompt,
  section,
  SUMMARY_HEADINGS,
  type SummaryRequest,
  type SummaryProgress,
  type SummaryResult
} from '../../shared/summary'
import { validId, stringField } from '../../shared/config'
import { FetchAdapter, LLMError } from './llm/adapter'
import { delay } from './llm/queue'
import type { LLMService } from './llm/llm.service'
import type { FileService } from './file.service'
export class SummaryService {
  private jobs = new Map<string, AbortController>()
  private maps = new Map<string, Map<number, string>>()
  lastSourcePath = ''
  constructor(
    private llm: LLMService,
    private files: FileService
  ) {}
  cancel(id: unknown) {
    validId(id)
    this.jobs.get(id)?.abort()
  }
  cancelAll() {
    for (const job of this.jobs.values()) job.abort()
  }
  async start(
    value: unknown,
    progress: (p: SummaryProgress) => void,
    result: (r: SummaryResult) => void
  ): Promise<void> {
    if (!value || typeof value !== 'object') throw new Error('总结参数无效')
    const req = value as SummaryRequest
    validId(req.jobId)
    validId(req.fileId)
    stringField(req.text, 20000000)
    stringField(req.title, 512)
    const source = this.files.paths.get(req.fileId)
    if (!source) throw new Error('文件未打开')
    if (req.text.replace(/<<PAGE \d+>>|\s/g, '').length < 200)
      throw new Error('未提取到文字，可能是扫描版 PDF')
    if (this.jobs.has(req.jobId)) throw new Error('总结任务标识重复')
    const controller = new AbortController(),
      signal = controller.signal
    this.jobs.set(req.jobId, controller)
    let cacheKey = '',
      cacheForJob: Map<number, string> | undefined
    try {
      const config = this.llm.config.get(),
        profile = this.llm.profile(config.settings.summaryProfileId)
      const plan = summaryPlan(req.text, profile.contextWindow)
      const hash = createHash('sha256')
        .update(req.text + JSON.stringify(profile))
        .digest('hex')
      let cache = this.maps.get(hash)
      if (!cache) {
        cache = new Map()
        this.maps.set(hash, cache)
        if (this.maps.size > 3) this.maps.delete(this.maps.keys().next().value!)
      }
      cacheKey = hash
      cacheForJob = cache
      let input = req.text
      progress({ jobId: req.jobId, stage: 'extract', done: 1, total: 1 })
      if (!plan.direct) {
        let count = plan.chunks.filter((_, i) => cache!.has(i)).length
        progress({ jobId: req.jobId, stage: 'map', done: count, total: plan.chunks.length })
        await Promise.all(
          plan.chunks.map(async (chunk, i) => {
            if (cache!.has(i)) return
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                const text = await this.llm.queue.run(profile.id, signal, () => {
                  const adapter = new FetchAdapter(profile, this.llm.secrets.get(profile.id))
                  return adapter.chat(
                    [
                      {
                        role: 'system',
                        content:
                          '你是严谨的科研助理。阅读下面这段论文片段（第 ' +
                          (i + 1) +
                          '/' +
                          plan.chunks.length +
                          ' 块），用简体中文列出其中的要点：研究问题、方法细节、实验设置与结果数字、出现的专业术语（英文原词）。只写片段中有的信息，不要推测，不超过 300 字。'
                      },
                      { role: 'user', content: chunk }
                    ],
                    { temperature: profile.temperature, maxTokens: 700, signal }
                  )
                })
                cache!.set(i, text)
                progress({
                  jobId: req.jobId,
                  stage: 'map',
                  done: ++count,
                  total: plan.chunks.length
                })
                return
              } catch (e) {
                if (
                  signal.aborted ||
                  !(e instanceof LLMError) ||
                  !['RATE_LIMIT', 'SERVER', 'NETWORK', 'TIMEOUT'].includes(e.code) ||
                  attempt === 2
                )
                  throw e
                await delay(1000 * 2 ** attempt, signal)
              }
            }
          })
        )
        input = plan.chunks.map((_, i) => cache!.get(i)!).join('\n\n')
      }
      progress({ jobId: req.jobId, stage: 'reduce', done: 0, total: 1 })
      let markdown = '',
        last = 0
      for (let attempt = 0; attempt < 3; attempt++) {
        markdown = ''
        last = 0
        try {
          await this.llm.stream(
            profile,
            [
              { role: 'system', content: reportPrompt(req.title) },
              { role: 'user', content: input }
            ],
            signal,
            (text) => {
              markdown += text
              if (Date.now() - last >= 50) {
                result({ jobId: req.jobId, markdown, keyTerms: '', question: '' })
                last = Date.now()
              }
            }
          )

          break
        } catch (e) {
          if (
            signal.aborted ||
            !(e instanceof LLMError) ||
            !['RATE_LIMIT', 'SERVER', 'NETWORK', 'TIMEOUT'].includes(e.code) ||
            attempt === 2
          )
            throw e
          await delay(1000 * 2 ** attempt, signal)
        }
      }
      if (!SUMMARY_HEADINGS.every((h) => markdown.includes('## ' + h)))
        throw new Error('总结结构不完整，请重试')
      markdown =
        markdown.trim() +
        '\n\n---\n源文件：' +
        basename(source) +
        '  \n生成时间：' +
        new Date().toISOString() +
        '  \n模型：' +
        profile.model +
        '\n'
      this.lastSourcePath = source
      result({
        jobId: req.jobId,
        markdown,
        keyTerms: section(markdown, '关键术语'),
        question: section(markdown, '研究问题与动机')
      })
      progress({ jobId: req.jobId, stage: 'reduce', done: 1, total: 1 })
      // Keep partial Map results only for failures; an explicit retry after success is fresh.
      if (this.maps.get(hash) === cache) this.maps.delete(hash)
    } catch (e) {
      if (signal.aborted) {
        if (this.maps.get(cacheKey) === cacheForJob) this.maps.delete(cacheKey)
        throw new Error('总结已取消')
      }
      if (e instanceof LLMError) throw new Error(e.message)
      if (e instanceof Error && e.message === '总结结构不完整，请重试') throw e
      throw new Error('总结失败，请检查模型配置或网络后重试')
    } finally {
      controller.abort()
      this.jobs.delete(req.jobId)
    }
  }
}
