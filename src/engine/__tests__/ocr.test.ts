import { describe, expect, it } from 'vitest'
import { fileToDocTextSmart, ocrFile } from '../ocr'

function makeFile(name: string, type: string, content: string): File {
  return new File([content], name, { type })
}

function ocrResponse(text: string) {
  return { ok: true, status: 200, json: async () => ({ text }) } as Response
}

describe('ocrFile', () => {
  it('POSTs the file as base64 to /api/ocr and returns the text', async () => {
    const calls: { url: string; body: { content: string; mimeType: string } }[] = []
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return ocrResponse('HOSPITAL BILL Total 435000')
    }
    const text = await ocrFile(makeFile('bill.pdf', 'application/pdf', 'fake-pdf-bytes'), fetchImpl as typeof fetch)
    expect(text).toBe('HOSPITAL BILL Total 435000')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('/api/ocr')
    expect(calls[0].body.mimeType).toBe('application/pdf')
    // base64 round-trips to the original bytes
    expect(atob(calls[0].body.content)).toBe('fake-pdf-bytes')
  })

  it('throws a readable error when the server answers non-200', async () => {
    const fetchImpl = async () =>
      ({ ok: false, status: 502, json: async () => ({ error: 'upstream_unavailable', message: 'The OCR service is unavailable right now.' }) }) as Response
    await expect(
      ocrFile(makeFile('bill.pdf', 'application/pdf', 'x'), fetchImpl as typeof fetch),
    ).rejects.toThrow(/unavailable/)
  })
})

describe('fileToDocTextSmart', () => {
  const deps = {
    extractPdfText: async () => 'SELECTABLE TEXT LAYER with plenty of content here',
    ocr: async () => 'OCR TEXT from the scanned page',
  }

  it('uses the PDF text layer when one exists — OCR is not called', async () => {
    let ocrCalled = false
    const d = await fileToDocTextSmart(makeFile('policy.pdf', 'application/pdf', 'bytes'), {
      ...deps,
      ocr: async (f) => { ocrCalled = true; return deps.ocr(f) },
    })
    expect(d.text).toContain('SELECTABLE TEXT LAYER')
    expect(d.ocr).toBe(false)
    expect(ocrCalled).toBe(false)
  })

  it('falls back to OCR when the PDF text layer is empty', async () => {
    const d = await fileToDocTextSmart(makeFile('scan.pdf', 'application/pdf', 'bytes'), {
      ...deps,
      extractPdfText: async () => '   \n  ',
    })
    expect(d.text).toBe('OCR TEXT from the scanned page')
    expect(d.ocr).toBe(true)
  })

  it('sends image files straight to OCR (phone-photo bill)', async () => {
    const d = await fileToDocTextSmart(makeFile('photo.jpg', 'image/jpeg', 'jpeg-bytes'), deps)
    expect(d.text).toBe('OCR TEXT from the scanned page')
    expect(d.ocr).toBe(true)
  })

  it('reads plain text files directly — no PDF, no OCR', async () => {
    const d = await fileToDocTextSmart(makeFile('bill.txt', 'text/plain', 'plain text export with enough length to pass'), deps)
    expect(d.text).toContain('plain text export')
    expect(d.ocr).toBe(false)
  })

  it('truncates to 30,000 chars like the local path', async () => {
    const d = await fileToDocTextSmart(makeFile('big.txt', 'text/plain', 'x'.repeat(31_000)), deps)
    expect(d.text).toHaveLength(30_000)
  })
})
