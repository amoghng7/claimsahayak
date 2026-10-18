#!/usr/bin/env node
/**
 * generate-files.mjs
 *
 * Converts every *.md document in the sample/ scenario folders into a realistic
 * real-world file format (text-layer PDF or simulated scan JPEG/PNG) so the
 * ClaimSahayak demo exercises both the pdf.js pipeline and the OCR pipeline.
 *
 * Usage:
 *   node sample/generate-files.mjs
 *
 * Outputs are placed alongside the source .md files.  SCENARIO.md and README.md
 * are never converted.  Run this script again to regenerate (files are overwritten).
 *
 * Format map (same rule applied across every scenario folder):
 *
 *  01-policy-schedule          → PDF  (text layer)
 *  02-claim-form-*             → PDF  (text layer)
 *  03-discharge-summary        → JPEG (simulated phone-photo scan)
 *  04-itemised-final-bill      → PDF  (text layer)
 *  05-investigation-reports    → PNG  (simulated flatbed scan)
 *  06-prescriptions-*          → JPEG (simulated photo)
 *  06-pharmacy-bills (N1)      → JPEG
 *  07-pharmacy-bills           → JPEG
 *  07-kyc-pan-address (N1/N2)  → JPEG
 *  07-neft-mandate (N2)        → PDF
 *  08-kyc-pan-address          → JPEG
 *  08-cancelled-cheque-neft    → PDF
 *  09-cancelled-cheque-neft    → PDF
 *  09-repudiation-letter (N3)  → PDF
 *  10-fir-mlc (P2)             → PDF
 *  11-implant-sticker-invoice  → JPEG
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';
import { createCanvas } from '@napi-rs/canvas';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE_DIR = __dirname; // sample/ is the same dir as this script

// A4 at 72 dpi (pdfkit default unit: points; 1 pt = 1/72 inch)
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;

// A4 at 150 dpi for canvas-based images (good enough for OCR, keeps file sizes manageable)
const IMG_DPI = 150;
const IMG_W = Math.round(8.27 * IMG_DPI);  // 1240 px
const IMG_H = Math.round(11.69 * IMG_DPI); // 1754 px

// ---------------------------------------------------------------------------
// Markdown → plain-text conversion (minimal, no dependencies)
// ---------------------------------------------------------------------------

/** Strip Markdown formatting, return array of logical text lines. */
function mdToLines(md) {
  return md
    .split(/\r?\n/)
    .map(l => {
      // Remove horizontal rule
      if (/^[-*_]{3,}\s*$/.test(l)) return '─'.repeat(60);
      // Headings → uppercase with indent
      l = l.replace(/^#{1,6}\s+/, '');
      // Bold / italic
      l = l.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');
      l = l.replace(/_{1,3}([^_]+)_{1,3}/g, '$1');
      // Inline code
      l = l.replace(/`([^`]+)`/g, '$1');
      // Table separators (|----|)  → keep as thin rule
      if (/^\|[-: |]+\|$/.test(l.trim())) return '  ' + '·'.repeat(55);
      // Table rows → tab-join cells
      if (l.trim().startsWith('|')) {
        return l.replace(/^\s*\|/, '').replace(/\|\s*$/, '')
          .split('|').map(c => c.trim()).join('   ');
      }
      // Strip leading #/- list markers
      l = l.replace(/^[\s]*[-*+]\s+/, '  • ');
      l = l.replace(/^[\s]*\d+\.\s+/, (m) => '  ' + m.trim() + ' ');
      // Strip blockquote
      l = l.replace(/^>\s?/, '');
      return l;
    })
    // Remove the meta disclaimer line at top
    .filter(l => !l.includes('FICTIONAL SAMPLE DOCUMENT') || l.length < 5);
}

// ---------------------------------------------------------------------------
// PDF generator (text-layer, multi-page)
// ---------------------------------------------------------------------------

async function writePDF(mdPath, pdfPath) {
  const raw = readFileSync(mdPath, 'utf8');
  const lines = mdToLines(raw);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, autoFirstPage: true });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => {
      writeFileSync(pdfPath, Buffer.concat(chunks));
      resolve();
    });
    doc.on('error', reject);

    let y = MARGIN;
    const usableW = PAGE_W - MARGIN * 2;
    const lineH = 13;
    const headingLineH = 16;

    // Thin header bar
    doc.rect(0, 0, PAGE_W, 22).fill('#1a3a5c');
    doc.fontSize(7).fillColor('#ffffff')
      .text('FICTIONAL SAMPLE DOCUMENT — generated for ClaimSahayak testing — all names/numbers invented', MARGIN, 7, { width: usableW });
    y = 34;

    doc.fillColor('#111111');

    for (const line of lines) {
      if (line === '') {
        y += 6;
        continue;
      }

      const isHeading = /^[A-Z][A-Z .\-&,0-9]{4,}$/.test(line.trim()) ||
        line.trim().startsWith('## ') || line.trim().startsWith('# ');
      const cleanLine = line.replace(/^#+\s*/, '');

      const fontSize = isHeading ? 10 : 8.5;
      const lh = isHeading ? headingLineH : lineH;
      const bold = isHeading || line.trim().startsWith('BHARAT') || line.trim().startsWith('KAVERI');

      // Page break check (leave room for footer)
      if (y + lh > PAGE_H - 36) {
        // Footer on current page
        doc.fontSize(6).fillColor('#888888')
          .text('Page ' + doc.bufferedPageRange().count, MARGIN, PAGE_H - 24, { width: usableW, align: 'right' });
        doc.fillColor('#111111');
        doc.addPage();
        // Repeat thin header
        doc.rect(0, 0, PAGE_W, 22).fill('#1a3a5c');
        doc.fontSize(7).fillColor('#ffffff')
          .text('FICTIONAL SAMPLE DOCUMENT — generated for ClaimSahayak testing — all names/numbers invented', MARGIN, 7, { width: usableW });
        doc.fillColor('#111111');
        y = 34;
      }

      doc.fontSize(fontSize)
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(cleanLine, MARGIN, y, { width: usableW, lineBreak: false });

      // Measure actual rendered height (pdfkit exposes y after text)
      const after = doc.y;
      y = after + (lh - lineH); // nudge for extra heading gap
    }

    // Final page footer
    doc.fontSize(6).fillColor('#888888')
      .text('Page ' + doc.bufferedPageRange().count, MARGIN, PAGE_H - 24, { width: usableW, align: 'right' });

    doc.end();
  });
}

// ---------------------------------------------------------------------------
// Image generator (simulated scan — JPEG or PNG)
// ---------------------------------------------------------------------------

/** Render text to canvas with simulated scan effect */
function renderScanCanvas(lines, { rotation = 0.4, noise = true, yellowish = false } = {}) {
  const canvas = createCanvas(IMG_W, IMG_H);
  const ctx = canvas.getContext('2d');

  // Background: slightly off-white / warm paper tone
  const bgR = yellowish ? 252 : 248;
  const bgG = yellowish ? 248 : 248;
  const bgB = yellowish ? 230 : 248;
  ctx.fillStyle = `rgb(${bgR},${bgG},${bgB})`;
  ctx.fillRect(0, 0, IMG_W, IMG_H);

  // Mild noise overlay to simulate scan grain
  if (noise) {
    const imageData = ctx.getImageData(0, 0, IMG_W, IMG_H);
    const data = imageData.data;
    // Apply noise only every 8th pixel for speed
    for (let i = 0; i < data.length; i += 32) {
      const n = (Math.random() - 0.5) * 18;
      data[i]     = Math.max(0, Math.min(255, data[i] + n));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // Apply very slight rotation (simulate handheld camera tilt)
  ctx.save();
  ctx.translate(IMG_W / 2, IMG_H / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-IMG_W / 2, -IMG_H / 2);

  // Disclaimer banner at top
  ctx.fillStyle = '#1a3a5c';
  ctx.fillRect(0, 0, IMG_W, 28);
  ctx.fillStyle = '#ffffff';
  ctx.font = '13px sans-serif';
  ctx.fillText('FICTIONAL SAMPLE — ClaimSahayak testing — all names/numbers invented', 16, 19);

  // Text rendering
  const marginX = 60;
  const marginY = 50;
  const lineH = 22;
  const maxW = IMG_W - marginX * 2;

  let y = marginY;
  ctx.fillStyle = '#111111';

  for (const rawLine of lines) {
    if (y > IMG_H - 50) break; // clip to page

    if (rawLine === '') {
      y += 10;
      continue;
    }

    const isHeading = rawLine.trim().length > 3 && rawLine.trim() === rawLine.trim().toUpperCase()
      && !/^[|\-·•]/.test(rawLine.trim());
    const isBullet = rawLine.trim().startsWith('•');
    const isRule = rawLine.includes('─') || rawLine.includes('·'.repeat(10));

    const fontSize = isHeading ? 18 : isBullet ? 15 : 15;
    const fontWeight = isHeading ? 'bold' : 'normal';
    ctx.font = `${fontWeight} ${fontSize}px monospace`;

    if (isRule) {
      ctx.fillStyle = '#aaaaaa';
      ctx.fillText('─'.repeat(55), marginX, y);
      ctx.fillStyle = '#111111';
      y += lineH * 0.7;
      continue;
    }

    // Word-wrap long lines
    const words = rawLine.split(' ');
    let currentLine = '';
    for (const word of words) {
      const test = currentLine ? currentLine + ' ' + word : word;
      const metrics = ctx.measureText(test);
      if (metrics.width > maxW && currentLine) {
        ctx.fillText(currentLine, marginX + (isBullet ? 20 : 0), y);
        y += lineH;
        currentLine = word;
        if (y > IMG_H - 50) break;
      } else {
        currentLine = test;
      }
    }
    if (currentLine && y <= IMG_H - 50) {
      ctx.fillText(currentLine, marginX + (isBullet ? 20 : 0), y);
      y += lineH;
    }
  }

  ctx.restore();

  // Vignette: subtle darkening at corners to simulate lens falloff
  const grad = ctx.createRadialGradient(IMG_W / 2, IMG_H / 2, IMG_H * 0.35, IMG_W / 2, IMG_H / 2, IMG_H * 0.75);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, IMG_W, IMG_H);

  return canvas;
}

async function writeJPEG(mdPath, jpgPath) {
  const raw = readFileSync(mdPath, 'utf8');
  const lines = mdToLines(raw);
  // Prescriptions / KYC: yellowish paper; bills: white; discharge: slightly warm
  const yellowish = jpgPath.includes('kyc') || jpgPath.includes('prescr') || jpgPath.includes('pharmacy');
  const canvas = renderScanCanvas(lines, { rotation: 0.35, noise: true, yellowish });
  const buf = await canvas.encode('jpeg', 85);
  writeFileSync(jpgPath, buf);
}

async function writePNG(mdPath, pngPath) {
  const raw = readFileSync(mdPath, 'utf8');
  const lines = mdToLines(raw);
  // Lab reports: clean flatbed scan — very slight rotation, cooler
  const canvas = renderScanCanvas(lines, { rotation: 0.15, noise: true, yellowish: false });
  const buf = await canvas.encode('png');
  writeFileSync(pngPath, buf);
}

// ---------------------------------------------------------------------------
// Format routing table
//
// Keys are filename prefixes (first 2-3 chars of the number + partial keyword).
// Value: 'pdf' | 'jpeg' | 'png'
// ---------------------------------------------------------------------------

/**
 * Determine target format from filename stem.
 * Keyword matching takes priority so N1/N2 non-standard numbering is handled
 * correctly, then falls back to numeric prefix.
 */
function targetFormat(stem) {
  // ── Keyword-first rules (document type beats file number) ──────────────
  if (stem.includes('policy-schedule'))        return 'pdf';
  if (stem.includes('claim-form'))             return 'pdf';
  if (stem.includes('discharge-summary'))      return 'jpeg';
  if (stem.includes('itemised') ||
      stem.includes('final-bill'))             return 'pdf';
  if (stem.includes('investigation-reports'))  return 'png';
  if (stem.includes('prescriptions') ||
      stem.includes('admission-advice'))       return 'jpeg';
  if (stem.includes('pharmacy-bills'))         return 'jpeg';
  if (stem.includes('kyc'))                    return 'jpeg';
  if (stem.includes('neft') ||
      stem.includes('cheque') ||
      stem.includes('mandate'))                return 'pdf';
  if (stem.includes('repudiation'))            return 'pdf';
  if (stem.includes('fir') ||
      stem.includes('mlc'))                    return 'pdf';
  if (stem.includes('implant'))                return 'jpeg';

  // ── Numeric prefix fallback (for any unforeseen naming) ───────────────
  if (stem.startsWith('01-')) return 'pdf';
  if (stem.startsWith('02-')) return 'pdf';
  if (stem.startsWith('03-')) return 'jpeg';
  if (stem.startsWith('04-')) return 'pdf';
  if (stem.startsWith('05-')) return 'png';
  if (stem.startsWith('06-')) return 'jpeg';
  if (stem.startsWith('07-')) return 'jpeg';
  if (stem.startsWith('08-')) return 'jpeg';
  if (stem.startsWith('09-')) return 'pdf';
  if (stem.startsWith('10-')) return 'pdf';
  if (stem.startsWith('11-')) return 'jpeg';
  return 'pdf';
}

// ---------------------------------------------------------------------------
// Main — walk scenario folders
// ---------------------------------------------------------------------------

const scenarios = readdirSync(SAMPLE_DIR).filter(name => {
  const full = join(SAMPLE_DIR, name);
  return statSync(full).isDirectory() && !name.startsWith('.');
});

console.log(`\nClaimSahayak sample file generator`);
console.log(`Found ${scenarios.length} scenario folder(s): ${scenarios.join(', ')}\n`);

let total = 0;
let skipped = 0;

for (const scenario of scenarios) {
  const scenarioDir = join(SAMPLE_DIR, scenario);
  const mdFiles = readdirSync(scenarioDir).filter(f =>
    f.endsWith('.md') && f !== 'SCENARIO.md'
  );

  console.log(`[${scenario}]`);

  for (const mdFile of mdFiles) {
    const mdPath = join(scenarioDir, mdFile);
    const stem = mdFile.replace(/\.md$/, '');
    const fmt = targetFormat(stem);
    const ext = fmt === 'jpeg' ? 'jpg' : fmt;
    const outPath = join(scenarioDir, stem + '.' + ext);

    process.stdout.write(`  ${mdFile.padEnd(45)} → .${ext.padEnd(4)}  `);

    try {
      if (fmt === 'pdf') {
        await writePDF(mdPath, outPath);
      } else if (fmt === 'jpeg') {
        await writeJPEG(mdPath, outPath);
      } else {
        await writePNG(mdPath, outPath);
      }
      console.log('✓');
      total++;
    } catch (err) {
      console.log(`✗  (${err.message})`);
      skipped++;
    }
  }
  console.log('');
}

console.log(`Done. Generated ${total} file(s), ${skipped} error(s).`);
