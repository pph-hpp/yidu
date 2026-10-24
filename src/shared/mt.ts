// 机器翻译引擎的内置元数据，不写入配置（设计文档 8.6）
export type MtEngineId = 'microsoft-free' | 'google-free' | 'youdao' // 以后增加 'yidu-cloud'
export interface MtEngineInfo {
  id: MtEngineId
  name: string
  requiresKey: boolean
  needsProxyInChina: boolean
  /** 隐私提示中的服务方 */
  provider: string
  /** 允许请求的域名白名单 */
  hosts: readonly string[]
  signupUrl?: string
}
export const MT_ENGINES: readonly MtEngineInfo[] = [
  {
    id: 'microsoft-free',
    name: '微软翻译（免费）',
    requiresKey: false,
    needsProxyInChina: false,
    provider: '微软',
    hosts: ['edge.microsoft.com', 'api-edge.cognitive.microsofttranslator.com']
  },
  {
    id: 'google-free',
    name: '谷歌翻译（免费）',
    requiresKey: false,
    needsProxyInChina: true,
    provider: '谷歌',
    hosts: ['translate.googleapis.com']
  },
  {
    id: 'youdao',
    name: '有道智云',
    requiresKey: true,
    needsProxyInChina: false,
    provider: '有道',
    hosts: ['openapi.youdao.com'],
    signupUrl: 'https://ai.youdao.com/'
  }
]
export const DEFAULT_MT_ENGINE: MtEngineId = 'microsoft-free'
/** 有道应用密钥在 secret.service 中使用的固定标识 */
export const YOUDAO_SECRET_ID = 'youdao'
export function isMtEngineId(value: unknown): value is MtEngineId {
  return MT_ENGINES.some((e) => e.id === value)
}
export function mtEngine(id: MtEngineId): MtEngineInfo {
  return MT_ENGINES.find((e) => e.id === id)!
}
