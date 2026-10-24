import { expect, it } from 'vitest'
import { renderMarkdown } from '../../src/renderer/src/lib/markdown'
it('renders headings, tables, lists, code and math', () => {
  const html = renderMarkdown(
    '# Title\n\n- List\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```python\ndef f(): return 1\n```\n\n$x^2$\n\n$$\ny=x^2\n$$'
  )
  for (const marker of [
    '<h1 id="title"',
    '<ul>',
    '<table>',
    'hljs-keyword',
    'katex',
    'katex-display'
  ])
    expect(html).toContain(marker)
})
it('escapes scripts and prevents active HTML, unsafe links and image loading', () => {
  const html = renderMarkdown(
    '<script>globalThis.pwned=1</script>\n\n[x](javascript:alert(1))\n\n![secret](file:///C:/private.txt)\n\n![remote](https://example.org/x.png)\n\n![relative](image.png)'
  )
  expect(html).toContain('&lt;script&gt;')
  expect(html).not.toContain('<script>')
  expect(html).not.toContain('<img')
  expect(html).not.toContain('href="javascript:')
})
