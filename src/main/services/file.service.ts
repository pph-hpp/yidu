import { open, realpath } from 'node:fs/promises'
import { basename, extname, isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { OpenedFile } from '../../shared/types'
export const MAX_FILE_BYTES = 200 * 1024 * 1024
export function validateOpenPath(req: unknown): string {
  if (!req || typeof req !== 'object' || !('path' in req) ||
      typeof req.path !== 'string' || !req.path || req.path.length > 32767 ||
      req.path.includes('\0') || !isAbsolute(req.path)) throw new Error('无效的文件路径')
  if (!['.pdf', '.md', '.markdown'].includes(extname(req.path).toLowerCase()))
    throw new Error('只支持 PDF、MD 和 Markdown 文件')
  return req.path
}
export class FileService {
  readonly paths = new Map<string, string>()
  private ids = new Map<string, string>()
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
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(data).replace(/^\uFEFF/, '') }
        catch { throw new Error('编码不支持，请将 Markdown 保存为 UTF-8') }
      }
      const key = process.platform === 'win32' ? path.toLowerCase() : path
      const fileId = this.ids.get(key) ?? randomUUID()
      this.ids.set(key, fileId)
      this.paths.set(fileId, path)
      return { fileId, path, name: basename(path), kind, mtimeMs: stat.mtimeMs,
        ...(kind === 'pdf' ? { bytes: new Uint8Array(data) } : { text }) }
    } finally { await handle.close() }
  }
}

