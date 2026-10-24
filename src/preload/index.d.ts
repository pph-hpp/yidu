import type { YiduAPI } from '../shared/ipc'
declare global {
  interface Window {
    api: YiduAPI
  }
}
export {}
