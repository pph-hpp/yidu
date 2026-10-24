import { validId } from '../../shared/config'
import { validateAnnots, type PdfSaveRequest } from '../../shared/annotations'
import { atomicWrite } from './atomic-write'
export class PdfSaveError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
  }
}
import { open, realpath, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { OpenedFile } from '../../shared/types'
export const MAX_FILE_BYTES = 200 * 1024 * 1024
export function validateOpenPath(req: unknown): string {
  if (
    !req ||
    typeof req !== 'object' ||
    !('path' in req) ||
    typeof req.path !== 'string' ||
    !req.path ||
    req.path.length > 32767 ||
    req.path.includes('\0') ||
    !isAbsolute(req.path)
  )
    throw new Error('无效的文件路径')
  if (!['.pdf', '.md', '.markdown'].includes(extname(req.path).toLowerCase()))
    throw new Error('只支持 PDF、MD 和 Markdown 文件')
  return req.path
}
export class FileService {
  readonly paths = new Map<string, string>()
  private ids = new Map<string, string>()
  private mtimes = new Map<string, number>()
  private saving = new Set<string>()
  async openPath(req: unknown): Promise<OpenedFile> {
    const path = await realpath(validateOpenPath(req))
    validateOpenPath({ path })
    const handle = await open(path, 'r')
    try {
      const stat = await handle.stat()
      if (!stat.isFile()) throw new Error('请选择文件')
      if (stat.size > MAX_FILE_BYTES) throw new Error('文件超过 200 MB，请选择较小的文件')
      const data = await handle.readFile()
      if (data.byteLength > MAX_FILE_BYTES) throw new Error('文件超过 200 MB')
      const kind = extname(path).toLowerCase() === '.pdf' ? 'pdf' : 'md'
      let text: string | undefined
      if (kind === 'md') {
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(data).replace(/^\uFEFF/, '')
        } catch {
          throw new Error('编码不支持，请将 Markdown 保存为 UTF-8')
        }
      }
      const key = process.platform === 'win32' ? path.toLowerCase() : path
      const fileId = this.ids.get(key) ?? randomUUID()
      this.ids.set(key, fileId)
      this.paths.set(fileId, path)
      this.mtimes.set(fileId, stat.mtimeMs)
      const bytes =
        kind === 'pdf'
          ? await (await import('./pdf-writer')).preparePdfForReading(new Uint8Array(data))
          : undefined
      return {
        fileId,
        path,
        name: basename(path),
        kind,
        mtimeMs: stat.mtimeMs,
        ...(kind === 'pdf' ? { bytes } : { text })
      }
    } finally {
      await handle.close()
    }
  }
  async save(
    value: unknown,
    destination?: string,
    overwrite = false
  ): Promise<{ path: string; mtimeMs: number }> {
    if (!value || typeof value !== 'object') throw new PdfSaveError('INVALID', '保存参数无效')
    const req = value as PdfSaveRequest
    validId(req.fileId)
    validateAnnots(req.annots)
    const source = this.paths.get(req.fileId)
    if (!source || extname(source).toLowerCase() !== '.pdf')
      throw new PdfSaveError('INVALID', '只能保存已打开的 PDF')
    if (this.saving.has(req.fileId)) throw new PdfSaveError('BUSY', '文件正在保存，请稍候')
    const target = destination ? resolve(destination) : source
    if (extname(target).toLowerCase() !== '.pdf')
      throw new PdfSaveError('INVALID', '保存文件必须使用 .pdf 扩展名')
    for (const [id, path] of this.paths)
      if (id !== req.fileId && path.toLowerCase() === target.toLowerCase())
        throw new PdfSaveError('BUSY', '目标文件已在其他标签打开')
    this.saving.add(req.fileId)
    try {
      const handle = await open(source, 'r')
      let original: Uint8Array, mtime: number
      try {
        const info = await handle.stat()
        mtime = info.mtimeMs
        if (info.size > MAX_FILE_BYTES) throw new PdfSaveError('SIZE', '文件超过 200 MB')
        if (!destination && !overwrite && mtime !== this.mtimes.get(req.fileId))
          throw new PdfSaveError('EXTERNAL_CHANGE', '文件已被其他程序修改')
        original = new Uint8Array(await handle.readFile())
        if ((await handle.stat()).mtimeMs !== mtime)
          throw new PdfSaveError('EXTERNAL_CHANGE', '读取期间文件已被其他程序修改')
      } finally {
        await handle.close()
      }
      const bytes = await (await import('./pdf-writer')).writePdfAnnotations(original, req.annots)
      await atomicWrite(target, bytes, async () => {
        if ((await stat(source)).mtimeMs !== mtime)
          throw new PdfSaveError('EXTERNAL_CHANGE', '保存期间文件已被其他程序修改')
      })
      const modified = (await stat(target)).mtimeMs
      this.mtimes.set(req.fileId, modified)
      this.paths.set(req.fileId, target)
      const key = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p)
      this.ids.delete(key(source))
      this.ids.set(key(target), req.fileId)
      return { path: target, mtimeMs: modified }
    } finally {
      this.saving.delete(req.fileId)
    }
  }
}
