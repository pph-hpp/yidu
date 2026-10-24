import { describe, expect, it } from 'vitest'
import { textClean } from '../../src/renderer/src/lib/textClean'
describe('15.1 textClean', () => {
  it.each([
    ['trans-\nlation of the', 'translation of the'],
    ['Research\u0000 findings\u0001 with \u0010(x + y)\u0011.', 'Research findings with (x + y).'],
    [
      '中文 α\u0008 + β\u0012 = γ\u0013\u007F\n\n\t第二段\v文字\f。',
      '中文 α + β = γ\n\n第二段 文字。'
    ],
    ['Graph-\nBased analysis', 'Graph-Based analysis'],
    ['first line\nsecond line\n\nnew para', 'first line second line\n\nnew para'],
    ['one\r\ntwo\r\n\r\nthree', 'one two\n\nthree'],
    ['zero\u200B soft\u00AD , done .', 'zero soft, done.'],
    ['12 First line\n13 Second line\n\n42', 'First line Second line']
  ])('%j → %j', (input, output) => expect(textClean(input)).toBe(output))
})
