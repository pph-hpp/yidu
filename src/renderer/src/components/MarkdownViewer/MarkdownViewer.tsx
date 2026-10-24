import { useEffect, useMemo, useRef } from 'react'
import type { OpenedFile } from '../../../../shared/types'
import { renderMarkdown } from '../../lib/markdown'
import { useDocStore } from '../../stores/docStore'
import styles from './MarkdownViewer.module.css'
const positions = new Map<string, number>()
export function MarkdownViewer({ file }: { file: OpenedFile }) {
  const html = useMemo(() => renderMarkdown(file.text ?? ''), [file.text])
  const zoom = useDocStore((s) => s.zoom)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = root.current!
    el.scrollTop = positions.get(file.fileId) ?? 0
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      const state = useDocStore.getState()
      state.setZoom(state.zoom + (event.deltaY < 0 ? 0.1 : -0.1))
    }
    const remember = () => positions.set(file.fileId, el.scrollTop)
    el.addEventListener('scroll', remember)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('scroll', remember)
      el.removeEventListener('wheel', wheel)
    }
  }, [file.fileId])
  return (
    <div ref={root} className={styles.scroll} tabIndex={0} aria-label="Markdown 文档">
      <article
        className={styles.paper}
        style={{ zoom }}
        onClick={(event) => {
          const link = (event.target as HTMLElement).closest('a')
          if (link?.getAttribute('href')?.startsWith('#')) {
            event.preventDefault()
            const id = decodeURIComponent(link.getAttribute('href')!.slice(1))
            const anchor = Array.from(root.current!.querySelectorAll('[id]')).find(
              (el) => el.id === id
            )
            anchor?.scrollIntoView()
          } else if (link?.getAttribute('href')?.startsWith('mailto:')) event.preventDefault()
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
