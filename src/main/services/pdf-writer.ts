import {
  PDFDocument,
  PDFName,
  PDFString,
  PDFHexString,
  PDFDict,
  PDFArray,
  PDFNumber,
  PDFRef,
  StandardFonts,
  PDFFont,
  CustomFontEmbedder
} from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Annot, Quad } from '../../shared/types'
import { ANNOT_INDEX_KEY, validateAnnots, type AnnotationIndex } from '../../shared/annotations'
const name = PDFName.of
function string(dict: PDFDict, key: string): string {
  const value = dict.lookup(name(key))
  return value instanceof PDFString || value instanceof PDFHexString ? value.decodeText() : ''
}
function numbers(dict: PDFDict, key: string): number[] {
  const value = dict.lookup(name(key))
  return value instanceof PDFArray
    ? value.asArray().map((v) => (v instanceof PDFNumber ? v.asNumber() : NaN))
    : []
}
function colorValue(color: string): number[] {
  return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
}
function colorHex(values: number[]): string {
  return (
    '#' +
    values
      .slice(0, 3)
      .map((v) =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}
function bounds(quads: Quad[]): number[] {
  const xs = quads.flatMap((q) => [q[0], q[2], q[4], q[6]]),
    ys = quads.flatMap((q) => [q[1], q[3], q[5], q[7]])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}
function date(value: string): PDFString {
  return PDFString.of('D:' + new Date(value).toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z')
}
function readDate(value: string): string {
  const m = /^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(value)
  return m
    ? m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + m[6] + '.000Z'
    : new Date(0).toISOString()
}
function ownAnnot(dict: PDFDict, page: number): Annot | null {
  const nm = string(dict, 'NM')
  if (!nm.startsWith('yidu-')) return null
  const bg = nm.startsWith('yidu-bg-'),
    id = nm.slice(bg ? 8 : 5),
    createdAt = readDate(string(dict, 'CreationDate')),
    base = { id, page, createdAt }
  const subtype = dict.get(name('Subtype'))?.toString(),
    rect = numbers(dict, 'Rect'),
    color = colorHex(numbers(dict, 'C'))
  const values = numbers(dict, 'QuadPoints'),
    quads: Quad[] = []
  for (let i = 0; i + 7 < values.length; i += 8) quads.push(values.slice(i, i + 8) as Quad)
  let annot: Annot
  if (subtype === '/Text')
    annot = {
      ...base,
      kind: 'note',
      at: [rect[0], rect[3]],
      content: string(dict, 'Contents'),
      author: string(dict, 'T')
    }
  else if (subtype === '/FreeText')
    annot = {
      ...base,
      kind: 'textColor',
      quads: quads.length
        ? quads
        : [[rect[0], rect[3], rect[2], rect[3], rect[0], rect[1], rect[2], rect[1]]],
      color,
      text: string(dict, 'Contents'),
      fontSize: Number(/\/Helv\s+([\d.]+)\s+Tf/.exec(string(dict, 'DA'))?.[1] || 12)
    }
  else if (subtype === '/Highlight')
    annot = bg
      ? {
          ...base,
          kind: 'background',
          quads,
          color,
          opacity: (dict.lookup(name('CA')) as PDFNumber | undefined)?.asNumber() ?? 0.35
        }
      : { ...base, kind: 'highlight', quads, color }
  else return null
  try {
    validateAnnots([annot])
    return annot
  } catch {
    return null
  }
}
export async function preparePdfForReading(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false })
    const index: AnnotationIndex = { refs: {} }
    for (const [i, page] of pdf.getPages().entries()) {
      const annots = page.node.Annots()
      if (!annots) continue
      for (const ref of annots.asArray()) {
        const dict = pdf.context.lookup(ref)
        if (!(dict instanceof PDFDict)) continue
        const annot = ownAnnot(dict, i + 1)
        if (annot && ref instanceof PDFRef)
          index.refs[ref.objectNumber + 'R' + (ref.generationNumber || '')] = annot
      }
    }
    // PDF.js 4 does not expose /NM. This index is added only to the in-memory reading copy.
    const info = pdf.context.lookup(pdf.context.trailerInfo.Info)
    if (!Object.keys(index.refs).length) {
      if (!(info instanceof PDFDict) || !info.has(name(ANNOT_INDEX_KEY))) return bytes
    }
    const infoDict = info instanceof PDFDict ? info : pdf.context.obj({})
    infoDict.set(name(ANNOT_INDEX_KEY), PDFHexString.fromText(JSON.stringify(index)))
    if (!(info instanceof PDFDict)) pdf.context.trailerInfo.Info = pdf.context.register(infoDict)
    return pdf.save()
  } catch {
    return bytes
  }
}
export async function writePdfAnnotations(
  bytes: Uint8Array,
  annots: Annot[],
  fontPath?: string
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false })
  if (pdf.isEncrypted) throw new Error('该 PDF 受保护，只能阅读')
  validateAnnots(annots, pdf.getPageCount())
  const context = pdf.context,
    info = context.lookup(context.trailerInfo.Info)
  if (info instanceof PDFDict) info.delete(name(ANNOT_INDEX_KEY))
  for (const page of pdf.getPages()) {
    const old = page.node.Annots()
    if (!old) continue
    for (let i = old.size() - 1; i >= 0; i--) {
      const dict = context.lookup(old.get(i))
      if (dict instanceof PDFDict && string(dict, 'NM').startsWith('yidu-')) old.remove(i)
    }
  }
  let latin: PDFFont | undefined, unicode: PDFFont | undefined
  for (const a of annots) {
    const page = pdf.getPage(a.page - 1),
      isNote = a.kind === 'note',
      rect = isNote ? [a.at[0], a.at[1] - 22, a.at[0] + 22, a.at[1]] : bounds(a.quads)
    const [x, y, x2, y2] = rect,
      w = x2 - x,
      h = y2 - y,
      c = isNote ? [253 / 255, 230 / 255, 138 / 255] : colorValue(a.color)
    const dict = context.obj({
      Type: 'Annot',
      Subtype: isNote ? 'Text' : a.kind === 'textColor' ? 'FreeText' : 'Highlight',
      Rect: rect,
      F: 4,
      P: page.ref,
      NM: PDFString.of((a.kind === 'background' ? 'yidu-bg-' : 'yidu-') + a.id),
      C: c,
      M: date(new Date().toISOString()),
      CreationDate: date(a.createdAt)
    })
    let operators = '',
      resources: PDFDict = context.obj({})
    if (a.kind === 'note') {
      dict.set(name('Name'), name('Comment'))
      dict.set(name('Contents'), PDFHexString.fromText(a.content))
      dict.set(name('T'), PDFHexString.fromText(a.author))
      operators =
        'q ' +
        c.join(' ') +
        ' rg 0 0 22 22 re f 0.57255 0.25098 0.0549 RG 1 w 5 6 m 17 6 l 17 17 l 5 17 l h S 7 10 m 15 10 l S 7 13 m 15 13 l S Q'
    } else {
      dict.set(name('QuadPoints'), context.obj(a.quads.flat()))
      if (a.kind === 'textColor') {
        let font: PDFFont
        if (/[^\x20-\x7e\r\n\t]/.test(a.text)) {
          if (!unicode) {
            pdf.registerFontkit(fontkit)
            const path = fontPath || join(__dirname, '../../resources/fonts/NotoSansSC-Regular.ttf')
            const fontBytes=await readFile(path),customName='YiduNotoSansSC400V1'
            const existing=pdf.context.enumerateIndirectObjects().find(([,obj])=>obj instanceof PDFDict&&obj.get(name('BaseFont'))?.toString()==='/'+customName)
            // Full TrueType embedding avoids fontkit CJK subset glyph loss in PDFium.
            // Reuse the complete embedded font on subsequent saves to avoid 6 MB growth per save.
            unicode=existing?PDFFont.of(existing[0],pdf,await CustomFontEmbedder.for(fontkit,fontBytes,customName)):await pdf.embedFont(fontBytes,{subset:false,customName})
          }
          font = unicode
        } else font = latin ??= await pdf.embedFont(StandardFonts.TimesRoman)
        dict.set(name('DA'), PDFString.of('/Helv ' + a.fontSize + ' Tf ' + c.join(' ') + ' rg'))
        dict.set(name('Contents'), PDFHexString.fromText(a.text))
        dict.set(name('Border'), context.obj([0, 0, 0]))
        resources = context.obj({ Font: { Helv: font.ref } })
        const chars = Array.from(a.text.replace(/\s+/g, ' ').trim())
        let offset = 0
        for (const [quadIndex,q] of a.quads.entries()) {
          const b = bounds([q]),
            width = b[2] - b[0],
            height = b[3] - b[1]
          let end = offset
          while (
            end < chars.length &&
            font.widthOfTextAtSize(chars.slice(offset, end + 1).join(''), a.fontSize) <= width + 1
          )
            end++
          if (end === offset && offset < chars.length) end++
          if(quadIndex===a.quads.length-1)end=chars.length
          const text = chars.slice(offset, end).join('')
          offset = end
          operators +=
            'q 1 1 1 rg ' +
            [b[0] - x, b[1] - y, width, height].join(' ') +
            ' re f ' +
            [b[0] - x, b[1] - y, width, height].join(' ') +
            ' re W n BT /Helv ' +
            a.fontSize +
            ' Tf '+Math.min(100,100*width/Math.max(1,font.widthOfTextAtSize(text,a.fontSize)))+' Tz ' +
            c.join(' ') +
            ' rg 1 0 0 1 ' +
            (b[0] - x) +
            ' ' +
            (b[1] - y + Math.max(0, (height - a.fontSize) / 2) + a.fontSize * 0.15) +
            ' Tm ' +
            font.encodeText(text).toString() +
            ' Tj ET Q\n'
        }
      } else {
        const opacity = a.kind === 'highlight' ? 0.55 : a.opacity
        dict.set(name('CA'), PDFNumber.of(opacity))
        resources = context.obj({
          ExtGState: { GS0: { Type: 'ExtGState', ca: opacity, CA: opacity, BM: 'Multiply' } }
        })
        for (const q of a.quads)
          operators +=
            'q /GS0 gs ' +
            c.join(' ') +
            ' rg ' +
            (q[0] - x) +
            ' ' +
            (q[1] - y) +
            ' m ' +
            (q[2] - x) +
            ' ' +
            (q[3] - y) +
            ' l ' +
            (q[6] - x) +
            ' ' +
            (q[7] - y) +
            ' l ' +
            (q[4] - x) +
            ' ' +
            (q[5] - y) +
            ' l h f Q\n'
      }
    }
    const appearance = context.register(
      context.flateStream(operators, {
        Type: 'XObject',
        Subtype: 'Form',
        BBox: [0, 0, w, h],
        Resources: resources
      })
    )
    dict.set(name('AP'), context.obj({ N: appearance }))
    const array = page.node.Annots() || context.obj([])
    array.push(context.register(dict))
    page.node.set(name('Annots'), array)
  }
  return pdf.save()
}

