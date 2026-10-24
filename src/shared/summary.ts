import { Tiktoken } from 'js-tiktoken/lite'
import ranks from 'js-tiktoken/ranks/cl100k_base'
let encoder: Tiktoken | undefined
function tokenizer() {
  return (encoder ??= new Tiktoken(ranks))
}
export function tokenCount(text: string): number {
  return tokenizer().encode(text, [], []).length
}
export interface SummaryRequest {
  jobId: string
  fileId: string
  text: string
  title: string
}
export interface SummaryProgress {
  jobId: string
  stage: 'extract' | 'map' | 'reduce'
  done: number
  total: number
}
export interface SummaryResult {
  jobId: string
  markdown: string
  keyTerms: string
  question: string
}
export function chunkText(text: string, maxTokens = 4000): string[] {
  if (maxTokens < 8) throw new Error('分块上限过小')
  const paragraphs: string[] = []
  for (const paragraph of text.split(/\n\s*\n|\n(?=#{1,6} )/).filter((p) => p.trim())) {
    if (tokenCount(paragraph) <= maxTokens) {
      paragraphs.push(paragraph)
      continue
    }
    const chars = Array.from(paragraph)
    let start = 0
    while (start < chars.length) {
      let lo = start + 1,
        hi = Math.min(chars.length, start + maxTokens * 8),
        end = lo
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        if (tokenCount(chars.slice(start, mid).join('')) <= maxTokens) {
          end = mid
          lo = mid + 1
        } else hi = mid - 1
      }
      paragraphs.push(chars.slice(start, end).join(''))
      start = end
    }
  }
  const chunks: string[] = []
  let current: string[] = []
  for (const paragraph of paragraphs) {
    if (current.length && tokenCount([...current, paragraph].join('\n\n')) > maxTokens) {
      chunks.push(current.join('\n\n'))
      const last = current.at(-1)!
      current = tokenCount(last + '\n\n' + paragraph) <= maxTokens ? [last] : []
    }
    current.push(paragraph)
  }
  if (current.length) chunks.push(current.join('\n\n'))
  return chunks
}
export function summaryPlan(text: string, contextWindow = 64000) {
  const tokens = tokenCount(text),
    direct = tokens <= contextWindow * 0.6
  const chunks = direct
    ? []
    : chunkText(text, Math.min(4000, Math.max(256, Math.floor(contextWindow * 0.6))))
  return { tokens, direct, chunks, requests: direct ? 1 : chunks.length + 1 }
}
export const SUMMARY_HEADINGS = [
  '一句话概括',
  '研究问题与动机',
  '方法',
  '实验与结论',
  '关键术语',
  '局限与可追问的问题'
]
export function section(markdown: string, title: string): string {
  const start = markdown.indexOf('## ' + title)
  if (start < 0) return ''
  const end = markdown.indexOf('\n## ', start + 3)
  return markdown.slice(start, end < 0 ? undefined : end).trim()
}
export function reportPrompt(title: string): string {
  return (
    '你是严谨的科研助理。根据下面的论文要点（或全文），用简体中文写一份阅读报告，严格使用以下 Markdown 结构，不要增减一级标题：\n\n# 《' +
    title +
    '》阅读总结\n' +
    SUMMARY_HEADINGS.map((s) => '## ' + s).join('\n') +
    '\n\n关键术语使用表格：英文 | 中文 | 一句话解释。只依据给出的内容，数字保持原样，不要编造。'
  )
}
