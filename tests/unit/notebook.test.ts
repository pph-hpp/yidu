import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { notebookText, parseNotebook, stripAnsi } from '../../src/shared/notebook'
import { renderNotebook } from '../../src/renderer/src/lib/notebook'
import { FileService, validateOpenPath } from '../../src/main/services/file.service'
import { decodeNotebookImages } from '../../src/main/services/markdown-images'
import { extractText } from '../../src/renderer/src/lib/extractText'
import { validateConfig, defaultConfig } from '../../src/shared/config'
const fixture = resolve('tests/fixtures/notebook.ipynb')
const nb = (cells: unknown[], metadata: unknown = {}) =>
  JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata, cells })
it('解析单元格、语言、输出与内嵌图片', async () => {
  const { notebook, images } = parseNotebook(await readFile(fixture, 'utf8'))
  expect(notebook.language).toBe('python')
  expect(notebook.cells.map((c) => c.type)).toEqual([
    'markdown',
    'markdown',
    'code',
    'code',
    'markdown'
  ])
  const code = notebook.cells[2]
  if (code.type !== 'code') throw new Error('expected code cell')
  expect(code.executionCount).toBe(3)
  expect(code.source).toContain('def score(q, k):')
  expect(code.outputs).toEqual([
    { type: 'text', text: 'ready\n', stream: 'stdout' },
    { type: 'text', text: '0.125' },
    { type: 'image', key: 'cell2:output:2' },
    { type: 'image', key: 'cell2:output:3' },
    {
      type: 'text',
      stream: 'html',
      text: '<b>bold</b><script>globalThis.pwnedHtml=1</script><img src=x onerror="globalThis.pwnedImg=1">'
    }
  ])
  const error = notebook.cells[3]
  if (error.type !== 'code') throw new Error('expected code cell')
  expect(error.outputs).toEqual([
    { type: 'text', stream: 'error', text: 'TypeError: unsupported operand type(s)' }
  ])
  expect(Object.keys(images).sort()).toEqual([
    'cell1:attachment:plot.png',
    'cell2:output:2',
    'cell2:output:3'
  ])
})
it('语言来自元数据，缺省为 python；拒绝无效或旧格式 notebook', () => {
  expect(parseNotebook(nb([], { language_info: { name: 'R' } })).notebook.language).toBe('r')
  expect(parseNotebook(nb([], { kernelspec: { language: 'julia' } })).notebook.language).toBe(
    'julia'
  )
  expect(parseNotebook(nb([])).notebook.language).toBe('python')
  expect(() => parseNotebook('{oops')).toThrow('有效的 JSON')
  expect(() => parseNotebook('{"nbformat":3,"worksheets":[]}')).toThrow('nbformat 4')
  expect(() => parseNotebook('[]')).toThrow('缺少 cells')
  expect(stripAnsi('\u001b[1;31mError\u001b[0m')).toBe('Error')
})
it('全文总结文本包含 Markdown 与代码单元格，不含输出', () => {
  const { notebook } = parseNotebook(
    nb([
      { cell_type: 'markdown', source: ['# Title\n', 'Body'] },
      {
        cell_type: 'code',
        source: 'x = "```"\nprint(x)\n',
        outputs: [{ output_type: 'stream', name: 'stdout', text: 'OUTPUT-ONLY' }]
      },
      { cell_type: 'code', source: '   ', outputs: [] }
    ])
  )
  const text = notebookText(notebook)
  expect(text).toBe('# Title\nBody\n\n````python\nx = "```"\nprint(x)\n````')
  expect(text).not.toContain('OUTPUT-ONLY')
})
it('渲染：Markdown、公式、表格、代码高亮与语言标注，HTML 与脚本只作为文本', async () => {
  const { notebook } = parseNotebook(await readFile(fixture, 'utf8'))
  const html = renderNotebook(notebook, {
    'cell1:attachment:plot.png': 'blob:attachment',
    'cell2:output:2': 'blob:output'
  })
  for (const marker of [
    '<h1 id="notebook-reader"',
    'katex',
    '<table>',
    'hljs-keyword',
    'data-lang="python"',
    'In [3] · python',
    '<img src="blob:attachment" alt="attached plot"',
    '<img src="blob:output" alt="输出图片"',
    '[图片无法显示]',
    'nb-error',
    '&lt;script&gt;globalThis.pwnedHtml=1&lt;/script&gt;'
  ])
    expect(html).toContain(marker)
  expect(html).not.toContain('<script>')
  expect(html).not.toContain('<b>bold</b>')
  expect(html).not.toContain('src="x"')
  expect(html).not.toContain('example.org')
  // 附件只属于自己的单元格；没有解码的附件不会被加载
  const other = renderNotebook(
    parseNotebook(nb([{ cell_type: 'markdown', source: '![a](attachment:plot.png)' }])).notebook,
    { 'cell1:attachment:plot.png': 'blob:attachment' }
  )
  expect(other).not.toContain('<img')
})
it('内嵌图片只接受文件头匹配的 PNG/JPEG', () => {
  const png = Buffer.from('89504e470d0a1a0a00000000', 'hex').toString('base64')
  const images = decodeNotebookImages({
    ok: { mime: 'image/png', data: png.slice(0, 8) + '\n' + png.slice(8) },
    fake: { mime: 'image/png', data: Buffer.from('<svg onload=x>').toString('base64') },
    svg: { mime: 'image/svg+xml', data: png },
    broken: { mime: 'image/jpeg', data: '***' }
  })
  expect(Object.keys(images)).toEqual(['ok'])
  expect(images.ok.mime).toBe('image/png')
})
it('文件服务按 ipynb 打开并提供全文文本，最近文件接受 ipynb', async () => {
  expect(validateOpenPath({ path: fixture })).toBe(fixture)
  expect(() => validateOpenPath({ path: resolve('tests/fixtures/x.py') })).toThrow('.ipynb')
  const file = await new FileService().openPath({ path: fixture })
  expect(file.kind).toBe('ipynb')
  expect(file.notebook?.cells).toHaveLength(5)
  expect(Object.keys(file.images ?? {}).sort()).toEqual([
    'cell1:attachment:plot.png',
    'cell2:output:2'
  ])
  expect(file.text).toContain('Attention mechanisms')
  expect(file.text).toContain('def score(q, k):')
  expect(await extractText(file, new AbortController().signal, () => {})).toBe(file.text)
  const config = defaultConfig()
  config.recent = [{ path: file.path, name: file.name, kind: 'ipynb', mtimeMs: 1 }]
  expect(() => validateConfig(config)).not.toThrow()
})
