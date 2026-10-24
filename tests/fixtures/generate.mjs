import { PDFDocument, StandardFonts, rgb, PDFName, PDFHexString } from 'pdf-lib'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const root = dirname(fileURLToPath(import.meta.url))
async function make(name, count, columns = 1, scan = false, annotated = false) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.TimesRoman)
  doc.setTitle('Original timing-analysis test paper'); doc.setAuthor('Yidu test fixtures (CC0)')
  for (let i = 0; i < count; i++) {
    const page = doc.addPage([612, 792])
    if (scan) { page.drawRectangle({ x: 55, y: 680, width: 500, height: 35, color: rgb(.8, .8, .8) }); continue }
    page.drawText('Timing Analysis - Page ' + (i + 1), { x: 54, y: 738, size: 18, font })
    for (let col = 0; col < columns; col++) for (let row = 0; row < 36; row++) {
      const text = columns === 1
        ? (row % 2 ? 'As shown in Fig. 3, the delay drops. It then rises.' : 'Static timing analysis verifies circuit delays under process variation.')
        : (row % 2 ? 'The slack is 0.5 ns. Next, we ...' : 'Smith et al. proposed a method.')
      page.drawText(text, { x: 54 + col * 260, y: 695 - row * 17, size: columns === 1 ? 12 : 10, font })
    }
    page.drawText(String(i + 1), { x: 300, y: 30, size: 10, font })
    if (annotated && i === 0) {
      const annot = doc.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [550, 690, 575, 715],
        Contents: PDFHexString.fromText('其他软件的中文注释'), T: PDFHexString.fromText('测试'),
        NM: PDFHexString.fromText('external-note'), Name: 'Comment', C: [1, .9, .5], F: 4 })
      page.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(annot)]))
    }
  }
  await writeFile(join(root, name), await doc.save())
}
await make('single-column.pdf', 4)
await make('double-column.pdf', 4, 2)
await make('paper-100.pdf', 100)
await make('large-320.pdf', 320)
await make('scanned.pdf', 2, 1, true)
await make('external-annotations.pdf', 2, 1, false, true)
await writeFile(join(root, 'corrupt.pdf'), 'This is intentionally not a PDF.')

