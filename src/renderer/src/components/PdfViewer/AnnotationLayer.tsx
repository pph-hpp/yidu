import { useEffect, useState, type RefObject } from 'react'
import type { PageViewport } from 'pdfjs-dist/types/src/display/display_utils'
import type { Annot } from '../../../../shared/types'
import { quadToRect } from '../../lib/pdfGeometry'
import { useAnnotStore } from '../../stores/annotStore'
import { Icon } from '../Icon'
import { NotePopover } from './NotePopover'
import styles from './AnnotationLayer.module.css'
export function AnnotationLayer({
  fileId,
  page,
  viewport,
  pageRef
}: {
  fileId: string
  page: number
  viewport: PageViewport
  pageRef: RefObject<HTMLDivElement>
}) {
  const state = useAnnotStore(),
    annots = state.files[fileId]?.annots.filter((a) => a.page === page) || [],
    selected = annots.find((a) => a.id === state.selectedId)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const rectOf = (a: Annot) => {
    if (a.kind === 'note') {
      const p = viewport.convertToViewportPoint(...a.at)
      return { left: p[0], top: p[1], right: p[0] + 22, bottom: p[1] + 22 }
    }
    return quadToRect(a.quads[0], viewport)
  }
  useEffect(() => {
    if (!selected || !pageRef.current) return
    const rect = rectOf(selected),
      bounds = pageRef.current.getBoundingClientRect()
    setPosition({ left: bounds.left + rect.left, top: bounds.top + rect.bottom + 8 })
    const hide = (e: Event) => {
      if (!(e.target as HTMLElement)?.closest?.('[data-annotation-ui]')) state.select(null)
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') state.select(null)
    }
    window.addEventListener('keydown', escape)
    window.addEventListener('mousedown', hide)
    window.addEventListener('scroll', hide, true)
    return () => {
      window.removeEventListener('keydown', escape)
      window.removeEventListener('mousedown', hide)
      window.removeEventListener('scroll', hide, true)
    }
  }, [selected?.id, viewport])
  const color = (name: string) =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--mark-' + name)
      .trim()
  return (
    <>
      {annots
        .filter((a) => a.kind !== 'note')
        .map((a) => {
          let offset = 0
          const chars = Array.from(a.kind === 'textColor' ? a.text : '')
          const total = a.quads.reduce((sum, q) => {
            const r = quadToRect(q, viewport)
            return sum + r.right - r.left
          }, 0)
          return (
            <svg
              key={a.id}
              className={styles.layer}
              aria-hidden="true"
              style={{ mixBlendMode: a.kind === 'textColor' ? 'normal' : 'multiply' }}
            >
              <g data-annot-id={a.id} data-kind={a.kind}>
                {a.quads.map((quad, i) => {
                  const r = quadToRect(quad, viewport),
                    width = r.right - r.left,
                    height = r.bottom - r.top
                  const end =
                      i === a.quads.length - 1
                        ? chars.length
                        : Math.min(
                            chars.length,
                            offset + Math.round((chars.length * width) / total)
                          ),
                    text = chars.slice(offset, end).join('')
                  offset = end
                  return a.kind === 'textColor' ? (
                    <g key={i}>
                      <rect
                        x={r.left}
                        y={r.top}
                        width={width}
                        height={height}
                        fill="var(--pdf-paper)"
                      />
                      <text
                        x={r.left}
                        y={r.bottom - a.fontSize * viewport.scale * 0.15}
                        fill={a.color}
                        fontSize={a.fontSize * viewport.scale}
                        fontFamily="var(--font-reading)"
                        textLength={width}
                        lengthAdjust="spacingAndGlyphs"
                      >
                        {text}
                      </text>
                    </g>
                  ) : (
                    <rect
                      key={i}
                      x={r.left}
                      y={r.top}
                      width={width}
                      height={height}
                      fill={a.color}
                      opacity={a.kind === 'highlight' ? 0.55 : a.opacity}
                      style={{ mixBlendMode: 'multiply' }}
                    />
                  )
                })}
              </g>
            </svg>
          )
        })}
      {annots.map((a, i) => {
        const r = rectOf(a)
        return (
          <button
            key={a.id}
            className={a.kind === 'note' ? styles.note : styles.hit}
            data-annotation-ui
            data-testid={'annotation-' + a.kind}
            aria-label={
              (a.kind === 'note'
                ? '注释'
                : a.kind === 'highlight'
                  ? '高亮标注'
                  : a.kind === 'background'
                    ? '背景标注'
                    : '文字颜色标注') +
              ' ' +
              (i + 1)
            }
            style={{
              left: r.left,
              top: r.top,
              ...(a.kind === 'note' ? {} : { width: r.right - r.left, height: r.bottom - r.top })
            }}
            onClick={(e) => {
              e.stopPropagation()
              state.select(a.id)
            }}
          >
            {a.kind === 'note' ? <Icon name="note" size={12} /> : null}
          </button>
        )
      })}
      {selected?.kind === 'note' && (
        <NotePopover
          key={selected.id}
          note={selected}
          fileId={fileId}
          {...position}
          onClose={() => state.select(null)}
        />
      )}
      {selected && selected.kind !== 'note' && (
        <div
          data-annotation-ui
          className={styles.menu}
          role="dialog"
          aria-label="标注操作"
          style={{
            left: Math.max(8, Math.min(innerWidth - 240, position.left)),
            top: Math.max(8, Math.min(innerHeight - 60, position.top))
          }}
        >
          {['yellow', 'green', 'blue', 'pink', 'red'].map((c, i) => (
            <button
              key={c}
              className={styles.swatch}
              style={{ background: 'var(--mark-' + c + ')' }}
              aria-label={['黄色', '绿色', '蓝色', '粉色', '红色'][i]}
              onClick={() => state.update(fileId, { ...selected, color: color(c) })}
            />
          ))}
          <button onClick={() => state.remove(fileId, selected.id)}>删除</button>
          <button onClick={() => state.select(null)}>关闭</button>
        </div>
      )}
    </>
  )
}
