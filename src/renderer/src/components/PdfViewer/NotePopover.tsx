import { useEffect, useState } from 'react'
import type { Annot } from '../../../../shared/types'
import { useAnnotStore } from '../../stores/annotStore'
import styles from './AnnotationLayer.module.css'
export function NotePopover({
  note,
  fileId,
  left,
  top,
  onClose
}: {
  note: Extract<Annot, { kind: 'note' }>
  fileId: string
  left: number
  top: number
  onClose(): void
}) {
  const [text, setText] = useState(note.content)
  useEffect(() => setText(note.content), [note.id, note.content])
  const save = () => {
    if (text !== note.content) useAnnotStore.getState().update(fileId, { ...note, content: text })
  }
  return (
    <div
      className={styles.popover}
      data-annotation-ui
      role="dialog"
      aria-label="我的注释"
      style={{
        left: Math.max(8, Math.min(innerWidth - 228, left)),
        top: Math.max(8, Math.min(innerHeight - 220, top))
      }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') {
          save()
          onClose()
        }
      }}
    >
      <header>
        <strong>{note.author || '我的注释'}</strong>
        <time>{note.createdAt.slice(5, 16).replace('T', ' ')}</time>
      </header>
      <textarea
        data-note-editor
        aria-label="便签内容"
        autoFocus
        maxLength={10000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
      />
      <footer>
        <button onClick={() => useAnnotStore.getState().remove(fileId, note.id)}>删除</button>
        <button
          onClick={() => {
            save()
            onClose()
          }}
        >
          完成
        </button>
      </footer>
    </div>
  )
}
