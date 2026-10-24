import { useRef } from 'react'
import type { OpenedFile } from '../../../../shared/types'
import { PdfViewer } from '../PdfViewer/PdfViewer'
import { MarkdownViewer } from '../MarkdownViewer/MarkdownViewer'
import { SelectionPopover } from '../SelectionPopover/SelectionPopover'
import { Icon } from '../Icon'
import styles from './DocumentPane.module.css'
export function DocumentPane({
  file,
  openFile,
  opening,
  error
}: {
  file?: OpenedFile
  openFile(): void
  opening: boolean
  error: string
}) {
  const container = useRef<HTMLDivElement>(null)
  return (
    <div ref={container} className={styles.document} data-document-pane tabIndex={-1}>
      {error && (
        <div className={styles.error} role="alert">
          无法打开这个文件：{error}
        </div>
      )}
      {opening && (
        <div className={styles.loading} role="status">
          正在打开文件…
        </div>
      )}
      {file ? (
        file.kind === 'pdf' ? (
          <PdfViewer key={file.fileId} file={file} />
        ) : (
          <MarkdownViewer key={file.fileId} file={file} />
        )
      ) : (
        <div className={styles.empty}>
          <div className={styles.card}>
            <Icon name="file" size={36} />
            <h1>打开 PDF 或 Markdown 文件</h1>
            <p>或把文件拖到这里 · Ctrl+O</p>
            <button className="primary" onClick={openFile}>
              打开文件
            </button>
          </div>
        </div>
      )}
      {file && <SelectionPopover key={'selection-' + file.fileId} container={container} />}
    </div>
  )
}
