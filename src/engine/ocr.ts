import { pdfToText } from './pdf'

/** OCR fallback when the text layer is empty or the file is a photo. Same-origin /api/ocr
 * runs Document AI; that text then uses the same extraction schema. No money math here. */

export const MIN_TEXT_LAYER = 40 // below this the text layer is noise, not content
const DOC_TEXT_CAP = 30_000
// Keep in sync with OCR_TEXT_CAP + its marker in server/index.js: while both
// caps stay 30,000 the client slice strips the server's marker whole and
// appends its own, so the model sees exactly one truncation note.
export const TRUNCATION_NOTE =
  '\n\n[NOTE: document truncated at 30,000 characters — the remaining text was not analysed.]'

/** Cap + a visible marker, so the model knows it did not see the whole document. */
function capText(text: string): string {
  return text.length > DOC_TEXT_CAP ? text.slice(0, DOC_TEXT_CAP) + TRUNCATION_NOTE : text
}

async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

export interface DocTextSmart {
  label: string
  text: string
  /** true when the text came from OCR rather than a local read */
  ocr: boolean
}

export async function ocrFile(file: File, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl('/api/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: await fileToBase64(file), mimeType: file.type || 'application/pdf' }),
  })
  const data = (await res.json().catch(() => ({}))) as { text?: string; message?: string; error?: string }
  if (!res.ok) throw new Error(data.message ?? data.error ?? `OCR failed (HTTP ${res.status})`)
  return data.text ?? ''
}

export interface SmartDeps {
  extractPdfText: (file: File) => Promise<string>
  ocr: (file: File) => Promise<string>
}

const defaultDeps: SmartDeps = { extractPdfText: pdfToText, ocr: ocrFile }

export async function fileToDocTextSmart(file: File, deps: SmartDeps = defaultDeps): Promise<DocTextSmart> {
  const name = file.name.toLowerCase()
  const isPdf = file.type === 'application/pdf' || name.endsWith('.pdf')
  const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|heic)$/.test(name)

  let text: string
  let ocr = false
  if (isImage) {
    text = await deps.ocr(file)
    ocr = true
  } else if (isPdf) {
    text = await deps.extractPdfText(file)
    if (text.trim().length < MIN_TEXT_LAYER) {
      text = await deps.ocr(file)
      ocr = true
    }
  } else {
    text = await file.text()
  }
  return { label: file.name, text: capText(text), ocr }
}

export interface DocFailure {
  label: string
  message: string
}

/** Batch read with per-file fault isolation: one unreadable scan must not
 * discard the rest of the batch. Failures are reported by name so the caller
 * can say which file was skipped. */
export async function filesToDocTextsSmart(
  files: File[],
  deps: SmartDeps = defaultDeps,
): Promise<{ docs: DocTextSmart[]; failures: DocFailure[] }> {
  const docs: DocTextSmart[] = []
  const failures: DocFailure[] = []
  for (const file of files) {
    try {
      docs.push(await fileToDocTextSmart(file, deps))
    } catch (err) {
      failures.push({ label: file.name, message: err instanceof Error ? err.message : String(err) })
    }
  }
  return { docs, failures }
}
