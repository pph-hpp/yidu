export interface TextPart {
  text: string
  range: Range
  page: number
  left: number
  top: number
  mid: number
}
export function sortParts<T extends { page: number; left: number; top: number; mid: number }>(
  parts: T[]
): T[] {
  return [...parts].sort(
    (a, b) =>
      a.page - b.page ||
      Number(a.left >= a.mid) - Number(b.left >= b.mid) ||
      (Math.abs(a.top - b.top) > 2 ? a.top - b.top : a.left - b.left)
  )
}
export function selectionParts(range: Range, container: HTMLElement): TextPart[] {
  const spans = Array.from(container.querySelectorAll<HTMLElement>('.textLayer span'))
  if (!spans.length)
    return [{ text: range.toString(), range: range.cloneRange(), page: 0, left: 0, top: 0, mid: 1 }]
  const parts: TextPart[] = []
  for (const span of spans) {
    if (!span.textContent || !range.intersectsNode(span)) continue
    const part = range.cloneRange()
    if (!span.contains(range.startContainer)) part.setStart(span, 0)
    if (!span.contains(range.endContainer)) part.setEnd(span, span.childNodes.length)
    const text = part.toString()
    if (!text) continue
    const page = span.closest<HTMLElement>('[data-page]')!,
      box = page.getBoundingClientRect(),
      rect = part.getBoundingClientRect()
    parts.push({
      text,
      range: part,
      page: Number(page.dataset.page),
      left: rect.left,
      top: rect.top,
      mid: box.left + box.width / 2
    })
  }
  return sortParts(parts)
}
export const partsText = (parts: TextPart[]) =>
  parts
    .map(
      (p, i) =>
        p.text +
        (i < parts.length - 1
          ? parts[i + 1].page !== p.page
            ? '\n\n'
            : Math.abs(parts[i + 1].top - p.top) > 2
              ? '\n'
              : ' '
          : '')
    )
    .join('')
