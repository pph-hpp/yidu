import { useTheme } from '../../lib/theme'
import { useDocStore } from '../../stores/docStore'
import { useSummaryStore } from '../../stores/summaryStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { Icon } from '../Icon'
import { FileTabs } from '../FileTabs/FileTabs'
import styles from './TopBar.module.css'
export function TopBar({ openFile }: { openFile(): void }) {
  const theme = useTheme()
  const file = useDocStore((s) => s.docs.find((d) => d.fileId === s.activeId))
  return (
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <span className={styles.logo}>译</span>
        <strong>译读</strong>
      </div>
      <FileTabs openFile={openFile} />
      <select
        aria-label="界面主题"
        title="界面主题"
        value={theme.theme}
        onChange={(e) => theme.setTheme(e.target.value as typeof theme.theme)}
      >
        <option value="system">跟随系统</option>
        <option value="light">浅色</option>
        <option value="dark">深色</option>
      </select>
      <button
        className={styles.summary}
        disabled={!file}
        onClick={() => {
          if (file) void useSummaryStore.getState().start(file)
        }}
        title="总结当前文档全文"
      >
        <Icon name="summary" size={15} />
        全文总结
      </button>
      <button
        className={styles.settings}
        onClick={() => useSettingsStore.getState().open()}
        aria-label="设置"
        title="设置"
      >
        <Icon name="settings" size={18} />
      </button>
    </header>
  )
}
