import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../Icon'
import styles from './Select.module.css'

export interface SelectOption<T extends string = string> {
  value: T
  label: string
  disabled?: boolean
  /** 分组标题：与上一项不同时在该项前显示，标题本身不可选 */
  group?: string
}

// 原生 <select> 的弹出列表由系统绘制，行高、字号、间距都无法随设计 token 调整，
// 因此统一用这个组件：触发器仍是可聚焦的按钮，列表挂到 body 上避免被滚动容器裁切。
export function Select<T extends string>({
  value,
  options,
  onChange,
  variant = 'field',
  tone,
  prefix,
  disabled = false,
  className,
  title,
  'aria-label': ariaLabel
}: {
  value: T
  options: SelectOption<T>[]
  onChange(value: T): void
  /** field：表单字段 40px；compact：工具栏 30px；chip：翻译栏标签 24px */
  variant?: 'field' | 'compact' | 'chip'
  tone?: 'accent'
  prefix?: ReactNode
  disabled?: boolean
  className?: string
  title?: string
  'aria-label'?: string
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const typed = useRef({ text: '', at: 0 })
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const selectedIndex = options.findIndex((o) => o.value === value)
  const selected = options[selectedIndex]

  const enabled = (i: number) => i >= 0 && i < options.length && !options[i].disabled
  const step = (from: number, delta: number) => {
    for (let i = from + delta; i >= 0 && i < options.length; i += delta) if (enabled(i)) return i
    return from
  }
  const first = () => step(-1, 1)
  const last = () => step(options.length, -1)
  const show = (index = enabled(selectedIndex) ? selectedIndex : first()) => {
    if (disabled || !options.length) return
    setActive(index)
    setOpen(true)
  }
  const commit = (i: number) => {
    if (!enabled(i)) return
    setOpen(false)
    if (options[i].value !== value) onChange(options[i].value)
  }
  // 输入首字母跳到匹配项，连续输入时按前缀匹配
  const typeahead = (key: string) => {
    const now = Date.now()
    typed.current = {
      text: now - typed.current.at > 700 ? key : typed.current.text + key,
      at: now
    }
    const text = typed.current.text.toLowerCase(),
      start = open ? active : selectedIndex
    for (let n = 1; n <= options.length; n++) {
      const i = (start + n) % options.length
      if (enabled(i) && options[i].label.toLowerCase().startsWith(text)) return i
    }
    return -1
  }

  useLayoutEffect(() => {
    if (!open || !trigger.current || !list.current) return
    const place = () => {
      const r = trigger.current!.getBoundingClientRect(),
        el = list.current!,
        margin = 8,
        gap = 4
      el.style.minWidth = Math.max(r.width, variant === 'field' ? 0 : 168) + 'px'
      el.style.maxHeight = ''
      // offsetHeight 会向下取整，差零点几像素就会出现多余的滚动条
      const height = Math.ceil(el.getBoundingClientRect().height),
        below = innerHeight - r.bottom - gap - margin,
        above = r.top - gap - margin,
        up = height > below && above > below
      el.style.maxHeight = Math.min(height, up ? above : below) + 'px'
      el.style.top = (up ? r.top - gap - Math.min(height, above) : r.bottom + gap) + 'px'
      el.style.left =
        Math.max(margin, Math.min(r.left, innerWidth - el.offsetWidth - margin)) + 'px'
      el.dataset.placement = up ? 'top' : 'bottom'
    }
    place()
    addEventListener('resize', place)
    return () => removeEventListener('resize', place)
  }, [open, variant])

  useEffect(() => {
    if (!open) return
    const outside = (e: Event) => {
      const target = e.target as Node
      if (!trigger.current?.contains(target) && !list.current?.contains(target)) setOpen(false)
    }
    const scroll = (e: Event) => {
      if (!list.current?.contains(e.target as Node)) setOpen(false)
    }
    const blur = () => setOpen(false)
    addEventListener('pointerdown', outside, true)
    addEventListener('scroll', scroll, true)
    addEventListener('blur', blur)
    return () => {
      removeEventListener('pointerdown', outside, true)
      removeEventListener('scroll', scroll, true)
      removeEventListener('blur', blur)
    }
  }, [open])

  useEffect(() => {
    if (open)
      list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const optionId = (i: number) => `${id}-option-${i}`
  return (
    <>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id + '-list' : undefined}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        data-value={value}
        data-tone={tone}
        className={[styles.trigger, styles[variant], className].filter(Boolean).join(' ')}
        onMouseDown={(e) => {
          // 用 mousedown 切换：点击外层 <label> 文字只聚焦、不展开，和原生行为一致
          if (e.button !== 0 || disabled) return
          if (open) setOpen(false)
          else show()
        }}
        onKeyDown={(e) => {
          const key = e.key
          let handled = true
          if (!open) {
            if (key === 'ArrowDown' || key === 'Enter' || key === ' ') show()
            else if (key === 'ArrowUp') show(enabled(selectedIndex) ? selectedIndex : last())
            else if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
              const i = typeahead(key)
              if (i >= 0) show(i)
            } else handled = false
          } else if (key === 'ArrowDown') setActive((i) => step(i, 1))
          else if (key === 'ArrowUp') setActive((i) => step(i, -1))
          else if (key === 'Home' || key === 'PageUp') setActive(first())
          else if (key === 'End' || key === 'PageDown') setActive(last())
          else if (key === 'Enter' || key === ' ') commit(active)
          else if (key === 'Escape') setOpen(false)
          else if (key === 'Tab') {
            setOpen(false)
            handled = false
          } else if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const i = typeahead(key)
            if (i >= 0) setActive(i)
          } else handled = false
          if (handled) {
            // 阻止对话框的 Esc / Enter 和全局工具快捷键同时响应
            e.preventDefault()
            e.stopPropagation()
          }
        }}
      >
        {prefix}
        <span className={styles.value}>{selected?.label ?? ''}</span>
        <span className={styles.chevron} data-open={open}>
          <Icon name="chevron" size={variant === 'field' ? 16 : 14} />
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={list}
            id={id + '-list'}
            role="listbox"
            aria-label={ariaLabel}
            className={[styles.list, styles['list-' + variant]].join(' ')}
          >
            {options.map((option, i) => (
              <Fragment key={option.value}>
                {option.group && option.group !== options[i - 1]?.group && (
                  <div className={styles.group} role="presentation">
                    {option.group}
                  </div>
                )}
                <div
                  id={optionId(i)}
                  role="option"
                  data-index={i}
                  aria-selected={i === selectedIndex}
                  aria-disabled={option.disabled || undefined}
                  data-active={i === active}
                  className={styles.option}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => enabled(i) && i !== active && setActive(i)}
                  onClick={() => commit(i)}
                >
                  <span className={styles.label}>{option.label}</span>
                  {i === selectedIndex && <Icon name="check" size={15} />}
                </div>
              </Fragment>
            ))}
          </div>,
          document.body
        )}
    </>
  )
}
