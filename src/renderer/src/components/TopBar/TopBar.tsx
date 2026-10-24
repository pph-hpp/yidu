import { Icon } from '../Icon'
import { FileTabs } from '../FileTabs/FileTabs'
import styles from './TopBar.module.css'
export function TopBar({ openFile }: { openFile(): void }) {
  return <header className={styles.topbar}>
    <div className={styles.brand}><span className={styles.logo}>译</span><strong>译读</strong></div>
    <FileTabs openFile={openFile} />
    <button className={styles.summary} disabled title="全文总结将在 M3 实现"><Icon name="summary" size={15} />全文总结</button>
    <button className={styles.settings} disabled aria-label="设置" title="模型设置将在 M2 实现"><Icon name="settings" size={18} /></button>
  </header>
}

