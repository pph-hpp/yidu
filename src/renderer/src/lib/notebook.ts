import type { NotebookDoc } from '../../../shared/notebook'
import { escapeHtml, highlightCode, renderMarkdown } from './markdown'
/**
 * 把 Notebook 渲染成阅读视图 HTML。安全策略与 Markdown 相同：
 * Markdown 单元格走 renderMarkdown（不允许原始 HTML），代码与文本输出全部转义，
 * 图片只使用主进程校验过、在渲染进程转成 blob: 的地址。
 */
export function renderNotebook(notebook: NotebookDoc, images: Record<string, string> = {}): string {
  const lang = notebook.language
  // 相对路径图片对所有单元格可见；附件与输出图片按单元格编号区分
  const shared: Record<string, string> = {}
  for (const [key, url] of Object.entries(images)) if (!/^cell\d+:/.test(key)) shared[key] = url
  return notebook.cells
    .map((cell, index) => {
      const prefix = 'cell' + index + ':'
      if (cell.type === 'markdown') {
        const own: Record<string, string> = { ...shared }
        for (const [key, url] of Object.entries(images))
          if (key.startsWith(prefix + 'attachment:')) own[key.slice(prefix.length)] = url
        return (
          '<section class="nb-cell nb-markdown">' + renderMarkdown(cell.source, own) + '</section>'
        )
      }
      if (cell.type === 'raw')
        return (
          '<section class="nb-cell nb-raw"><pre class="nb-output">' +
          escapeHtml(cell.source) +
          '</pre></section>'
        )
      const outputs = cell.outputs
        .map((output) => {
          if (output.type === 'image') {
            const url = images[output.key]
            return typeof url === 'string' && url.startsWith('blob:')
              ? '<div class="nb-output nb-image"><img src="' +
                  escapeHtml(url) +
                  '" alt="输出图片" loading="lazy"></div>'
              : '<pre class="nb-output">[图片无法显示]</pre>'
          }
          if (output.type === 'markdown')
            return '<div class="nb-output nb-output-md">' + renderMarkdown(output.text) + '</div>'
          return (
            '<pre class="nb-output' +
            (output.stream === 'stderr' || output.stream === 'error' ? ' nb-error' : '') +
            '">' +
            escapeHtml(output.text) +
            '</pre>'
          )
        })
        .join('')
      return (
        '<section class="nb-cell nb-code"><div class="nb-label" aria-hidden="true">' +
        'In [' +
        (cell.executionCount ?? ' ') +
        '] · ' +
        escapeHtml(lang) +
        '</div><pre><code class="hljs language-' +
        escapeHtml(lang) +
        '" data-lang="' +
        escapeHtml(lang) +
        '">' +
        highlightCode(cell.source, lang) +
        '</code></pre>' +
        (outputs ? '<div class="nb-outputs">' + outputs + '</div>' : '') +
        '</section>'
      )
    })
    .join('\n')
}
