import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist'
import styles from './PdfViewer.module.css'
export interface PageSize {
  width: number
  height: number
}
export function PdfPage({
  pdf,
  number,
  size,
  zoom,
  root
}: {
  pdf: PDFDocumentProxy
  number: number
  size: PageSize
  zoom: number
  root: RefObject<HTMLDivElement>
}) {
  const pageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const renderQueue = useRef<Promise<void>>(Promise.resolve())
  const [render, setRender] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const page = pageRef.current!
    const nearby = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setRender(true)
      },
      { root: root.current, rootMargin: '800px 0px' }
    )
    const distant = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) setRender(false)
      },
      { root: root.current, rootMargin: root.current!.clientHeight * 3 + 'px 0px' }
    )
    nearby.observe(page)
    distant.observe(page)
    return () => {
      nearby.disconnect()
      distant.disconnect()
    }
  }, [root])
  useEffect(() => {
    const canvas = canvasRef.current!
    const container = textRef.current!
    let cancelled = false
    let renderTask: RenderTask | undefined
    let textLayer: TextLayer | undefined
    setReady(false)
    setError('')
    if (!render) {
      canvas.width = 0
      canvas.height = 0
      container.replaceChildren()
      return
    }
    // Reusing a canvas requires the cancelled render promise to settle first.
    const work = renderQueue.current
      .catch(() => {})
      .then(async () => {
        if (cancelled) return
        const page = await pdf.getPage(number)
        if (cancelled) return
        const viewport = page.getViewport({ scale: zoom })
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.ceil(viewport.width * dpr)
        canvas.height = Math.ceil(viewport.height * dpr)
        container.replaceChildren()
        renderTask = page.render({
          canvasContext: canvas.getContext('2d')!,
          viewport,
          transform: [dpr, 0, 0, dpr, 0, 0]
        })
        textLayer = new TextLayer({
          textContentSource: page.streamTextContent(),
          container,
          viewport
        })
        await Promise.all([renderTask.promise, textLayer.render()])
        if (cancelled) return
        const end = document.createElement('div')
        end.className = 'endOfContent'
        container.appendChild(end)
        setReady(true)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '页面渲染失败')
      })
    renderQueue.current = work
    return () => {
      cancelled = true
      renderTask?.cancel()
      textLayer?.cancel()
      container.replaceChildren()
      // Release backing storage after PDF.js has relinquished the canvas.
      void work.then(() => {
        canvas.width = 0
        canvas.height = 0
      })
    }
  }, [pdf, number, render, zoom])
  useEffect(() => {
    const clear = () => textRef.current?.classList.remove('selecting')
    window.addEventListener('mouseup', clear)
    return () => window.removeEventListener('mouseup', clear)
  }, [])
  return (
    <div
      ref={pageRef}
      className={styles.page}
      data-page={number}
      data-ready={ready}
      style={
        {
          width: size.width * zoom,
          height: size.height * zoom,
          '--scale-factor': zoom
        } as CSSProperties
      }
    >
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
      <div
        ref={textRef}
        className="textLayer"
        onMouseDown={() => textRef.current?.classList.add('selecting')}
      />
      {!ready && (
        <div className={styles.placeholder} role={error ? 'alert' : 'status'}>
          {error || (render ? <span className="spinner" aria-label="正在渲染页面" /> : null)}
        </div>
      )}
    </div>
  )
}
