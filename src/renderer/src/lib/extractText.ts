import type { OpenedFile } from '../../../shared/types'
import { getPdf } from '../components/PdfViewer/pdfCache'
import { textClean } from './textClean'
export async function extractText(
  file: OpenedFile,
  signal: AbortSignal,
  progress: (done: number, total: number) => void
): Promise<string> {
  const check = () => {
    if (signal.aborted) throw new DOMException('已取消', 'AbortError')
  }
  if (file.kind === 'md') {
    check()
    progress(1, 1)
    return file.text || ''
  }
  const pdf = await getPdf(file).promise,
    text: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    check()
    const page = await pdf.getPage(i),
      content = await page.getTextContent()
    let value = ''
    for (const item of content.items)
      if ('str' in item) value += item.str + (item.hasEOL ? '\n' : ' ')
    text.push('<<PAGE ' + i + '>>\n' + textClean(value))
    progress(i, pdf.numPages)
    await new Promise((r) => setTimeout(r, 0))
  }
  check()
  return text.join('\n\n')
}
