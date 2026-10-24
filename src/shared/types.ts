export type DocKind = 'pdf' | 'md'
export interface OpenedFile {
  fileId: string
  path: string
  name: string
  kind: DocKind
  bytes?: Uint8Array
  text?: string
  mtimeMs: number
}
export interface RecentFile {
  path: string
  name: string
  kind: DocKind
  mtimeMs: number
}
export type SentenceStatus = 'pending' | 'streaming' | 'done' | 'error'
export interface Sentence {
  id: string
  index: number
  source: string
  target: string
  status: SentenceStatus
  error?: string
}
export type TranslateMode = 'sentence' | 'paragraph'
export type Provider = 'openai-compatible' | 'anthropic' | 'azure-openai'
export interface ModelProfile {
  id: string
  name: string
  provider: Provider
  baseUrl: string
  model: string
  temperature: number
  maxTokens?: number
  contextWindow?: number
  azureApiVersion?: string
}
export type ModelProfileDraft = ModelProfile
export interface ContextSnippet {
  id: string
  source: string
  text: string
  enabled: boolean
  createdAt: string
}
export interface PromptPreset {
  id: string
  name: string
  systemPrompt: string
  snippets: ContextSnippet[]
}
export interface AppSettings {
  activeProfileId: string | null
  activePresetId: string | null
  summaryProfileId: string | null
  targetLang: 'zh-CN'
  defaultMode: TranslateMode
  autoTranslateOnSelect: boolean
  rightPaneWidth: number
  zoom: number
}
export type Quad = [number, number, number, number, number, number, number, number]
export type AnnotBase = { id: string; page: number; createdAt: string }
export type Annot =
  | (AnnotBase & { kind: 'highlight'; quads: Quad[]; color: string })
  | (AnnotBase & { kind: 'background'; quads: Quad[]; color: string; opacity: number })
  | (AnnotBase & {
      kind: 'textColor'
      quads: Quad[]
      color: string
      text: string
      fontSize: number
    })
  | (AnnotBase & { kind: 'note'; at: [number, number]; content: string; author: string })
