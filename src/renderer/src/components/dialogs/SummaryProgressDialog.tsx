import { useSummaryStore } from '../../stores/summaryStore'
import { renderMarkdown } from '../../lib/markdown'
import { Modal } from './Modal'
import styles from './BusinessDialog.module.css'
export function SummaryProgressDialog() {
  const store = useSummaryStore(),
    s = store.activeKey ? store.jobs[store.activeKey] : undefined
  if (!store.visible || !s) return null
  if (store.cancellingKey)
    return (
      <Modal
        key="cancel-summary"
        title="取消全文总结？"
        onClose={store.dismissCancel}
        footer={
          <>
            <button onClick={store.dismissCancel}>继续总结</button>
            <button className="primary" onClick={store.confirmCancel}>
              确认取消
            </button>
          </>
        }
      >
        <div className={styles.content}>
          <p>当前总结申请已经发送，可能需要等待一段时间，确认取消？</p>
        </div>
      </Modal>
    )
  if (s.promptOpen) return null
  const stage = s.progress?.stage || 'extract',
    index = ['extract', 'map', 'reduce'].indexOf(stage),
    done = s.progress?.done || 0,
    total = s.progress?.total || 1,
    complete = ['unsaved', 'saving', 'saved'].includes(s.status)
  const title =
    s.status === 'confirm'
      ? '确认全文总结'
      : s.status === 'error'
        ? '总结未完成'
        : s.status === 'unsaved'
          ? '总结尚未保存'
          : s.status === 'saved'
            ? '全文总结结果'
            : '正在总结全文'
  const footer = (
    <>
      <button onClick={store.close}>关闭</button>
      <button disabled={s.status === 'saving'} onClick={() => void store.retry()}>
        重试
      </button>
      <button disabled={s.status === 'saving'} onClick={store.cancel}>
        取消
      </button>
      {s.status === 'confirm' && (
        <button className="primary" onClick={() => void store.run()}>
          继续总结
        </button>
      )}
      {s.status === 'unsaved' && (
        <button className="primary" onClick={() => void store.save()}>
          重新选择位置
        </button>
      )}
      {s.status === 'saved' && (
        <button className="primary" onClick={store.showPrompt}>
          加入提示词
        </button>
      )}
    </>
  )
  return (
    <Modal key="summary" title={title} onClose={store.close} footer={footer}>
      <div className={styles.content}>
        <div className={styles.filename} title={s.file.path}>
          {s.file.name}
        </div>
        {s.status === 'confirm' ? (
          <p>
            全文约 {(s.tokens / 10000).toFixed(1)} 万 token，预计请求 {s.requests} 次，继续？
          </p>
        ) : (
          <>
            {!complete && (
              <>
                <div className={styles.row}>
                  <span>
                    {stage === 'extract' ? '提取正文' : stage === 'map' ? '分块提炼' : '生成报告'}{' '}
                    {done} / {total}
                  </span>
                </div>
                <div
                  className={styles.progress}
                  role="progressbar"
                  aria-label="总结进度"
                  aria-valuemin={0}
                  aria-valuemax={total}
                  aria-valuenow={done}
                >
                  <div style={{ width: (done / total) * 100 + '%' }} />
                </div>
                <ol className={styles.steps}>
                  {['提取全文', '分块提炼', '生成总结'].map((label, i) => (
                    <li
                      key={label}
                      data-current={i === index}
                      data-done={i < index || (i === index && done === total)}
                    >
                      {i === index && done < total && s.status !== 'error' ? (
                        <span className="spinner" />
                      ) : (
                        <i />
                      )}
                      {label}
                    </li>
                  ))}
                </ol>
              </>
            )}
            {s.error && (
              <p className={styles.error} role="alert">
                {s.error}
              </p>
            )}
            {s.status === 'unsaved' && (
              <p>总结已完成，结果已保留。可以选择保存位置，关闭后可再次查看。</p>
            )}
            {s.status === 'saved' && <p>上次总结结果已保留。点击重试才会重新生成。</p>}
            {s.savedPath && (
              <div className={styles.path}>
                <span title={s.savedPath}>{s.savedPath}</span>
              </div>
            )}
            {!complete && <p>关闭窗口后会继续在后台总结，完成后给出提示。</p>}
            <details key={complete ? 'result' : 'progress'} open={complete ? true : undefined}>
              <summary>{complete ? '总结结果' : '实时预览'}</summary>
              <div
                className={styles.preview}
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(s.result?.markdown || '正在生成…')
                }}
              />
            </details>
          </>
        )}
      </div>
    </Modal>
  )
}
