import { PermissionFlag, type PDFDocumentProxy } from 'pdfjs-dist'
import {
  ANNOT_INDEX_KEY,
  validateAnnots,
  type AnnotationIndex
} from '../../../../shared/annotations'
import { useAnnotStore } from '../../stores/annotStore'
const indices = new WeakMap<PDFDocumentProxy, AnnotationIndex>()
export function annotationIndex(pdf: PDFDocumentProxy): AnnotationIndex {
  return indices.get(pdf) || { refs: {} }
}
export async function initializeAnnotations(pdf: PDFDocumentProxy, fileId: string): Promise<void> {
  const [metadata, permissions] = await Promise.all([pdf.getMetadata(), pdf.getPermissions()])
  let index: AnnotationIndex = { refs: {} }
  try {
    const raw = (metadata.info as { Custom?: Record<string, string> }).Custom?.[ANNOT_INDEX_KEY]
    if (raw) {
      const parsed = JSON.parse(raw)
      if (!parsed.refs || typeof parsed.refs !== 'object') throw new Error()
      validateAnnots(Object.values(parsed.refs), pdf.numPages)
      index = parsed
    }
  } catch {
    /* Ignore malformed document metadata. */
  }
  indices.set(pdf, index)
  const readBack = []
  if (Object.keys(index.refs).length)
    for (let i = 1; i <= pdf.numPages; i++) {
      const entries = await (await pdf.getPage(i)).getAnnotations()
      for (const entry of entries) {
        const own = index.refs[entry.id]
        if (!own) continue
        pdf.annotationStorage.setValue(entry.id, { noView: true })
        readBack.push(
          own.kind === 'note'
            ? {
                ...own,
                content: entry.contentsObj?.str || '',
                author: entry.titleObj?.str || own.author
              }
            : own
        )
      }
    }
  useAnnotStore
    .getState()
    .initialize(
      fileId,
      readBack,
      !!permissions && !permissions.includes(PermissionFlag.MODIFY_ANNOTATIONS)
    )
}
