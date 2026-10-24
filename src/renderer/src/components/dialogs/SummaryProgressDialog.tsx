import { useSummaryStore } from '../../stores/summaryStore'
import { renderMarkdown } from '../../lib/markdown'
import { Modal } from './Modal'
import styles from './BusinessDialog.module.css'
export function SummaryProgressDialog() {
  const s = useSummaryStore()
  if (s.status === 'idle' || s.status === 'saved') return null
  const stage = s.progress?.stage || 'extract',
    index = ['extract', 'map', 'reduce'].indexOf(stage),
    done = s.progress?.done || 0,
    total = s.progress?.total || 1
  const title =
    s.status === 'confirm'
      ? '确认全文总结'
      : s.status === 'error'
        ? '总结未完成'
        : s.status === 'unsaved'
          ? '总结尚未保存'
          : '正在总结全文'
  const footer =
    s.status === 'confirm' ? (
      <>
        <button onClick={s.cancel}>取消</button>
        <button className="primary" onClick={() => void s.run()}>
          继续总结
        </button>
      </>
    ) : s.status === 'error' ? (
      <>
        <button onClick={s.cancel}>关闭</button>
        <button className="primary" onClick={() => void (s.text ? s.run() : s.start(s.file!))}>
          重试
        </button>
      </>
    ) : s.status === 'unsaved' ? (
      <>
        <button onClick={s.cancel}>放弃</button>
        <button className="primary" onClick={() => void s.save()}>
          重新选择位置
        </button>
      </>
    ) : (
      <button onClick={s.cancel}>取消</button>
    )
  return (
    <Modal title={title} onClose={s.cancel} footer={footer}>
      <div className={styles.content}>
        {s.status === 'confirm' ? (
          <p>
            全文约 {(s.tokens / 10000).toFixed(1)} 万 token，预计请求 {s.requests} 次，继续？
          </p>
        ) : (
          <>
            <div className={styles.row}>
              <span>
                {stage === 'extract' ? '提取正文' : stage === 'map' ? '分块提炼' : '生成报告'}{' '}
                {done} / {total}
              </span>
              <span className={styles.filename}>{s.file?.name}</span>
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
                  {i === index && done < total ? <span className="spinner" /> : <i />}
                  {label}
                </li>
              ))}
            </ol>
            {s.error && (
              <p className={styles.error} role="alert">
                {s.error}
              </p>
            )}
            {s.status === 'unsaved' && <p>总结已生成，请选择保存位置；放弃后本次结果不会保存。</p>}
            <details>
              <summary>实时预览</summary>
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
