import { describe, expect, it } from 'vitest'
import { isAppPage, isExternalLink } from '../../src/main/security'
import { validateOpenPath } from '../../src/main/services/file.service'
describe('IPC and navigation security', () => {
  it('matches exact application page, allowing only hash differences', () => {
    const url = 'file:///E:/app/out/renderer/index.html'
    expect(isAppPage(url + '#heading', url)).toBe(true)
    for (const candidate of [
      'file:///E:/private.txt',
      'about:blank',
      'https://evil.example',
      url + '?injected'
    ])
      expect(isAppPage(candidate, url)).toBe(false)
    expect(isAppPage('http://localhost:5173/other', 'http://localhost:5173/')).toBe(false)
    expect(isAppPage('http://localhost:5174/', 'http://localhost:5173/')).toBe(false)
  })
  it('only permits HTTP links to the system browser', () => {
    expect(isExternalLink('https://example.org/paper')).toBe(true)
    for (const url of ['file:///C:/private', 'javascript:alert(1)', 'mailto:x@y.z', 'ms-settings:'])
      expect(isExternalLink(url)).toBe(false)
  })
  it('rejects non-file and malformed IPC requests', () => {
    for (const value of [
      null,
      {},
      { path: 2 },
      { path: 'relative.md' },
      { path: 'E:\\file.exe' },
      { path: 'E:\\bad\0.pdf' },
      { path: 'a'.repeat(32768) }
    ])
      expect(() => validateOpenPath(value)).toThrow()
  })
})
