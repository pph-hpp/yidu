import { create } from 'zustand'
type Theme = 'light' | 'dark' | 'system'
function read(): Theme {
  try {
    const t = localStorage.getItem('yidu-theme')
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}
export const useTheme = create<{ theme: Theme; setTheme(t: Theme): void }>((set) => ({
  theme: read(),
  setTheme(theme) {
    try {
      localStorage.setItem('yidu-theme', theme)
    } catch {}
    set({ theme })
    apply(theme)
  }
}))
const media = matchMedia('(prefers-color-scheme: dark)')
function apply(t: Theme) {
  document.documentElement.dataset.theme = t === 'system' ? (media.matches ? 'dark' : 'light') : t
}
apply(useTheme.getState().theme)
media.addEventListener('change', () => apply(useTheme.getState().theme))
