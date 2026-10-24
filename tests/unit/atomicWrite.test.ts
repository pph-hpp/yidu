import { it, expect } from 'vitest'
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { atomicWrite } from '../../src/main/services/atomic-write'
it('提交前失败不破坏原文件，成功后完整替换且清理临时文件', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yidu-atomic-')),
    path = join(root, 'source.pdf')
  try {
    await writeFile(path, 'original')
    await expect(
      atomicWrite(path, new TextEncoder().encode('new'), async () => {
        throw new Error('simulate crash before rename')
      })
    ).rejects.toThrow('simulate')
    expect(await readFile(path, 'utf8')).toBe('original')
    expect(await readdir(root)).toEqual(['source.pdf'])
    await atomicWrite(path, new TextEncoder().encode('new'))
    expect(await readFile(path, 'utf8')).toBe('new')
  } finally {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep) || !root.includes('yidu-atomic-'))
      throw new Error('临时目录范围无效')
    await rm(root, { recursive: true, force: true })
  }
})

import { spawn } from 'node:child_process'
import ts from 'typescript'
import { PDFDocument } from 'pdf-lib'
it('A12 真实子进程在落盘后、替换前被强杀，原 PDF 完整可读', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yidu-atomic-')),
    path = join(root, 'original.pdf')
  try {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const original = await pdf.save()
    await writeFile(path, original)
    const source = await readFile(resolve('src/main/services/atomic-write.ts'), 'utf8')
    const js = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
    }).outputText
    const script = join(root, 'writer.mjs')
    await writeFile(
      script,
      js +
        "\nawait atomicWrite(process.argv[2],new Uint8Array(1024*1024),async()=>{process.send('flushed');await new Promise(()=>{setInterval(()=>{},1000)})})"
    )
    const child = spawn(process.execPath, [script, path], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      windowsHide: true
    })
    await new Promise<void>((res, rej) => {
      child.once('message', () => res())
      child.once('error', rej)
      child.once('exit', (code) => rej(new Error('提前退出 ' + code)))
    })
    const exited = new Promise<void>((res) => child.once('exit', () => res()))
    child.kill('SIGKILL')
    await exited
    expect(await readFile(path)).toEqual(Buffer.from(original))
    expect((await PDFDocument.load(await readFile(path))).getPageCount()).toBe(1)
  } finally {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep) || !root.includes('yidu-atomic-'))
      throw new Error('临时目录范围无效')
    await rm(root, { recursive: true, force: true })
  }
})
