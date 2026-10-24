import { useState } from 'react'
import { useDocStore } from '../../stores/docStore'
import { Icon, type IconName } from '../Icon'
import styles from './EditToolbar.module.css'
export function EditToolbar() {
  const zoom = useDocStore((s) => s.zoom)
  const [presets, setPresets] = useState(false)
  const tools: [IconName, string][] = [
    ['select', '选择文字'],
    ['highlight', '高亮'],
    ['background', '背景色'],
    ['text', '文字颜色'],
    ['note', '注释']
  ]
  return (
    <div className={styles.toolbar} role="toolbar" aria-label="文档工具">
      <div className={styles.tools}>
        {tools.map(([icon, label], i) => (
          <button
            key={icon}
            disabled={i !== 0}
            className={i === 0 ? styles.active : ''}
            title={i ? label + '（PDF 编辑将在 M4 实现）' : label}
            aria-label={label}
          >
            <Icon name={icon} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className={styles.separator} />
      <div className={styles.colors} role="radiogroup" aria-label="标注颜色">
        {['yellow', 'green', 'blue', 'pink', 'red'].map((color, i) => (
          <button
            key={color}
            role="radio"
            aria-label={['黄色', '绿色', '蓝色', '粉色', '红色'][i]}
            aria-checked={i === 0}
            disabled
            style={{ background: 'var(--mark-' + color + ')' }}
          />
        ))}
      </div>
      <button disabled aria-label="撤销" title="撤销">
        <Icon name="undo" />
      </button>
      <button disabled aria-label="重做" title="重做">
        <Icon name="redo" />
      </button>
      <div className={styles.zoom}>
        <button
          aria-label="缩小"
          onClick={() => useDocStore.getState().setZoom(zoom - 0.1)}
          disabled={zoom <= 0.5}
        >
          <Icon name="minus" />
        </button>
        <button
          className={styles.percent}
          aria-label="缩放比例"
          aria-expanded={presets}
          onClick={() => setPresets(!presets)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          aria-label="放大"
          onClick={() => useDocStore.getState().setZoom(zoom + 0.1)}
          disabled={zoom >= 3}
        >
          <Icon name="plus" />
        </button>
        {presets && (
          <div
            className={styles.presets}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setPresets(false)
            }}
          >
            {[50, 75, 100, 125, 150, 200, 300].map((n) => (
              <button
                key={n}
                onClick={() => {
                  useDocStore.getState().setZoom(n / 100)
                  setPresets(false)
                }}
              >
                {n}%
              </button>
            ))}
            <button
              onClick={() => {
                const viewport = document.querySelector<HTMLElement>('[data-testid="pdf-scroll"]')
                const page = viewport?.querySelector<HTMLElement>('[data-page]')
                if (viewport && page)
                  useDocStore
                    .getState()
                    .setZoom((viewport.clientWidth - 48) / (page.offsetWidth / zoom))
                else useDocStore.getState().setZoom(1)
                setPresets(false)
              }}
            >
              适合宽度
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
