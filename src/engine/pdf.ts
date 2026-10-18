import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

/** Extract selectable text from a PDF, client-side. Scanned-image PDFs will
 *  yield little — the UI warns about that path. */
export async function pdfToText(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: buf }).promise
  const chunks: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    chunks.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '))
  }
  await doc.destroy()
  return chunks.join('\n')
}
