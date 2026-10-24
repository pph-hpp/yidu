import type { Annot } from './types'
import { validId, stringField } from './config'
export type EditTool = 'select' | Annot['kind']
export interface PdfSaveRequest {
  fileId: string
  annots: Annot[]
}
export type PdfSaveResult =
  { ok: true; path: string; mtimeMs: number } | { ok: false; code: string; message: string }
export const ANNOT_INDEX_KEY = 'YiduReaderIndex'
export interface AnnotationIndex {
  refs: Record<string, Annot>
}
export function validateAnnots(value: unknown, pageCount = 100000): asserts value is Annot[] {
  if (!Array.isArray(value) || value.length > 10000) throw new Error('标注数量无效')
  const ids = new Set<string>()
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') throw new Error('标注格式无效')
    const a = raw as Annot
    validId(a.id)
    stringField(a.createdAt, 100)
    if (!Number.isFinite(Date.parse(a.createdAt))) throw new Error('标注时间无效')
    if (ids.has(a.id) || !Number.isInteger(a.page) || a.page < 1 || a.page > pageCount)
      throw new Error('标注标识或页码无效')
    ids.add(a.id)
    const number = (n: unknown) =>
      typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1000000
    if (a.kind === 'note') {
      if (!Array.isArray(a.at) || a.at.length !== 2 || !a.at.every(number))
        throw new Error('便签坐标无效')
      stringField(a.content, 10000)
      stringField(a.author, 100)
    } else if (['highlight', 'background', 'textColor'].includes(a.kind)) {
      if (
        !Array.isArray(a.quads) ||
        !a.quads.length ||
        a.quads.length > 1000 ||
        a.quads.some((q) => !Array.isArray(q) || q.length !== 8 || !q.every(number))
      )
        throw new Error('标注坐标无效')
      if (typeof a.color !== 'string' || !/^#[a-f\d]{6}$/i.test(a.color))
        throw new Error('标注颜色无效')
      if (a.kind === 'background' && (!number(a.opacity) || a.opacity < 0 || a.opacity > 1))
        throw new Error('透明度无效')
      if (a.kind === 'textColor') {
        stringField(a.text, 6000)
        if (!number(a.fontSize) || a.fontSize <= 0 || a.fontSize > 1000) throw new Error('字号无效')
      }
    } else throw new Error('标注类型无效')
  }
}
