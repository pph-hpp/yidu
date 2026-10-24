import { useDocStore } from '../../stores/docStore'
import { Icon } from '../Icon'
import styles from './FileTabs.module.css'
export function FileTabs({ openFile }: { openFile(): void }) {
  const docs = useDocStore(s => s.docs), activeId = useDocStore(s => s.activeId)
  return <div className={styles.tabs} role="tablist" aria-label="已打开的文件">
    {docs.map(file => <div key={file.fileId} className={styles.tab} data-active={activeId === file.fileId}
      onAuxClick={e => { if (e.button === 1) useDocStore.getState().close(file.fileId) }}>
      <button role="tab" aria-selected={file.fileId === activeId} title={file.path}
        onClick={() => useDocStore.getState().setActive(file.fileId)}>
        <Icon name={file.kind === 'pdf' ? 'file' : 'markdown'} size={14} /><span>{file.name}</span>
      </button>
      <button className={styles.close} aria-label={'关闭 ' + file.name} onClick={() => useDocStore.getState().close(file.fileId)}><Icon name="close" size={12} /></button>
    </div>)}
    <button className={styles.open} aria-label="打开文件" title="打开文件 · Ctrl+O" onClick={openFile}><Icon name="plus" size={18} /></button>
  </div>
}

