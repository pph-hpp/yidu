import { useTranslateStore } from '../../stores/translateStore'
import { Icon } from '../Icon'
import styles from './TranslatePane.module.css'
export function TranslatePane() {
  const sentences = useTranslateStore((s) => s.sentences)
  return (
    <aside className={styles.pane} aria-label="翻译栏">
      <div className={styles.header}>
        <div className={styles.row}>
          <strong>翻译</strong>
          <div className={styles.mode}>
            <button className={styles.selected} disabled>
              逐句
            </button>
            <button disabled>整段</button>
          </div>
        </div>
        <div className={styles.tags}>
          <span className={styles.model}>
            <i />
            未配置模型
          </span>
          <span className={styles.preset}>提示词：通用学术</span>
          <span>已选 {sentences.length} 句</span>
        </div>
      </div>
      <div className={styles.list}>
        {sentences.length ? (
          sentences.map((sentence) => (
            <article key={sentence.id} className={styles.card} data-testid="sentence-card">
              <span className={styles.number}>{sentence.index}</span>
              <div className={styles.content}>
                <div className={styles.target} aria-label="译文待生成">
                  <div className={styles.skeleton} />
                  <div className={styles.skeleton} />
                </div>
                <div className={styles.source}>{sentence.source}</div>
              </div>
            </article>
          ))
        ) : (
          <div className={styles.empty}>
            <Icon name="translate" size={32} />
            <p>在左侧选中文字，这里会逐句显示译文</p>
          </div>
        )}
      </div>
      <div className={styles.footer}>
        <div className={styles.actions}>
          <button disabled>
            <Icon name="copy" size={14} />
            复制译文
          </button>
          <button disabled>重新翻译</button>
          <button disabled>
            <Icon name="lock" size={14} />
            锁定
          </button>
        </div>
        <div className={styles.input}>
          <input disabled placeholder="输入或粘贴文本进行翻译…" aria-label="翻译文本" />
          <button disabled aria-label="翻译输入的文本">
            <Icon name="arrow" />
          </button>
        </div>
      </div>
    </aside>
  )
}
