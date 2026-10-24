import { mtEngine } from '../../../../shared/mt'
import { useUIStore } from '../../stores/uiStore'
import { Modal } from './Modal'
import styles from './BusinessDialog.module.css'
export function MtPrivacyDialog() {
  const engineId = useUIStore((s) => s.privacy)
  if (!engineId) return null
  const engine = mtEngine(engineId),
    answer = useUIStore.getState().answerPrivacy
  return (
    <Modal
      title={'使用' + engine.name + '翻译'}
      onClose={() => answer(false)}
      footer={
        <>
          <button onClick={() => answer(false)}>取消</button>
          <button className="primary" onClick={() => answer(true)}>
            继续使用
          </button>
        </>
      }
    >
      <div className={styles.content}>
        <p>
          选中的文字会发送到{engine.provider}
          的服务器进行翻译。免费引擎为非官方接口，可能不稳定，可以随时在设置中更换。
        </p>
      </div>
    </Modal>
  )
}
