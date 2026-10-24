import { useDocStore } from '../../stores/docStore'
import { useAnnotStore, isDirty } from '../../stores/annotStore'
import { useTranslateStore } from '../../stores/translateStore'
import { useFileActions } from '../../lib/fileActions'
import styles from './StatusBar.module.css'
export function StatusBar() {
  const { docs, activeId, currentPage: page, pageCount: count } = useDocStore()
  const active = docs.find((d) => d.fileId === activeId),
    annotations = useAnnotStore((s) => (activeId ? s.files[activeId] : undefined))
  const saving = useFileActions((s) => s.saving),
    sentences = useTranslateStore((s) => s.sentences)
  const running = sentences.some((s) => s.status === 'pending' || s.status === 'streaming')
  return (
    <footer className={styles.status} role="status">
      <span>
        {active
          ? active.kind === 'pdf'
            ? '第 ' + page + ' / ' + count + ' 页'
            : [...(active.text ?? '').replace(/\s/g, '')].length + ' 字'
          : ''}
      </span>
      <span>
        {saving
          ? '正在保存…'
          : isDirty(annotations)
            ? '● 有未保存的修改 · Ctrl+S 保存'
            : running
              ? '正在翻译 ' +
                sentences.filter((s) => s.status === 'done').length +
                '/' +
                sentences.length
              : ''}
      </span>
    </footer>
  )
}
