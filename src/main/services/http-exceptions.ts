import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// Main-process-only, provisioned by the explicit import command. No renderer setter.
export function approvedHttpUrls(): string[] {
  try {
    if (!app?.getPath) return []
    const data = JSON.parse(
      readFileSync(join(app.getPath('userData'), 'http-exceptions.json'), 'utf8')
    )
    return Array.isArray(data.urls)
      ? data.urls.filter(
          (s: unknown) =>
            typeof s === 'string' && s.length < 2048 && new URL(s).protocol === 'http:'
        )
      : []
  } catch {
    return []
  }
}
