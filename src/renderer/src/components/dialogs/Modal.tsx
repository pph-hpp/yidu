import { useEffect, useRef, type ReactNode } from 'react'
import styles from './Modal.module.css'
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  footer
}: {
  title: string
  children: ReactNode
  onClose(): void
  wide?: boolean
  footer?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('button,input,textarea,select,summary')?.focus()
    return () => previous?.focus()
  }, [])
  return (
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={ref}
        className={wide ? styles.wide : styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
          if (
            e.key === 'Enter' &&
            !(e.target instanceof HTMLTextAreaElement) &&
            !(e.target instanceof HTMLButtonElement) &&
            !(e.target instanceof HTMLSelectElement)
          ) {
            const primary = ref.current?.querySelector<HTMLButtonElement>(
              'footer button.primary:not(:disabled)'
            )
            if (primary) {
              e.preventDefault()
              primary.click()
            }
          }
          if (e.key === 'Tab') {
            const items = [
              ...ref.current!.querySelectorAll<HTMLElement>(
                'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,[tabindex="0"]'
              )
            ].filter((el) => el.getClientRects().length)
            const first = items[0],
              last = items.at(-1)
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault()
              last?.focus()
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault()
              first?.focus()
            }
          }
        }}
      >
        <header className={styles.header}>
          <h2>{title}</h2>
          <button aria-label="关闭对话框" onClick={onClose}>
            ×
          </button>
        </header>
        {children}
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>
  )
}
