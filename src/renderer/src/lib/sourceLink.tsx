import { create } from 'zustand'
import { useEffect } from 'react'
import type { Sentence } from '../../../shared/types'
import type { TextPart } from './selectionText'
const normalized = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
let bindings = new Map<string, Range[]>()
export const useSourceLink = create<{
  hover: string | null
  rects: { left: number; top: number; width: number; height: number }[]
}>()(() => ({ hover: null, rects: [] }))
export function clearSourceLink() {
  bindings.clear()
  showSource(null)
}
export function bindSources(sentences: Sentence[], parts: TextPart[]) {
  document
    .querySelectorAll('[data-source-id]')
    .forEach((el) => el.removeAttribute('data-source-id'))
  bindings.clear()
  let pos = 0
  const segments = parts.map((p) => {
      const start = pos
      pos += normalized(p.text).length
      return { start, end: pos, range: p.range }
    }),
    all = parts.map((p) => normalized(p.text)).join('')
  let cursor = 0
  for (const s of sentences) {
    const query = normalized(s.source),
      start = all.indexOf(query, cursor)
    if (start < 0 || !query) continue
    const end = start + query.length
    bindings.set(
      s.id,
      segments.filter((p) => p.end > start && p.start < end).map((p) => p.range)
    )
    cursor = end
    for (const r of bindings.get(s.id) ?? []) {
      const el =
        r.startContainer instanceof Element ? r.startContainer : r.startContainer.parentElement
      if (el) el.setAttribute('data-source-id', s.id)
    }
  }
}
export function showSource(id: string | null) {
  const ranges = id ? (bindings.get(id) ?? []) : []
  useSourceLink.setState({
    hover: id,
    rects: ranges.flatMap((range) =>
      range.startContainer.isConnected
        ? Array.from(range.getClientRects()).map((r) => ({
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height
          }))
        : []
    )
  })
}
export function SourceLinkOverlay() {
  const { rects } = useSourceLink()
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const target = e.target as Node
      if (!(target instanceof Element) || !target.closest('[data-document-pane]')) return
      const direct = target.closest<HTMLElement>('[data-source-id]')?.dataset.sourceId
      if (direct) {
        showSource(direct)
        return
      }
      let found: string | null = null
      for (const [id, ranges] of bindings)
        if (
          ranges.some((r) => {
            return Array.from(r.getClientRects()).some(
              (b) =>
                e.clientX >= b.left &&
                e.clientX <= b.right &&
                e.clientY >= b.top &&
                e.clientY <= b.bottom
            )
          })
        ) {
          found = id
          break
        }
      showSource(found)
    }
    const hide = () => requestAnimationFrame(() => showSource(useSourceLink.getState().hover))
    window.addEventListener('mousemove', move)
    window.addEventListener('scroll', hide, true)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('scroll', hide, true)
    }
  }, [])
  return (
    <div aria-hidden="true">
      {rects.map((r, i) => (
        <div
          key={i}
          data-source-outline
          style={{
            position: 'fixed',
            ...r,
            border: 'var(--px-1) solid var(--accent)',
            background: 'var(--selection)',
            pointerEvents: 'none',
            zIndex: 4
          }}
        />
      ))}
    </div>
  )
}
