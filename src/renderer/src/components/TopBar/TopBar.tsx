import { useTheme } from '../../lib/theme'
import { useDocStore } from '../../stores/docStore'
import { useSummaryStore, summaryKey } from '../../stores/summaryStore'
import { llmReady, requireLlm, useSettingsStore } from '../../stores/settingsStore'
import { Icon } from '../Icon'
import { FileTabs } from '../FileTabs/FileTabs'
import { Select } from '../Select/Select'
import styles from './TopBar.module.css'
export function TopBar({ openFile }: { openFile(): void }) {
  const theme = useTheme()
  const file = useDocStore((s) => s.docs.find((d) => d.fileId === s.activeId))
  const summary = useSummaryStore((s) => (file ? s.jobs[summaryKey(file)] : undefined))
  const canSummarize = useSettingsStore(llmReady)
  const summaryLabel = !summary
    ? '全文总结'
    : ['unsaved', 'saving', 'saved'].includes(summary.status)
      ? '总结已完成'
      : summary.status === 'error'
        ? '总结待重试'
        : summary.status === 'confirm'
          ? '总结待确认'
          : '总结进行中'
  return (
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <span className={styles.logo}>译</span>
        <strong>译读</strong>
      </div>
      <FileTabs openFile={openFile} />
      <Select
        variant="compact"
        aria-label="界面主题"
        title="界面主题"
        value={theme.theme}
        onChange={theme.setTheme}
        options={[
          { value: 'system', label: '跟随系统' },
          { value: 'light', label: '浅色' },
          { value: 'dark', label: '深色' }
        ]}
      />
      <button
        className={styles.summary}
        disabled={!file}
        data-unavailable={!!file && !summary && !canSummarize}
        onClick={() => {
          // 已有总结任务时仍可查看；新任务需要可用的大模型（设计文档 8.9）
          if (file && (summary || requireLlm())) void useSummaryStore.getState().start(file)
        }}
        aria-label="全文总结"
        title={
          summary
            ? summaryLabel + '，点击查看'
            : canSummarize
              ? '总结当前文档全文'
              : '全文总结需要配置大模型 API'
        }
      >
        <Icon name="summary" size={15} />
        {summaryLabel}
      </button>
      <button
        className={styles.settings}
        onClick={() => useSettingsStore.getState().open()}
        aria-label="设置"
        title="设置"
      >
        <Icon name="settings" size={18} />
      </button>
    </header>
  )
}
