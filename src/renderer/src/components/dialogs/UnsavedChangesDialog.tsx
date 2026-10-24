import { useFileActions, closeChoice, saveDocument } from '../../lib/fileActions'
import { useDocStore } from '../../stores/docStore'
import { useAnnotStore } from '../../stores/annotStore'
import { Modal } from './Modal'
import styles from './BusinessDialog.module.css'
export function UnsavedChangesDialog() {
  const actions = useFileActions(),
    files = useDocStore((s) => s.docs),
    edits = useAnnotStore((s) => s.files)
  if (actions.prompt) {
    const file = files.find((f) => f.fileId === actions.prompt),
      annots = edits[actions.prompt]?.annots || []
    const count = (kind: string) => annots.filter((a) => a.kind === kind).length
    return (
      <Modal
        title="保存对文件的修改吗？"
        onClose={() => closeChoice('cancel')}
        footer={
          <>
            <button
              className={styles.danger}
              disabled={actions.saving}
              onClick={() => closeChoice('discard')}
            >
              不保存
            </button>
            <button disabled={actions.saving} onClick={() => closeChoice('cancel')}>
              取消
            </button>
            <button
              className="primary"
              disabled={actions.saving}
              onClick={() => closeChoice('save')}
            >
              保存
            </button>
          </>
        }
      >
        <div className={styles.content}>
          <p>
            「{file?.name}」有未保存的编辑（{count('highlight')} 处高亮、{count('background')}{' '}
            处背景色、{count('textColor')} 处文字颜色、{count('note')}{' '}
            条注释）。不保存的话，这些修改会丢失。
          </p>
          {actions.error && (
            <p className={styles.error} role="alert">
              {actions.error}
            </p>
          )}
        </div>
      </Modal>
    )
  }
  if (actions.saveError)
    return (
      <Modal
        title="无法保存 PDF"
        onClose={() => useFileActions.setState({ saveError: null })}
        footer={
          <>
            <button onClick={() => useFileActions.setState({ saveError: null })}>取消</button>
            <button
              className="primary"
              disabled={actions.saving}
              onClick={() => void saveDocument(actions.saveError!, true)}
            >
              另存为
            </button>
          </>
        }
      >
        <div className={styles.content}>
          <p className={styles.error} role="alert">
            {actions.error}
          </p>
        </div>
      </Modal>
    )
  return null
}
