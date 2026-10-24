import { useDocStore } from '../stores/docStore'
export function registerShortcuts(openFile: () => void): () => void {
  const onKey = (event: KeyboardEvent) => {
    const typing = (event.target as HTMLElement).closest(
      'input, textarea, select, [contenteditable="true"]'
    )
    if (!(event.ctrlKey || event.metaKey)) return
    const state = useDocStore.getState()
    if (event.key.toLowerCase() === 'o') {
      event.preventDefault()
      openFile()
      return
    }
    if (event.key.toLowerCase() === 'w' && state.activeId) {
      event.preventDefault()
      state.close(state.activeId)
      return
    }
    if (event.key === 'Tab' && state.docs.length) {
      event.preventDefault()
      const i = state.docs.findIndex((d) => d.fileId === state.activeId)
      state.setActive(
        state.docs[(i + (event.shiftKey ? -1 : 1) + state.docs.length) % state.docs.length].fileId
      )
    }
    if (typing || !(event.target as HTMLElement).closest('[data-document-pane]')) return
    if (['=', '+', '-', '0'].includes(event.key)) {
      event.preventDefault()
      state.setZoom(event.key === '0' ? 1 : state.zoom + (event.key === '-' ? -0.1 : 0.1))
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}
