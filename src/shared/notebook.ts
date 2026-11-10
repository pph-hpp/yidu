/**
 * Jupyter Notebook（nbformat 4）解析。只提取阅读需要的内容：
 * Markdown / 代码 / Raw 单元格与它们的输出。图片输出与 Markdown 附件以 base64 形式
 * 单独返回，由主进程校验文件头后再交给渲染进程；HTML、SVG、JavaScript 等富输出
 * 一律不执行，优先退回到纯文本表示。
 */
export type NotebookOutput =
  | { type: 'text'; text: string; stream?: 'stdout' | 'stderr' | 'error' | 'html' }
  | { type: 'markdown'; text: string }
  | { type: 'image'; key: string }
export type NotebookCell =
  | { type: 'markdown'; source: string }
  | { type: 'raw'; source: string }
  | {
      type: 'code'
      source: string
      executionCount: number | null
      outputs: NotebookOutput[]
    }
export interface NotebookDoc {
  /** 代码单元格语言，来自 metadata，缺省为 python */
  language: string
  cells: NotebookCell[]
}
export type NotebookImageMime = 'image/png' | 'image/jpeg'
export interface ParsedNotebook {
  notebook: NotebookDoc
  /** key → base64 图片；key 形如 cell3:output:0 或 cell3:attachment:name.png */
  images: Record<string, { mime: NotebookImageMime; data: string }>
}
const IMAGE_MIMES: NotebookImageMime[] = ['image/png', 'image/jpeg']
const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
/** nbformat 中的多行文本既可以是字符串，也可以是字符串数组 */
export function multiline(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string').join('')
  return ''
}
// 终端颜色控制序列（例如 IPython traceback）在阅读视图中没有意义
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b[@-Z\\-_]/g
export const stripAnsi = (text: string): string => text.replace(ANSI, '')
const language = (metadata: unknown): string => {
  if (!isRecord(metadata)) return 'python'
  const info = metadata.language_info,
    kernel = metadata.kernelspec
  const name =
    (isRecord(info) && typeof info.name === 'string' && info.name) ||
    (isRecord(kernel) && typeof kernel.language === 'string' && kernel.language) ||
    'python'
  const clean = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9+#_-]/g, '')
  return clean.slice(0, 40) || 'python'
}
export function parseNotebook(text: string): ParsedNotebook {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('Notebook 不是有效的 JSON 文件')
  }
  if (!isRecord(value) || !Array.isArray(value.cells)) {
    if (isRecord(value) && Array.isArray(value.worksheets))
      throw new Error('只支持 nbformat 4 及以上版本的 Notebook')
    throw new Error('Notebook 格式无效：缺少 cells')
  }
  if (typeof value.nbformat === 'number' && value.nbformat < 4)
    throw new Error('只支持 nbformat 4 及以上版本的 Notebook')
  const images: ParsedNotebook['images'] = {},
    cells: NotebookCell[] = []
  value.cells.forEach((cell, index) => {
    if (!isRecord(cell)) return
    const source = multiline(cell.source)
    if (cell.cell_type === 'markdown') {
      if (isRecord(cell.attachments))
        for (const [name, bundle] of Object.entries(cell.attachments)) {
          if (!isRecord(bundle) || name.includes('\0')) continue
          const mime = IMAGE_MIMES.find((m) => typeof bundle[m] === 'string')
          if (mime)
            images['cell' + index + ':attachment:' + name] = {
              mime,
              data: multiline(bundle[mime])
            }
        }
      cells.push({ type: 'markdown', source })
    } else if (cell.cell_type === 'raw') cells.push({ type: 'raw', source })
    else if (cell.cell_type === 'code') {
      const outputs: NotebookOutput[] = []
      ;(Array.isArray(cell.outputs) ? cell.outputs : []).forEach((output, j) => {
        if (!isRecord(output)) return
        if (output.output_type === 'stream') {
          const text = stripAnsi(multiline(output.text))
          if (text)
            outputs.push({
              type: 'text',
              text,
              stream: output.name === 'stderr' ? 'stderr' : 'stdout'
            })
        } else if (output.output_type === 'error') {
          const traceback = Array.isArray(output.traceback)
            ? output.traceback.filter((t) => typeof t === 'string').join('\n')
            : ''
          const text = stripAnsi(
            traceback ||
              [output.ename, output.evalue].filter((v) => typeof v === 'string').join(': ')
          )
          if (text) outputs.push({ type: 'text', text, stream: 'error' })
        } else if (
          (output.output_type === 'execute_result' || output.output_type === 'display_data') &&
          isRecord(output.data)
        ) {
          const data = output.data
          const mime = IMAGE_MIMES.find(
            (m) => typeof data[m] === 'string' || Array.isArray(data[m])
          )
          if (mime) {
            const key = 'cell' + index + ':output:' + j
            images[key] = { mime, data: multiline(data[mime]) }
            outputs.push({ type: 'image', key })
          } else if (data['text/markdown'] !== undefined)
            outputs.push({ type: 'markdown', text: multiline(data['text/markdown']) })
          else if (data['text/plain'] !== undefined)
            outputs.push({ type: 'text', text: stripAnsi(multiline(data['text/plain'])) })
          // 与 Markdown 文档一致：不渲染 HTML，只把源码当作纯文本展示
          else if (data['text/html'] !== undefined)
            outputs.push({ type: 'text', text: multiline(data['text/html']), stream: 'html' })
        }
      })
      cells.push({
        type: 'code',
        source,
        executionCount:
          typeof cell.execution_count === 'number' && Number.isFinite(cell.execution_count)
            ? cell.execution_count
            : null,
        outputs
      })
    }
  })
  return { notebook: { language: language(value.metadata), cells }, images }
}
const fence = (code: string): string => {
  const longest = Math.max(2, ...(code.match(/`+/g) ?? []).map((m) => m.length))
  return '`'.repeat(longest + 1)
}
/** 全文总结使用的纯文本：Markdown 单元格原样保留，代码单元格放进代码块 */
export function notebookText(notebook: NotebookDoc): string {
  return notebook.cells
    .map((cell) => {
      if (cell.type !== 'code') return cell.source.trim()
      if (!cell.source.trim()) return ''
      const f = fence(cell.source)
      return f + notebook.language + '\n' + cell.source.replace(/\s+$/, '') + '\n' + f
    })
    .filter(Boolean)
    .join('\n\n')
}
