import type { Quad } from '../../../shared/types'
export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}
export interface Viewport {
  convertToPdfPoint(x: number, y: number): number[]
  convertToViewportPoint(x: number, y: number): number[]
}
export function mergeRects(rectangles: Rect[]): Rect[] {
  const result: Rect[] = []
  for (const rect of rectangles
    .filter((r) => r.right - r.left > 0.1 && r.bottom - r.top > 0.1)
    .sort((a, b) => a.top - b.top || a.left - b.left)) {
    const prev = result.find(
      (p) =>
        Math.min(p.bottom, rect.bottom) - Math.max(p.top, rect.top) >
          0.5 * Math.min(p.bottom - p.top, rect.bottom - rect.top) &&
        rect.left - p.right < 2 &&
        p.left - rect.right < 2
    )
    if (prev) {
      prev.left = Math.min(prev.left, rect.left)
      prev.right = Math.max(prev.right, rect.right)
      prev.top = Math.min(prev.top, rect.top)
      prev.bottom = Math.max(prev.bottom, rect.bottom)
    } else result.push({ ...rect })
  }
  return result
}
export function rectToQuad(rect: Rect, page: Rect, viewport: Viewport): Quad {
  return [
    ...viewport.convertToPdfPoint(rect.left - page.left, rect.top - page.top),
    ...viewport.convertToPdfPoint(rect.right - page.left, rect.top - page.top),
    ...viewport.convertToPdfPoint(rect.left - page.left, rect.bottom - page.top),
    ...viewport.convertToPdfPoint(rect.right - page.left, rect.bottom - page.top)
  ] as Quad
}
export function quadToRect(quad: Quad, viewport: Viewport): Rect {
  const points = [0, 2, 4, 6].map((i) => viewport.convertToViewportPoint(quad[i], quad[i + 1]))
  return {
    left: Math.min(...points.map((p) => p[0])),
    top: Math.min(...points.map((p) => p[1])),
    right: Math.max(...points.map((p) => p[0])),
    bottom: Math.max(...points.map((p) => p[1]))
  }
}
export function selectedRects(
  range: Range,
  page: HTMLElement
): { rects: Rect[]; text: string; fontSize: number } {
  const rectangles: Rect[] = [],
    parts: string[] = []
  let fontSize = 12
  for (const span of Array.from(page.querySelectorAll<HTMLElement>('.textLayer span'))) {
    if (!span.textContent || !range.intersectsNode(span)) continue
    const part = range.cloneRange()
    if (!span.contains(range.startContainer)) part.setStart(span, 0)
    if (!span.contains(range.endContainer)) part.setEnd(span, span.childNodes.length)
    const text = part.toString()
    if (!text) continue
    for (const r of Array.from(part.getClientRects()))
      rectangles.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })
    parts.push(text)
    fontSize = parseFloat(getComputedStyle(span).fontSize) || fontSize
  }
  return { rects: mergeRects(rectangles), text: parts.join(' '), fontSize }
}
