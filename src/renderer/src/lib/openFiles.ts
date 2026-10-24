import { useDocStore } from '../stores/docStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useUIStore } from '../stores/uiStore'
export async function refreshRecent() {
  const recent = await window.api.recentFiles()
  const config = useSettingsStore.getState().config
  if (config) useSettingsStore.setState({ config: { ...config, recent } })
}
export async function openPaths(paths: string[]) {
  for (const path of paths) {
    try {
      useDocStore.getState().open(await window.api.openPath({ path }))
    } catch (e) {
      useUIStore
        .getState()
        .showToast(
          '无法打开文件：' +
            (e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, '')
        )
    }
  }
  await refreshRecent()
}
