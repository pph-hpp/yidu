import { AnnotationLayer, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist'
import type { PageViewport } from 'pdfjs-dist/types/src/display/display_utils'
import type { IPDFLinkService } from 'pdfjs-dist/types/web/interfaces'
import commentIcon from 'pdfjs-dist/web/images/annotation-comment.svg?url'
import { annotationIndex } from './annotationData'
export async function renderNativeAnnotations(
  div: HTMLDivElement,
  pdf: PDFDocumentProxy,
  page: PDFPageProxy,
  viewport: PageViewport
): Promise<void> {
  const index = annotationIndex(pdf),
    annotations = (await page.getAnnotations()).filter((a) => !index.refs[a.id])
  const goToPage = (value: number | string) =>
    document
      .querySelector('[data-page="' + Number(value) + '"]')
      ?.scrollIntoView({ block: 'start' })
  const links: IPDFLinkService = {
    pagesCount: pdf.numPages,
    page: page.pageNumber,
    rotation: 0,
    isInPresentationMode: false,
    externalLinkEnabled: true,
    async goToDestination(dest) {
      const value = typeof dest === 'string' ? await pdf.getDestination(dest) : dest
      if (!value) return
      const ref = value[0]
      goToPage(typeof ref === 'number' ? ref + 1 : (await pdf.getPageIndex(ref)) + 1)
    },
    goToPage,
    addLinkAttributes(link, url) {
      if (/^https?:\/\//i.test(url)) {
        link.href = url
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
      } else {
        link.removeAttribute('href')
      }
    },
    getDestinationHash: () => '',
    getAnchorUrl: (hash) => String(hash),
    setHash: () => {},
    executeNamedAction: () => {},
    executeSetOCGState: () => {}
  }
  const layer = new AnnotationLayer({
    div,
    page,
    viewport: viewport.clone({ dontFlip: true }),
    accessibilityManager: null,
    annotationCanvasMap: null,
    annotationEditorUIManager: null,
    structTreeLayer: null
  })
  await layer.render({
    div,
    page,
    viewport: viewport.clone({ dontFlip: true }),
    annotations,
    linkService: links,
    renderForms: false,
    enableScripting: false,
    hasJSActions: false
  })
  for (const img of div.querySelectorAll('img')) img.src = commentIcon
  for (const input of div.querySelectorAll<HTMLInputElement>('input,textarea,select'))
    input.disabled = true
}
