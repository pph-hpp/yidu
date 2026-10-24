import { bindCloseEvents } from './lib/fileActions'
import { UnsavedChangesDialog } from './components/dialogs/UnsavedChangesDialog'
import { useAnnotStore } from './stores/annotStore'
import { bindSummaryEvents } from './stores/summaryStore'
import { SummaryProgressDialog } from './components/dialogs/SummaryProgressDialog'
import { AddToPromptDialog } from './components/dialogs/AddToPromptDialog'
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
  const toast = useUIStore((s) => s.toast)
  const [opening, setOpening] = useState(false),
    [error, setError] = useState('')
  const openFile = useCallback(async () => {
    setOpening(true)
    setError('')
    try {
      const file = await window.api.openFile()
      if (file) useDocStore.getState().open(file)
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
    useAnnotStore.getState().setTool('select')
    useTranslateStore.getState().clear()
    setError('')
  }, [activeId])
  return (
    <main
      className={styles.app}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        useUIStore.getState().showToast('请使用打开文件按钮或 Ctrl+O')
      }}
    >
      <TopBar openFile={() => void openFile()} />
      <div className={styles.body}>
        <section className={styles.left} data-document-pane>
          <EditToolbar />
          <DocumentPane
            file={docs.find((d) => d.fileId === activeId)}
            openFile={() => void openFile()}
            opening={opening}
            error={error}
          />
        </section>
        <div className={styles.divider} />
        <TranslatePane />
      </div>
      <StatusBar />
      <UnsavedChangesDialog />
      <SummaryProgressDialog />
      <AddToPromptDialog />
      {settings.opened && settings.config && <SettingsDialog />}
      {toast && (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      )}
    </main>
  )
}
