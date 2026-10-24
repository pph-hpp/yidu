import MarkdownIt from 'markdown-it'
import { realpath, open } from 'node:fs/promises'
import { dirname, resolve, relative, isAbsolute, extname } from 'node:path'
import type { OpenedFile } from '../../shared/types'
const parser = new MarkdownIt({ html: false })
export function relativeImage(src: string): boolean {
  return !!src && !/^[a-z][a-z0-9+.-]*:|^[\\/#]/i.test(src) && !src.includes('\0')
}
export async function readMarkdownImages(
  path: string,
  text: string
): Promise<NonNullable<OpenedFile['images']>> {
  const result: NonNullable<OpenedFile['images']> = {},
    sources = new Set<string>()
  const walk = (tokens: ReturnType<MarkdownIt['parse']>) => {
    for (const t of tokens) {
      if (t.type === 'image') {
        const src = t.attrGet('src')
        if (src && relativeImage(src)) sources.add(src)
      }
      if (t.children) walk(t.children)
    }
  }
  walk(parser.parse(text, {}))
  const root = await realpath(dirname(path))
  let total = 0
  for (const src of [...sources].slice(0, 50)) {
    try {
      const decoded = decodeURIComponent(src)
      if (!relativeImage(decoded)) continue
      const target = await realpath(resolve(root, decoded)),
        rel = relative(root, target)
      if (isAbsolute(rel) || rel === '..' || rel.startsWith('..\\') || rel.startsWith('../'))
        continue
      const mime: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
      }
      const type = mime[extname(target).toLowerCase()]
      if (!type) continue
      const file = await open(target, 'r')
      try {
        const stat = await file.stat()
        if (!stat.isFile() || stat.size > 10 * 1024 * 1024 || total + stat.size > 50 * 1024 * 1024)
          continue
        const bytes = await file.readFile()
        if (bytes.length > 10 * 1024 * 1024) continue
        const valid =
          type === 'image/png'
            ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : type === 'image/jpeg'
              ? bytes[0] === 255 && bytes[1] === 216
              : type === 'image/gif'
                ? /^GIF8[79]a/.test(bytes.subarray(0, 6).toString())
                : bytes.subarray(0, 4).toString() === 'RIFF' &&
                  bytes.subarray(8, 12).toString() === 'WEBP'
        if (valid) {
          result[src] = { bytes: new Uint8Array(bytes), mime: type }
          total += bytes.length
        }
      } finally {
        await file.close()
      }
    } catch {
      /* Missing or rejected images retain alt text; no local paths are exposed. */
    }
  }
  return result
}
