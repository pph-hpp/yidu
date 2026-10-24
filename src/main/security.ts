export function isAppPage(candidate: string, appUrl: string): boolean {
  try {
    const actual = new URL(candidate)
    const expected = new URL(appUrl)
    return (
      actual.protocol === expected.protocol &&
      actual.host === expected.host &&
      actual.pathname === expected.pathname &&
      actual.search === expected.search
    )
  } catch {
    return false
  }
}
export function isExternalLink(url: string): boolean {
  try {
    return ['https:', 'http:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}
