import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { OpenedFile } from '../../../../shared/types'
import { useDocStore } from '../../stores/docStore'
import { getPdf } from './pdfCache'
import { PdfPage, type PageSize } from './PdfPage'
import styles from './PdfViewer.module.css'
export function PdfViewer({ file }: { file: OpenedFile }) {
  const root = useRef<HTMLDivElement>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy>()
  const [sizes, setSizes] = useState<PageSize[]>([])
  const [error, setError] = useState('')
  const zoom = useDocStore(s => s.zoom)
  const previousZoom = useRef(zoom)
  const restored = useRef(false)
  useEffect(() => {
    let disposed = false
    const entry = getPdf(file)
    void entry.promise.then(async document => {
      const first = (await document.getPage(1)).getViewport({ scale: 1 })
      if (disposed) return
      setPdf(document)
      setSizes(Array.from({ length: document.numPages }, () => ({ width: first.width, height: first.height })))
      useDocStore.getState().setPage(1, document.numPages)
      const dimensions = await Promise.all(Array.from({ length: document.numPages }, async (_, i) => {
        const viewport = (await document.getPage(i + 1)).getViewport({ scale: 1 })
        return { width: viewport.width, height: viewport.height }
      }))
      if (!disposed) setSizes(dimensions)
    }).catch((reason: Error) => {
      if (!disposed) setError(reason.name === 'PasswordException'
        ? '该 PDF 已加密，当前无法打开' : '文件损坏或格式不支持：' + reason.message)
    })
    const element = root.current!
    return () => {
      disposed = true
      entry.scrollTop = element.scrollTop; entry.scrollLeft = element.scrollLeft
      entry.zoom = previousZoom.current
    }
  }, [file])
  useLayoutEffect(() => {
    const element = root.current!
    if (!sizes.length) return
    const padding = parseFloat(getComputedStyle(element).paddingTop)
    const gap = parseFloat(getComputedStyle(element).rowGap)
    if (!restored.current) {
      const entry = getPdf(file)
      element.scrollTop = entry.scrollTop * zoom / entry.zoom
      element.scrollLeft = entry.scrollLeft * zoom / entry.zoom
      restored.current = true
    } else if (previousZoom.current !== zoom) {
      const oldZoom = previousZoom.current
      const center = element.scrollTop + element.clientHeight / 2 - padding
      let start = 0, index = 0
      while (index < sizes.length - 1 && start + sizes[index].height * oldZoom + gap < center) {
        start += sizes[index].height * oldZoom + gap; index++
      }
      const withinPage = (center - start) / oldZoom
      const newStart = sizes.slice(0, index).reduce((n, s) => n + s.height * zoom + gap, 0)
      element.scrollTop = padding + newStart + withinPage * zoom - element.clientHeight / 2
      element.scrollLeft = (element.scrollLeft + element.clientWidth / 2) * zoom / oldZoom - element.clientWidth / 2
    }
    previousZoom.current = zoom
  }, [zoom, sizes, file])
  useEffect(() => {
    const element = root.current!
    let frame = 0
    const updatePage = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const bounds = element.getBoundingClientRect()
        let max = -1, current = 1
        element.querySelectorAll<HTMLElement>('[data-page]').forEach(page => {
          const rect = page.getBoundingClientRect()
          const area = Math.max(0, Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top)) *
            Math.max(0, Math.min(rect.right, bounds.right) - Math.max(rect.left, bounds.left))
          if (area > max) { max = area; current = Number(page.dataset.page) }
        })
        if (sizes.length) useDocStore.getState().setPage(current, sizes.length)
      })
    }
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault()
        const state = useDocStore.getState()
        state.setZoom(state.zoom + (event.deltaY < 0 ? 0.1 : -0.1))
      }
    }
    element.addEventListener('scroll', updatePage)
    element.addEventListener('wheel', wheel, { passive: false })
    const resize = new ResizeObserver(updatePage); resize.observe(element)
    updatePage()
    return () => {
      cancelAnimationFrame(frame); resize.disconnect()
      element.removeEventListener('scroll', updatePage); element.removeEventListener('wheel', wheel)
    }
  }, [sizes, zoom])
  return <div ref={root} className={styles.scroll} tabIndex={0} aria-label="PDF 文档" data-testid="pdf-scroll">
    {error ? <div className={styles.message} role="alert"><h2>无法打开这个文件</h2><p>{error}</p>
      <button onClick={() => useDocStore.getState().close(file.fileId)}>关闭标签</button></div>
      : !pdf ? <div className={styles.message} role="status"><span className="spinner" />正在打开 {file.name}…</div>
      : sizes.map((size, i) => <PdfPage key={i} pdf={pdf} number={i + 1} size={size} zoom={zoom} root={root} />)}
  </div>
}

