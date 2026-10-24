import { it, expect } from 'vitest'
import {
  chunkText,
  tokenCount,
  summaryPlan,
  section,
  SUMMARY_HEADINGS,
  reportPrompt
} from '../../src/shared/summary'
it('token 计数、短文直出和长文 Map-Reduce 分支', () => {
  expect(tokenCount('hello world')).toBe(2)
  const text = 'Research findings and experimental results. '.repeat(100)
  expect(summaryPlan(text, 64000).direct).toBe(true)
  const plan = summaryPlan(text, 512)
  expect(plan.direct).toBe(false)
  expect(plan.requests).toBe(plan.chunks.length + 1)
  expect(plan.chunks.every((c) => tokenCount(c) <= 307)).toBe(true)
})
it('分块上限和段落重叠；超长中文段不损坏 Unicode', () => {
  const paras = Array.from(
    { length: 10 },
    (_, i) => 'Paragraph ' + i + ' explains important research findings in detail. '.repeat(3)
  )
  const chunks = chunkText(paras.join('\n\n'), 100)
  expect(chunks.length).toBeGreaterThan(1)
  expect(chunks.every((c) => tokenCount(c) <= 100)).toBe(true)
  expect(chunks[1].startsWith(chunks[0].split('\n\n').at(-1)!)).toBe(true)
  const chinese = '中文研究😀数学模型。'.repeat(100),
    parts = chunkText(chinese, 100)
  expect(parts.join('')).toBe(chinese)
  expect(parts.join('')).not.toContain('�')
})
it('报告模板恰有六个二级标题，提取背景时保留原文', () => {
  const template = reportPrompt('示例')
  for (const h of SUMMARY_HEADINGS) expect(template).toContain('## ' + h)
  const report =
    '# report\n## 研究问题与动机\n研究问题正文\n## 方法\n方法正文\n## 关键术语\n| English | 中文 |\n## 局限与可追问的问题\nlimitations'
  expect(section(report, '研究问题与动机')).toBe('## 研究问题与动机\n研究问题正文')
  expect(section(report, '关键术语')).toContain('| English | 中文 |')
  expect(section(report, 'missing')).toBe('')
})
