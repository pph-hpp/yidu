import { useState } from 'react'
import { useTranslateStore } from '../../stores/translateStore'
import { useUIStore } from '../../stores/uiStore'
import { Icon } from '../Icon'
import styles from './TranslatePane.module.css'
export function FreeInput() {
  const state = useTranslateStore(),
    [input, setInput] = useState('')
  const submit = () => {
    try {
      state.translate(input)
      setInput('')
    } catch (e) {
      useUIStore.getState().showToast((e as Error).message)
    }
  }
  return (
    <div className={styles.input}>
      <textarea
        rows={1}
        placeholder="输入或粘贴文本进行翻译…"
        aria-label="翻译文本"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
      />
      <button disabled={input.trim().length < 2} aria-label="翻译输入的文本" onClick={submit}>
        <Icon name="arrow" />
      </button>
    </div>
  )
}
