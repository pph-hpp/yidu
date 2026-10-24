import type { Annot } from '../../../shared/types'
import type { EditTool } from '../../../shared/annotations'
import { useDocStore } from '../stores/docStore'
import { useAnnotStore } from '../stores/annotStore'
import { useUIStore } from '../stores/uiStore'
import { getPdf } from '../components/PdfViewer/pdfCache'
import { rectToQuad, selectedRects, quadToRect } from './pdfGeometry'
export async function annotateSelection(
  tool: Exclude<EditTool, 'select'>,
  selected?: Range
): Promise<void> {
  const state = useDocStore.getState(),
    file = state.docs.find((f) => f.fileId === state.activeId),
    edits = useAnnotStore.getState()
  if (!file || file.kind !== 'pdf' || edits.files[file.fileId]?.protected) return
  const selection = window.getSelection(),
    range = selected || (selection?.rangeCount && selection.getRangeAt(0).cloneRange())
  if (!range || range.collapsed) return
  const pdf = await getPdf(file).promise,
    annotations: Annot[] = []
  for (const element of document.querySelectorAll<HTMLElement>('[data-page]')) {
    if (!range.intersectsNode(element)) continue
    const data = selectedRects(range, element)
    if (!data.rects.length) continue
    const page = Number(element.dataset.page),
      viewport = (await pdf.getPage(page)).getViewport({ scale: state.zoom }),
      bounds = element.getBoundingClientRect()
    const quads = data.rects.map((r) => rectToQuad(r, bounds, viewport)),
      base = { id: crypto.randomUUID(), page, createdAt: new Date().toISOString() },
      color = getComputedStyle(document.documentElement)
        .getPropertyValue('--mark-' + edits.colors[tool])
        .trim()
    if (tool === 'note') {
      const r = data.rects[0],
        point = viewport.convertToPdfPoint(
          Math.min(viewport.width - 26, r.right - bounds.left + 8),
          r.top - bounds.top
        )
      annotations.push({
        ...base,
        kind: 'note',
        at: [point[0], point[1]],
        content: '',
        author: '我的注释'
      })
      break
    }
    if (tool === 'textColor')
      annotations.push({
        ...base,
        kind: tool,
        quads,
        color,
        text: data.text.slice(0, 6000),
        fontSize: data.fontSize / state.zoom
      })
    else if (tool === 'background')
      annotations.push({ ...base, kind: tool, quads, color, opacity: edits.opacity })
    else annotations.push({ ...base, kind: tool, quads, color })
  }
  if (annotations.length) {
    edits.add(file.fileId, annotations)
    selection?.removeAllRanges()
    if (tool === 'note') edits.select(annotations[0].id)
  }
}
export async function pageClick(
  event: MouseEvent,
  fileId: string,
  pageNumber: number
): Promise<void> {
  if ((event.target as HTMLElement).closest('[data-annotation-ui]')) return
  const doc = useDocStore.getState(),
    file = doc.docs.find((f) => f.fileId === fileId),
    state = useAnnotStore.getState()
  if (!file || state.files[fileId]?.protected) return
  const selected = window.getSelection()
  if (state.tool !== 'select' && state.tool !== 'note' && selected && !selected.isCollapsed) {
    await annotateSelection(state.tool)
    return
  }
  const element = (event.target as HTMLElement).closest<HTMLElement>('[data-page]')
  if (!element) return
  const pdf = await getPdf(file).promise,
    viewport = (await pdf.getPage(pageNumber)).getViewport({ scale: doc.zoom }),
    bounds = element.getBoundingClientRect(),
    x = event.clientX - bounds.left,
    y = event.clientY - bounds.top
  if (state.tool === 'note') {
    const point = viewport.convertToPdfPoint(x, y),
      note: Annot = {
        id: crypto.randomUUID(),
        page: pageNumber,
        createdAt: new Date().toISOString(),
        kind: 'note',
        at: [point[0], point[1]],
        content: '',
        author: '我的注释'
      }
    state.add(fileId, [note])
    state.select(note.id)
    return
  }
  if (state.tool === 'select' && (!selected || selected.isCollapsed)) {
    const annotation = state.files[fileId]?.annots.find(
      (a) =>
        a.page === pageNumber &&
        a.kind !== 'note' &&
        a.quads.some((q) => {
          const r = quadToRect(q, viewport)
          return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
        })
    )
    state.select(annotation?.id || null)
  }
}
export function safeAnnotate(tool: Exclude<EditTool, 'select'>): void {
  void annotateSelection(tool).catch(() =>
    useUIStore.getState().showToast('无法标注当前选区，请重新选择文字')
  )
}
