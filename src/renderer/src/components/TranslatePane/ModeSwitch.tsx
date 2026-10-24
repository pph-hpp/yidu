import { useTranslateStore } from '../../stores/translateStore'
import styles from './TranslatePane.module.css'
export function ModeSwitch() {
  const state = useTranslateStore()
  return (
    <div className={styles.mode}>
      {(['sentence', 'paragraph'] as const).map((mode) => (
        <button
          key={mode}
          aria-pressed={state.mode === mode}
          className={state.mode === mode ? styles.selected : undefined}
          onClick={() => state.setMode(mode)}
        >
          {mode === 'sentence' ? '逐句' : '整段'}
        </button>
      ))}
    </div>
  )
}
