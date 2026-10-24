import { create } from 'zustand'
import { useDocStore } from '../stores/docStore'
import { useAnnotStore, isDirty } from '../stores/annotStore'
import { useUIStore } from '../stores/uiStore'
export const useFileActions = create<{
  prompt: string | null
  error: string
  saving: boolean
  saveError: string | null
}>(() => ({ prompt: null, error: '', saving: false, saveError: null }))
let resolveClose: ((choice: 'save' | 'discard' | 'cancel') => void) | undefined
function flushNote() {
  const el = document.activeElement
  if (el instanceof HTMLElement && el.matches('[data-note-editor]')) el.blur()
}
export async function saveDocument(id: string, saveAs = false): Promise<boolean> {
  flushNote()
  const file = useDocStore.getState().docs.find((d) => d.fileId === id),
    edits = useAnnotStore.getState().files[id]
  if (!file || file.kind !== 'pdf' || !edits || edits.protected) return false
  if (!saveAs && !isDirty(edits)) return true
  if (useFileActions.getState().saving) return false
  useFileActions.setState({ saving: true, error: '', saveError: null })
  try {
    const request = { fileId: id, annots: edits.annots },
      result = await (saveAs ? window.api.savePdfAs(request) : window.api.savePdf(request))
    if (!result.ok) {
      if (result.code !== 'CANCELED')
        useFileActions.setState({ error: result.message, saveError: id })
      return false
    }
    useDocStore.setState((s) => ({
      docs: s.docs.map((d) =>
        d.fileId === id
          ? {
              ...d,
              path: result.path,
              name: result.path.split(/[\\/]/).at(-1)!,
              mtimeMs: result.mtimeMs
            }
          : d
      )
    }))
    useAnnotStore.getState().markSaved(id, edits.version)
    useUIStore.getState().showToast('已保存')
    return true
  } catch {
    useFileActions.setState({
      error: '保存失败，请检查文件是否被占用，或选择另存为',
      saveError: id
    })
    return false
  } finally {
    useFileActions.setState({ saving: false })
  }
}
export function closeChoice(choice: 'save' | 'discard' | 'cancel') {
  resolveClose?.(choice)
  resolveClose = undefined
}
async function confirmFile(id: string): Promise<boolean> {
  flushNote()
  if (!isDirty(useAnnotStore.getState().files[id])) return true
  useDocStore.getState().setActive(id)
  useFileActions.setState({ prompt: id, error: '', saveError: null })
  while (true) {
    const choice = await new Promise<'save' | 'discard' | 'cancel'>((resolve) => {
      resolveClose = resolve
    })
    if (choice === 'cancel') {
      useFileActions.setState({ prompt: null, error: '', saveError: null })
      return false
    }
    if (choice === 'discard') {
      useFileActions.setState({ prompt: null })
      return true
    }
    if (await saveDocument(id)) {
      useFileActions.setState({ prompt: null })
      return true
    }
    useFileActions.setState({ saveError: null })
  }
}
let closing = false
export async function requestClose(id: string): Promise<void> {
  if (closing) return
  closing = true
  try {
    if (await confirmFile(id)) {
      useDocStore.getState().close(id)
      useAnnotStore.getState().discard(id)
    }
  } finally {
    closing = false
  }
}
export function bindCloseEvents(): () => void {
  return window.api.onCloseRequest(() => {
    if (closing) return
    closing = true
    void (async () => {
      try {
        flushNote()
        for (const file of useDocStore.getState().docs)
          if (!(await confirmFile(file.fileId))) return
        await window.api.confirmClose()
      } finally {
        closing = false
      }
    })()
  })
}
