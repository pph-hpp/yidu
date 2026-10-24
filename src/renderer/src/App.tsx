import { SourceLinkOverlay, clearSourceLink } from './lib/sourceLink'
import { SplitPane } from './components/SplitPane/SplitPane'
import { openPaths, refreshRecent } from './lib/openFiles'
import { bindCloseEvents } from './lib/fileActions'
import { UnsavedChangesDialog } from './components/dialogs/UnsavedChangesDialog'
import { useAnnotStore } from './stores/annotStore'
import { bindSummaryEvents } from './stores/summaryStore'
import { SummaryProgressDialog } from './components/dialogs/SummaryProgressDialog'
import { AddToPromptDialog } from './components/dialogs/AddToPromptDialog'
import { MtPrivacyDialog } from './components/dialogs/MtPrivacyDialog'
import { useCallback, useEffect, useState } from 'react'
import { useDocStore } from './stores/docStore'
import { useSettingsStore } from './stores/settingsStore'
import { SettingsDialog } from './components/dialogs/SettingsDialog'
import { bindTranslationEvents, useTranslateStore } from './stores/translateStore'
import { useUIStore } from './stores/uiStore'
import { TopBar } from './components/TopBar/TopBar'
import { EditToolbar } from './components/EditToolbar/EditToolbar'
import { DocumentPane } from './components/DocumentPane/DocumentPane'
import { TranslatePane } from './components/TranslatePane/TranslatePane'
import { StatusBar } from './components/StatusBar/StatusBar'
import { releaseClosedPdfs } from './components/PdfViewer/pdfCache'
import { registerShortcuts } from './lib/shortcuts'
import styles from './App.module.css'
export function App() {
  const docs = useDocStore((s) => s.docs),
    activeId = useDocStore((s) => s.activeId)
  const settings = useSettingsStore()
  useEffect(() => {
    void useSettingsStore
      .getState()
      .load()
      .then(() =>
        useTranslateStore
          .getState()
          .setMode(useSettingsStore.getState().config!.settings.defaultMode)
      )
    const offTranslation = bindTranslationEvents(),
      offSummary = bindSummaryEvents(),
      offClose = bindCloseEvents()
    return () => {
      offTranslation()
      offSummary()
      offClose()
    }
  }, [])
  useEffect(() => window.api.onOpenPaths((paths) => void openPaths(paths)), [])
  const toast = useUIStore((s) => s.toast)
  const [dragging, setDragging] = useState(false)
  const [opening, setOpening] = useState(false),
    [error, setError] = useState('')
  const openFile = useCallback(async () => {
    setOpening(true)
    setError('')
    try {
      const file = await window.api.openFile()
      if (file) {
        useDocStore.getState().open(file)
        await refreshRecent()
      }
    } catch (reason) {
      setError(
        (reason as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, '')
      )
    } finally {
      setOpening(false)
    }
  }, [])
  useEffect(() => registerShortcuts(() => void openFile()), [openFile])
  useEffect(() => releaseClosedPdfs(docs.map((d) => d.fileId)), [docs])
  useEffect(() => {
    clearSourceLink()
    useAnnotStore.getState().setTool('select')
    useTranslateStore.getState().clear()
    setError('')
  }, [activeId])
  return (
    <main
      className={styles.app}
      data-dragging={dragging}
      onDragEnter={(e) => {
        e.preventDefault()
        if (e.dataTransfer.types.includes('Files')) setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        void openPaths(
          Array.from(e.dataTransfer.files)
            .map((file) => window.api.getPathForFile(file))
            .filter((path) => /\.(pdf|md|markdown)$/i.test(path))
        )
      }}
    >
      <TopBar openFile={() => void openFile()} />
      <SplitPane>
        <section className={styles.left} data-document-pane>
          <EditToolbar />
          <DocumentPane
            file={docs.find((d) => d.fileId === activeId)}
            openFile={() => void openFile()}
            opening={opening}
            error={error}
          />
        </section>
        <TranslatePane />
      </SplitPane>
      <SourceLinkOverlay />
      <StatusBar />
      <UnsavedChangesDialog />
      <SummaryProgressDialog />
      <AddToPromptDialog />
      <MtPrivacyDialog />
      {settings.opened && settings.config && <SettingsDialog />}
      {toast && (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      )}
    </main>
  )
}
