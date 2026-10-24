import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { FileService } from '../../src/main/services/file.service'
const folder = await mkdtemp(join(tmpdir(), 'yidu-unit-'))
afterAll(() => rm(folder, { recursive: true, force: true }))
it('returns BOM-free UTF-8, stable fileId, and a main-process path mapping', async () => {
  const path = join(folder, 'sample.markdown')
  await writeFile(path, '\uFEFF# 中文')
  const service = new FileService()
  const file = await service.openPath({ path })
  expect(file.text).toBe('# 中文')
  expect(file.kind).toBe('md')
  expect((await service.openPath({ path })).fileId).toBe(file.fileId)
  expect(service.paths.get(file.fileId)).toBe(file.path)
})
it('rejects invalid UTF-8 and missing files', async () => {
  const path = join(folder, 'invalid.md')
  await writeFile(path, new Uint8Array([0xff, 0xfe]))
  await expect(new FileService().openPath({ path })).rejects.toThrow('编码不支持')
  await expect(new FileService().openPath({ path: join(folder, 'missing.pdf') })).rejects.toThrow()
})

