import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useUIStore } from '../../stores/uiStore'
import styles from './SplitPane.module.css'
export function SplitPane({ children }: { children: ReactNode[] }) {
  const saved = useSettingsStore((s) => s.config?.settings.rightPaneWidth ?? 420)
  const [width, setWidth] = useState(saved),
    root = useRef<HTMLDivElement>(null)
  useEffect(() => setWidth(saved), [saved])
  const clamp = (n: number) =>
    Math.round(Math.max(320, Math.min(640, (root.current?.clientWidth ?? 1440) - 568, n)))
  const persist = (n: number) => {
    const config = useSettingsStore.getState().config
    if (config)
      void useSettingsStore
        .getState()
        .save({ ...config, settings: { ...config.settings, rightPaneWidth: n } })
        .catch(() => useUIStore.getState().showToast('分栏宽度保存失败'))
  }
  const update = (n: number) => {
    const value = clamp(n)
    setWidth(value)
    persist(value)
  }
  return (
    <div
      ref={root}
      className={styles.body}
      style={{ '--w-translate': width + 'px' } as CSSProperties}
    >
      {children[0]}
      <div
        className={styles.divider}
        role="separator"
        aria-label="调整翻译栏宽度"
        aria-orientation="vertical"
        aria-valuemin={320}
        aria-valuemax={640}
        aria-valuenow={width}
        tabIndex={0}
        onDoubleClick={() => update(420)}
        onKeyDown={(e) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'].includes(e.key)) {
            e.preventDefault()
            update(
              e.key === 'Home'
                ? 320
                : e.key === 'End'
                  ? 640
                  : e.key === 'Enter'
                    ? 420
                    : width + (e.key === 'ArrowLeft' ? 10 : -10)
            )
          }
        }}
        onPointerDown={(e) => {
          e.preventDefault()
          e.currentTarget.focus()
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            setWidth(clamp(root.current!.getBoundingClientRect().right - e.clientX))
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId)
            persist(width)
          }
        }}
        onPointerCancel={() => persist(width)}
      />
      {children[1]}
    </div>
  )
}
