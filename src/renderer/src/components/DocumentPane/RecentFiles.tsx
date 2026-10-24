import { useEffect } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { openPaths, refreshRecent } from '../../lib/openFiles'
import styles from './DocumentPane.module.css'
export function RecentFiles() {
  const config = useSettingsStore((s) => s.config),
    recent = config?.recent ?? []
  useEffect(() => {
    void refreshRecent()
  }, [])
  return recent.length ? (
    <nav className={styles.recent} aria-label="最近文件">
      <p>最近文件</p>
      {recent.slice(0, 5).map((f) => (
        <button key={f.path} title={f.path} onClick={() => void openPaths([f.path])}>
          {f.name}
        </button>
      ))}
    </nav>
  ) : null
}
