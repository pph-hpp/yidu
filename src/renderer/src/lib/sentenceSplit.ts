const ABBR = /\b(e\.g|i\.e|et al|etc|vs|cf|Fig|Figs|Eq|Eqs|Ref|Refs|Sec|Tab|No|Vol|pp|approx|resp|Dr|Prof|Mr|Ms)\.$/i
const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })
export function splitSentences(text: string): string[] {
  const out: string[] = []
  for (const part of segmenter.segment(text)) {
    const sentence = part.segment.trim()
    if (!sentence) continue
    const previous = out.at(-1)
    if (previous && (ABBR.test(previous) || /^[a-z0-9(\[]/.test(sentence) ||
        (/\d\.$/.test(previous) && /^\d/.test(sentence)) || sentence.length < 12)) {
      out[out.length - 1] = previous + ' ' + sentence
    } else out.push(sentence)
  }
  return out
}

