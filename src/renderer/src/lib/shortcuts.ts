import { useSettingsStore } from '../stores/settingsStore'
import { useSummaryStore } from '../stores/summaryStore'
import { useTranslateStore } from '../stores/translateStore'
import { useUIStore } from '../stores/uiStore'
import { selectionParts, partsText } from './selectionText'
import { bindSources } from './sourceLink'
import { useDocStore } from '../stores/docStore'
import { useAnnotStore } from '../stores/annotStore'
import { requestClose, saveDocument } from './fileActions'
import type { EditTool } from '../../../shared/annotations'
export function registerShortcuts(openFile: () => void): () => void {
  const onKey = (event: KeyboardEvent) => {
    const target = event.target instanceof HTMLElement ? event.target : document.body
    const typing = target.closest('input,textarea,select,[contenteditable="true"]')
    if (document.querySelector('[aria-modal=true]')) return
    const state = useDocStore.getState(),
      id = state.activeId,
      key = event.key.toLowerCase()
    if (event.ctrlKey || event.metaKey) {
      if (key === ',') {
        event.preventDefault()
        useSettingsStore.getState().open()
        return
      }
      if (key === 'l') {
        event.preventDefault()
        useTranslateStore.getState().toggleLock()
        return
      }
      if (key === 'm' && event.shiftKey) {
        event.preventDefault()
        const file = state.docs.find((d) => d.fileId === id)
        if (file) void useSummaryStore.getState().start(file)
        return
      }
      if (key === 'enter' && !typing && target.closest('[data-document-pane]')) {
        event.preventDefault()
        const selection = getSelection(),
          container = document.querySelector<HTMLElement>('[data-document-pane]')
        if (
          selection?.rangeCount &&
          container &&
          container.contains(selection.anchorNode) &&
          container.contains(selection.focusNode) &&
          !useTranslateStore.getState().locked
        ) {
          const parts = selectionParts(selection.getRangeAt(0), container)
          try {
            useTranslateStore.getState().translate(partsText(parts))
            bindSources(useTranslateStore.getState().sentences, parts)
          } catch (e) {
            useUIStore.getState().showToast((e as Error).message)
          }
        }
        return
      }
      if (key === 'o') {
        event.preventDefault()
        openFile()
        return
      }
      if (key === 'w' && id) {
        event.preventDefault()
        void requestClose(id)
        return
      }
      if (key === 's' && id) {
        event.preventDefault()
        void saveDocument(id, event.shiftKey)
        return
      }
      if (event.key === 'Tab' && state.docs.length) {
        event.preventDefault()
        const i = state.docs.findIndex((d) => d.fileId === id)
        state.setActive(
          state.docs[(i + (event.shiftKey ? -1 : 1) + state.docs.length) % state.docs.length].fileId
        )
        return
      }
      if (typing || !target.closest('[data-document-pane]')) return
      if ((key === 'z' || key === 'y') && id) {
        event.preventDefault()
        const edit = useAnnotStore.getState()
        if (key === 'y' || event.shiftKey) edit.redo(id)
        else edit.undo(id)
        return
      }
      if (['=', '+', '-', '0'].includes(event.key)) {
        event.preventDefault()
        state.setZoom(event.key === '0' ? 1 : state.zoom + (event.key === '-' ? -0.1 : 0.1))
      }
      return
    }
    if (typing || event.altKey || !target.closest('[data-document-pane]')) return
    if (['PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
      const scroller = document.querySelector<HTMLElement>(
        '[aria-label="PDF 文档"],[aria-label="Markdown 文档"]'
      )
      if (scroller) {
        event.preventDefault()
        scroller.scrollTo({
          top:
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? scroller.scrollHeight
                : scroller.scrollTop +
                  (event.key === 'PageUp' ? -1 : 1) * scroller.clientHeight * 0.9
        })
      }
      return
    }
    const tools: Record<string, EditTool> = {
      v: 'select',
      h: 'highlight',
      b: 'background',
      t: 'textColor',
      n: 'note',
      escape: 'select'
    }
    if (
      tools[key] &&
      id &&
      state.docs.find((d) => d.fileId === id)?.kind === 'pdf' &&
      !useAnnotStore.getState().files[id]?.protected
    ) {
      event.preventDefault()
      useAnnotStore.getState().setTool(tools[key])
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}
