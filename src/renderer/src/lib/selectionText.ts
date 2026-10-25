export interface TextPart {
  text: string
  range: Range
  page: number
  left: number
  right: number
  top: number
  bottom: number
}
type Box = Pick<TextPart, 'page' | 'left' | 'right' | 'top' | 'bottom'>
// Same line when the boxes overlap vertically by at least half of the smaller height,
// so small caps, superscripts and mixed font sizes stay on their line.
export function sameLine(a: Box, b: Box): boolean {
  const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  return a.page === b.page && overlap >= Math.min(a.bottom - a.top, b.bottom - b.top) / 2
}
// Parts follow the text layer's DOM order, which pdf.js builds from the content stream
// and which matches the native selection. Re-sorting by page halves breaks single-column
// lines that cross the middle of the page.
export function selectionParts(range: Range, container: HTMLElement): TextPart[] {
  const spans = Array.from(container.querySelectorAll<HTMLElement>('.textLayer span'))
  if (!spans.length)
    return [
      {
        text: range.toString(),
        range: range.cloneRange(),
        page: 0,
        left: 0,
        right: 0,
        top: 0,
        bottom: 0
      }
    ]
  const parts: TextPart[] = []
  for (const span of spans) {
    if (!span.textContent || !range.intersectsNode(span)) continue
    const part = range.cloneRange()
    if (!span.contains(range.startContainer)) part.setStart(span, 0)
    if (!span.contains(range.endContainer)) part.setEnd(span, span.childNodes.length)
    const text = part.toString()
    if (!text) continue
    const rect = part.getBoundingClientRect()
    parts.push({
      text,
      range: part,
      page: Number(span.closest<HTMLElement>('[data-page]')!.dataset.page),
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom
    })
  }
  return parts
}
// Pieces of one word (e.g. small caps "H" + "ARNESS") touch or slightly overlap; real
// word gaps are either a separate space span or a visible horizontal gap.
function separator(a: TextPart, b: TextPart): string {
  if (b.page !== a.page) return '\n\n'
  if (!sameLine(a, b)) return '\n'
  if (/\s$/.test(a.text) || /^\s/.test(b.text)) return ''
  const gap = b.left - a.right
  return Math.abs(gap) <= Math.min(a.bottom - a.top, b.bottom - b.top) / 4 ? '' : ' '
}
export const partsText = (parts: TextPart[]) =>
  parts.map((p, i) => p.text + (i < parts.length - 1 ? separator(p, parts[i + 1]) : '')).join('')
