import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { OpenedFile } from '../../../../shared/types'
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
interface Entry {
  task: pdfjs.PDFDocumentLoadingTask
  promise: Promise<pdfjs.PDFDocumentProxy>
  scrollTop: number
  scrollLeft: number
  zoom: number
}
const cache = new Map<string, Entry>()
export function getPdf(file: OpenedFile): Entry {
  let entry = cache.get(file.fileId)
  if (!entry) {
    const task = pdfjs.getDocument({ data: file.bytes!.slice(), isEvalSupported: false })
    entry = { task, promise: task.promise, scrollTop: 0, scrollLeft: 0, zoom: 1 }
    cache.set(file.fileId, entry)
  }
  return entry
}
export function releaseClosedPdfs(openIds: string[]): void {
  for (const [id, entry] of cache)
    if (!openIds.includes(id)) {
      void entry.task.destroy().catch(() => {})
      cache.delete(id)
    }
}
