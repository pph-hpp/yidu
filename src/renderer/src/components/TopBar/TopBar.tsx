import { useDocStore } from '../../stores/docStore'
import { useSummaryStore } from '../../stores/summaryStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { Icon } from '../Icon'
import { FileTabs } from '../FileTabs/FileTabs'
import styles from './TopBar.module.css'
export function TopBar({ openFile }: { openFile(): void }) {
  const file = useDocStore((s) => s.docs.find((d) => d.fileId === s.activeId))
  return (
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <span className={styles.logo}>译</span>
        <strong>译读</strong>
      </div>
      <FileTabs openFile={openFile} />
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
