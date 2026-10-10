import { pdfToText } from './pdf'

/**
 * OCR fallback for image-based documents (Phase 06 step 6.2). The browser has
 * no OCR; the sidecar's /api/ocr route runs Cloud Document AI. Documents still
 * never leave the user's control — they travel the same same-origin proxy path
 * as extraction text, and only when the local text layer is empty (or the file
 * is a photo). Returned text feeds the SAME Gemini extraction schema as a
 * digital PDF; no money math happens here or in the model.
 */

const MIN_TEXT_LAYER = 40 // below this the "text layer" is noise, not content

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
  return { label: file.name, text: text.slice(0, 30_000), ocr }
}
