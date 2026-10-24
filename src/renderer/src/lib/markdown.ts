import MarkdownIt from 'markdown-it'
import katex from '@vscode/markdown-it-katex'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import cpp from 'highlight.js/lib/languages/cpp'
import json from 'highlight.js/lib/languages/json'
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('json', json)
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false,
  highlight: (code, lang) =>
    lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang }).value : ''
}).use(katex, { throwOnError: false })
md.validateLink = (url) => /^(https?:|mailto:|#)/i.test(url)
// Never load local/remote resources named by an untrusted Markdown document.
md.renderer.rules.image = (tokens, index) => md.utils.escapeHtml(tokens[index].content)
const renderLink =
  md.renderer.rules.link_open ??
  ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options))
md.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const href = tokens[index].attrGet('href') ?? ''
  if (/^https?:/i.test(href)) {
    tokens[index].attrSet('target', '_blank')
    tokens[index].attrSet('rel', 'noopener noreferrer')
  }
  return renderLink(tokens, index, options, env, self)
}
md.core.ruler.push('heading-anchors', (state) => {
  const seen = new Map<string, number>()
  state.tokens.forEach((token, i) => {
    if (token.type !== 'heading_open') return
    const base = (state.tokens[i + 1]?.content ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    token.attrSet('id', base + (count ? '-' + count : ''))
  })
})
export const renderMarkdown = (text: string): string => md.render(text)
