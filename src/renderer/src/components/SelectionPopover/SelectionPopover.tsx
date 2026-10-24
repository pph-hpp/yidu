import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useTranslateStore } from '../../stores/translateStore'
import { useUIStore } from '../../stores/uiStore'
import styles from './SelectionPopover.module.css'
interface SelectionData { text: string; rect: DOMRect }
export function SelectionPopover({ container }: { container: RefObject<HTMLDivElement> }) {
  const [selection, setSelection] = useState<SelectionData>()
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const popover = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const translate = (text: string) => {
    try { useTranslateStore.getState().translate(text) }
    catch (err) { useUIStore.getState().showToast((err as Error).message) }
  }
  useEffect(() => {
    const element = container.current!
    const hide = () => { setSelection(undefined); clearTimeout(timer.current) }
    const capture = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && !event.shiftKey) return
      if ((event.target as HTMLElement).closest('[data-selection-popover]')) return
      clearTimeout(timer.current)
      const selected = window.getSelection()
      if (!selected?.rangeCount || selected.isCollapsed ||
          !element.contains(selected.anchorNode) || !element.contains(selected.focusNode)) { hide(); return }
      const text = selected.toString().trim()
      if (text.length < 2) { hide(); return }
      const range = selected.getRangeAt(0)
      setSelection({ text, rect: range.getBoundingClientRect() })
      if (text.length > 6000) { useUIStore.getState().showToast('选区过长，请分段选择或使用全文总结'); return }
      timer.current = setTimeout(() => translate(text), 300)
    }
    const clickOutside = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest('[data-selection-popover]')) hide()
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') hide() }
    element.addEventListener('mouseup', capture); element.addEventListener('keyup', capture)
    element.addEventListener('scroll', hide, true)
    window.addEventListener('mousedown', clickOutside); window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(timer.current)
      element.removeEventListener('mouseup', capture); element.removeEventListener('keyup', capture)
      element.removeEventListener('scroll', hide, true)
      window.removeEventListener('mousedown', clickOutside); window.removeEventListener('keydown', onKey)
    }
  }, [container])
  useLayoutEffect(() => {
    if (!selection || !popover.current) return
    const { width, height } = popover.current.getBoundingClientRect()
    const rect = selection.rect
    setPosition({ left: Math.max(8, Math.min(innerWidth - width - 8, rect.left + (rect.width - width) / 2)),
      top: rect.top - height - 8 >= 8 ? rect.top - height - 8 : Math.min(innerHeight - height - 8, rect.bottom + 8) })
  }, [selection])
  if (!selection) return null
  return <div ref={popover} className={styles.popover} style={position} role="toolbar" aria-label="选区操作"
    data-selection-popover onMouseDown={e => e.preventDefault()}>
    <button disabled={selection.text.length > 6000} className={styles.translate} onClick={() => { clearTimeout(timer.current); translate(selection.text) }}>翻译</button>
    <button disabled title="PDF 编辑将在 M4 实现">高亮</button><button disabled title="PDF 编辑将在 M4 实现">注释</button>
    <button onClick={() => {
      void navigator.clipboard.writeText(selection.text).then(() => useUIStore.getState().showToast('已复制'))
        .catch(() => useUIStore.getState().showToast('复制失败，请使用 Ctrl+C'))
    }}>复制</button>
  </div>
}

