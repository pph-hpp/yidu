/// <reference types="vite/client" />
import { expect, it, vi } from 'vitest'
vi.mock('../../src/renderer/src/components/PdfViewer/pdfCache', () => ({ getPdf: vi.fn() }))
import { extractText } from '../../src/renderer/src/lib/extractText'
import { getPdf } from '../../src/renderer/src/components/PdfViewer/pdfCache'
import { stringField } from '../../src/shared/config'
it('PDF 全文提取清除字体映射控制字符，保留页码、可见符号和全部页面', async () => {
  const pages = ['First page research. '.repeat(20), '中文 α\0 + β\u0001 = γ.\n\nSecond page.']
  const pdf = {
    numPages: pages.length,
    getPage: async (page: number) => ({
      getTextContent: async () => ({ items: [{ str: pages[page - 1], hasEOL: true }] })
    })
  }
  vi.mocked(getPdf).mockReturnValue({ promise: Promise.resolve(pdf) } as unknown as ReturnType<
    typeof getPdf
  >)
  const progress = vi.fn()
  const text = await extractText(
    {
      fileId: 'test',
      name: 'test.pdf',
      path: 'E:/test.pdf',
      kind: 'pdf',
      mtimeMs: 0,
      bytes: new Uint8Array()
    },
    new AbortController().signal,
    progress
  )
  expect(text).toContain('<<PAGE 1>>')
  expect(text).toContain('<<PAGE 2>>\n中文 α + β = γ.\n\nSecond page.')
  expect(text).not.toMatch(/[\u0000-\u0008\u000E-\u001F\u007F]/)
  expect(() => stringField(text, 20000000)).not.toThrow()
  expect(progress.mock.calls).toEqual([
    [1, 2],
    [2, 2]
  ])
})
