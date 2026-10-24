import { useDocStore } from '../../stores/docStore'
import styles from './StatusBar.module.css'
export function StatusBar() {
  const docs = useDocStore(s => s.docs), activeId = useDocStore(s => s.activeId)
  const page = useDocStore(s => s.currentPage), count = useDocStore(s => s.pageCount)
  const active = docs.find(d => d.fileId === activeId)
  return <footer className={styles.status} role="status">{active ? active.kind === 'pdf'
    ? '第 ' + page + ' / ' + count + ' 页' : [...(active.text ?? '').replace(/\s/g, '')].length + ' 字' : ''}</footer>
}

