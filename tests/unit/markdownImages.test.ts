import { it, expect } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { readMarkdownImages } from '../../src/main/services/markdown-images'
it('相对图片读取和外部目录/远程/伪装 MIME 拒绝', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yidu-images-')),
    dir = join(root, 'paper')
  try {
    await mkdir(dir)
    const png = Buffer.from('89504e470d0a1a0a00000000', 'hex')
    await writeFile(join(dir, 'plot.png'), png)
    await writeFile(join(root, 'private.png'), png)
    await writeFile(join(dir, 'fake.png'), '<script>bad</script>')
    await symlink(root, join(dir, 'outside'), 'junction')
    const md =
      '![ok](plot.png) ![escape](../private.png) ![link](outside/private.png) ![bad](fake.png) ![remote](https://example.org/x.png)'
    const images = await readMarkdownImages(join(dir, 'paper.md'), md)
    expect(Object.keys(images)).toEqual(['plot.png'])
    expect(images['plot.png'].mime).toBe('image/png')
  } finally {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep)) throw new Error('临时目录范围错误')
    await rm(root, { recursive: true, force: true })
  }
})
