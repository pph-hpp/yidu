import { it, expect } from 'vitest'
import { PDFDocument, PDFDict, PDFName, PDFHexString } from 'pdf-lib'
import { writePdfAnnotations, preparePdfForReading } from '../../src/main/services/pdf-writer'
import type { Annot, Quad } from '../../src/shared/types'
import { resolve } from 'node:path'
import { ANNOT_INDEX_KEY } from '../../src/shared/annotations'
const date = '2026-10-24T01:00:00.000Z',
  q: Quad = [50, 700, 180, 700, 50, 680, 180, 680]
const annots: Annot[] = [
  { id: 'highlight', page: 1, createdAt: date, kind: 'highlight', quads: [q], color: '#fde68a' },
  {
    id: 'background',
    page: 1,
    createdAt: date,
    kind: 'background',
    quads: [q.map((v, i) => (i % 2 ? v - 40 : v)) as Quad],
    color: '#bbf7d0',
    opacity: 0.35
  },
  {
    id: 'text',
    page: 1,
    createdAt: date,
    kind: 'textColor',
    quads: [q.map((v, i) => (i % 2 ? v - 80 : v)) as Quad],
    color: '#b42318',
    text: '中文颜色测试',
    fontSize: 12
  },
  {
    id: 'note',
    page: 1,
    createdAt: date,
    kind: 'note',
    at: [220, 700],
    content: '中文便签：时序裕量',
    author: '我的注释'
  }
]
it('四类注释经 pdf.js 读回，中文、颜色、坐标一致且重复保存幂等', async () => {
  const original = await PDFDocument.create()
  const page = original.addPage([612, 792])
  const foreign = original.context.obj({
    Type: 'Annot',
    Subtype: 'Text',
    Rect: [20, 20, 42, 42],
    NM: PDFHexString.fromText('foreign-note'),
    Contents: PDFHexString.fromText('其他软件注释'),
    Name: 'Comment'
  })
  page.node.set(PDFName.of('Annots'), original.context.obj([original.context.register(foreign)]))
  const first = await writePdfAnnotations(
    await original.save(),
    annots,
    resolve('resources/fonts/NotoSansSC-Regular.ttf')
  )
  const second = await writePdfAnnotations(
    first,
    annots,
    resolve('resources/fonts/NotoSansSC-Regular.ttf')
  )
  expect(second.length-first.length).toBeLessThan(100000)
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  for (const bytes of [first, second]) {
    const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise
    const items = await (await doc.getPage(1)).getAnnotations()
    expect(items).toHaveLength(5)
    expect(items.filter((a) => a.subtype === 'Highlight')).toHaveLength(2)
    expect([...items.find((a) => a.subtype === 'Highlight').color]).toEqual([253, 230, 138])
    expect([...items.find((a) => a.subtype === 'Highlight').quadPoints]).toEqual(q)
    expect(items.find((a) => a.subtype === 'FreeText').contentsObj.str).toBe('中文颜色测试')
    expect(items.find((a) => a.contentsObj.str === '中文便签：时序裕量').titleObj.str).toBe(
      '我的注释'
    )
    expect(items.some((a) => a.contentsObj.str === '其他软件注释')).toBe(true)
    await doc.destroy()
  }
  const raw = await PDFDocument.load(second),
    dicts = raw
      .getPage(0)
      .node.Annots()!
      .asArray()
      .map((r) => raw.context.lookup(r) as PDFDict)
  expect(
    dicts
      .find((d) => d.get(PDFName.of('Subtype'))?.toString() === '/FreeText')!
      .has(PDFName.of('AP'))
  ).toBe(true)
  const copy = await preparePdfForReading(second),
    reader = await pdfjs.getDocument({ data: copy, isEvalSupported: false }).promise
  const info = (await reader.getMetadata()).info as { Custom: Record<string, string> }
  const index = JSON.parse(info.Custom[ANNOT_INDEX_KEY])
  expect(Object.values(index.refs)).toHaveLength(4)
  expect(Object.values(index.refs)).toContainEqual(annots[3])
  await reader.destroy()
}, 20000)
