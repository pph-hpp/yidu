import { it, expect } from 'vitest'
import { partsText, sameLine, type TextPart } from '../../src/renderer/src/lib/selectionText'
const part = (text: string, left: number, right: number, top: number, bottom: number, page = 1) =>
  ({ text, range: null as unknown as Range, page, left, right, top, bottom }) as TextPart
it('单栏行跨过页面中线、小型大写字母拆成多段时，按文字层顺序拼回原句', () => {
  // HarnessPro.pdf 摘要中的一句，取自真实文字层（100% 缩放，页面中线约 x=498）
  const parts = [
    part('Rather than returning a single harness, H', 336.3, 501.9, 300.2, 310.2),
    part('ARNESS', 502.4, 535.4, 301.8, 309.8),
    part('P', 535.9, 542.2, 300.2, 310.2),
    part('RO', 541.9, 553.2, 301.8, 309.8),
    part(' ', 553.2, 555, 301.8, 309.8),
    part('uses normalized weighted', 556.3, 660.5, 300.2, 310.2),
    part('squared-distance selection to provide', 336.3, 482.6, 311.2, 321.2),
    part(' ', 482.5, 484.8, 311.2, 321.2),
    part('cost-focused', 484.5, 536.3, 311.2, 321.2),
    part(' ', 536.3, 538.5, 311.2, 321.2),
    part('(lite),', 538.2, 560.1, 311.2, 321.2),
    part(' ', 560.1, 562.3, 311.2, 321.2),
    part('balanced', 562.2, 600.4, 311.2, 321.2),
    part(' ', 600.4, 602.6, 311.2, 321.2),
    part('(medium), and', 602.3, 660.6, 311.2, 321.2),
    part('performance-focused', 336.3, 426, 322.2, 332.1),
    part(' ', 425.9, 428.2, 322.2, 332.1),
    part('(heavy) harnesses for different deployment budgets', 429.4, 640, 322.2, 332.1)
  ]
  expect(partsText(parts)).toBe(
    'Rather than returning a single harness, HARNESSPRO uses normalized weighted\n' +
      'squared-distance selection to provide cost-focused (lite), balanced (medium), and\n' +
      'performance-focused (heavy) harnesses for different deployment budgets'
  )
})
it('放大后小字顶部偏移超过 2px 仍算同一行，上标也留在本行', () => {
  expect(sameLine(part('P', 0, 9, 600, 620), part('ARNESS', 10, 60, 603.2, 619))).toBe(true)
  expect(sameLine(part('Zhao', 0, 30, 100, 112), part('1,†', 31, 40, 98, 106))).toBe(true)
  expect(sameLine(part('上一行', 0, 30, 100, 112), part('下一行', 0, 30, 113, 125))).toBe(false)
})
it('双栏跨栏选择保持文字层顺序：左栏读完再接右栏，跨页空一行', () => {
  const parts = [
    part('left column end', 50, 280, 700, 712),
    part('right column start', 320, 560, 80, 92),
    part('right column next', 320, 560, 93, 105),
    part('next page', 50, 280, 80, 92, 2)
  ]
  expect(partsText(parts)).toBe(
    'left column end\nright column start\nright column next\n\nnext page'
  )
})
it('同一行有间距的片段补空格，紧挨的片段直接相连', () => {
  expect(partsText([part('word', 0, 40, 0, 10), part('next', 44, 80, 0, 10)])).toBe('word next')
  expect(partsText([part('Ha', 0, 20, 0, 10), part('rness', 20.5, 60, 1, 9)])).toBe('Harness')
  expect(partsText([part('P', 0, 6.3, 0, 10), part('RO', 6, 17, 1.6, 9.6)])).toBe('PRO')
})
