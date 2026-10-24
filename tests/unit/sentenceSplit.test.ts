import { describe, expect, it } from 'vitest'
import { splitSentences } from '../../src/renderer/src/lib/sentenceSplit'
describe('15.1 splitSentences', () => {
  it.each([
    [
      'As shown in Fig. 3, the delay drops. It then rises.',
      ['As shown in Fig. 3, the delay drops.', 'It then rises.']
    ],
    ['Smith et al. proposed X. We extend it.', ['Smith et al. proposed X.', 'We extend it.']],
    ['The slack is 0.5 ns. Next, we ...', ['The slack is 0.5 ns.', 'Next, we ...']],
    ['e.g. buffers, i.e. repeaters, are used.', ['e.g. buffers, i.e. repeaters, are used.']]
  ])('%s', (input, output) => expect(splitSentences(input)).toEqual(output))
  it('ignores empty text', () => expect(splitSentences('  ')).toEqual([]))
})
