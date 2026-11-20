/**
 * Client-side PDF generator for Form Fill using pdf-lib.
 * - Image-based forms: embeds each scanned page image full-bleed and draws blue text,
 *   charGrid cells, and checkmarks at exact box coordinates.
 * - Fillable PDF (AcroForm): fills matching AcroForm text/checkbox fields directly.
 * - Signature and photo boxes are NEVER filled.
 */

import { PDFDocument, StandardFonts, rgb, PDFTextField, PDFCheckBox } from 'pdf-lib'
import {
  NEVER_FILL_TYPES,
  boxToPdfRect,
  formatDateForForm,
  splitCharGrid,
} from './formMath.js'

// Signature blue ink (#2B4DB0) matching FormFill.dc.html
const INK_BLUE = rgb(43 / 255, 77 / 255, 176 / 255)
const TARGET_PAGE_WIDTH = 595.28 // A4 width in PDF points

function decodeDataUrl(input) {
  if (input instanceof Uint8Array) {
    const isPng = input.length > 4 && input[0] === 0x89 && input[1] === 0x50
    return { bytes: input, mime: isPng ? 'image/png' : 'image/jpeg' }
  }
  const s = String(input || '').trim()
  let mime = 'image/jpeg'
  let b64 = s
  const m = s.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s)
  if (m) {
    mime = m[1].toLowerCase()
    b64 = m[2]
  }
  let bytes
  if (typeof Buffer !== 'undefined') {
    bytes = new Uint8Array(Buffer.from(b64, 'base64'))
  } else {
    const bin = atob(b64)
    bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  }
  return { bytes, mime }
}

/**
 * Strip characters not encodable in WinAnsi (standard PDF Helvetica font) so pdf-lib never throws.
 */
function toWinAnsiSafe(text) {
  return String(text ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
    .trim()
}

function isCheckedValue(val) {
  const s = String(val ?? '').trim().toLowerCase()
  return s === 'true' || s === 'yes' || s === '1' || s === 'checked' || s === '✓' || s === 'x'
}

function drawCheckmark(page, rect) {
  const size = Math.min(rect.width, rect.height) * 0.65
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  const x1 = cx - size * 0.42
  const y1 = cy + size * 0.02
  const x2 = cx - size * 0.1
  const y2 = cy - size * 0.32
  const x3 = cx + size * 0.44
  const y3 = cy + size * 0.36
  const thickness = Math.max(1.2, Math.min(2.5, size * 0.14))

  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color: INK_BLUE })
  page.drawLine({ start: { x: x2, y: y2 }, end: { x: x3, y: y3 }, thickness, color: INK_BLUE })
}

/**
 * Draw fields onto an already-created PDFDocument page.
 */
function drawFieldOnPage(page, font, field, rawValue, pageWidth, pageHeight) {
  if (!field || NEVER_FILL_TYPES.has(field.type)) return
  if (rawValue === undefined || rawValue === null) return

  const rect = boxToPdfRect(field.box, pageWidth, pageHeight)

  if (field.type === 'checkbox') {
    if (isCheckedValue(rawValue)) {
      drawCheckmark(page, rect)
    }
    return
  }

  let text = String(rawValue).trim()
  if (!text) return
  if (field.type === 'date' && field.dateFormat) {
    text = formatDateForForm(text, field.dateFormat)
  }

  const safeText = toWinAnsiSafe(text)
  if (!safeText) return

  if (field.type === 'charGrid' && field.cells && field.cells > 0) {
    const chars = splitCharGrid(safeText, field.cells)
    const cellW = rect.width / chars.length
    const fontSize = Math.max(7, Math.min(rect.fontSize, cellW * 0.72))
    const textY = rect.y + Math.max(1.5, (rect.height - fontSize * 0.72) / 2)
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i]
      if (!ch) continue
      const glyphW = font.widthOfTextAtSize(ch, fontSize)
      const cx = rect.x + i * cellW + Math.max(0, (cellW - glyphW) / 2)
      page.drawText(ch, {
        x: cx,
        y: textY,
        size: fontSize,
        font,
        color: INK_BLUE,
      })
    }
    return
  }

  // Fit font size so text stays inside the box width
  let fontSize = rect.fontSize
  const maxWidth = Math.max(12, rect.width - 6)
  let measured = font.widthOfTextAtSize(safeText, fontSize)
  while (measured > maxWidth && fontSize > 6.5) {
    fontSize = Math.max(6.5, fontSize - 0.5)
    measured = font.widthOfTextAtSize(safeText, fontSize)
  }

  page.drawText(safeText, {
    x: rect.textX,
    y: rect.baselineY,
    size: fontSize,
    font,
    color: INK_BLUE,
  })
}

/**
 * Build a PDF from scanned form page images + field values.
 */
export async function buildFilledImagePdf({ pageImages, fields, values, formTitle }) {
  const pdfDoc = await PDFDocument.create()
  pdfDoc.setTitle(String(formTitle || 'Filled Form'))
  pdfDoc.setCreator('Sarvam')
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)

  const pages = []
  for (let p = 0; p < (pageImages || []).length; p++) {
    const { bytes, mime } = decodeDataUrl(pageImages[p])
    const img = mime === 'image/png' ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes)
    const aspect = img.height > 0 && img.width > 0 ? img.height / img.width : 1.414
    const pageWidth = TARGET_PAGE_WIDTH
    const pageHeight = Math.round(TARGET_PAGE_WIDTH * aspect * 100) / 100
    const page = pdfDoc.addPage([pageWidth, pageHeight])
    page.drawImage(img, { x: 0, y: 0, width: pageWidth, height: pageHeight })
    pages.push({ page, width: pageWidth, height: pageHeight })
  }

  if (pages.length === 0) {
    const page = pdfDoc.addPage([TARGET_PAGE_WIDTH, 841.89])
    pages.push({ page, width: TARGET_PAGE_WIDTH, height: 841.89 })
  }

  for (const field of fields || []) {
    if (!field || NEVER_FILL_TYPES.has(field.type)) continue
    const val = values?.[field.id]
    if (val === undefined || val === null || String(val).trim() === '') continue
    const pageIdx = Math.max(0, Math.min(pages.length - 1, Number(field.page) || 0))
    const target = pages[pageIdx]
    drawFieldOnPage(target.page, font, field, val, target.width, target.height)
  }

  return pdfDoc.save()
}

function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Fill an existing fillable AcroForm PDF when the source input is a fillable PDF.
 * Never fills signature/photo fields.
 */
export async function fillAcroFormPdf({ pdfBytes, fields, values }) {
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const form = pdfDoc.getForm()
  const acroFields = form.getFields()

  if (!acroFields || acroFields.length === 0) {
    return { bytes: await pdfDoc.save(), filledCount: 0, isAcroForm: false }
  }

  const byNormName = new Map()
  for (const af of acroFields) {
    byNormName.set(normKey(af.getName()), af)
  }

  let filledCount = 0
  for (const field of fields || []) {
    if (!field || NEVER_FILL_TYPES.has(field.type)) continue
    const raw = values?.[field.id]
    if (raw === undefined || raw === null || String(raw).trim() === '') continue

    const candidates = [field.id, field.profileKey, field.label]
      .filter(Boolean)
      .map(normKey)

    let matched = null
    for (const c of candidates) {
      if (byNormName.has(c)) {
        matched = byNormName.get(c)
        break
      }
    }
    if (!matched) continue

    const nameLower = matched.getName().toLowerCase()
    if (nameLower.includes('sign') || nameLower.includes('photo')) continue

    if (matched instanceof PDFCheckBox) {
      if (isCheckedValue(raw)) {
        matched.check()
        filledCount++
      } else {
        matched.uncheck()
      }
    } else if (matched instanceof PDFTextField) {
      let text = String(raw).trim()
      if (field.type === 'date' && field.dateFormat) {
        text = formatDateForForm(text, field.dateFormat)
      }
      matched.setText(toWinAnsiSafe(text))
      filledCount++
    }
  }

  return { bytes: await pdfDoc.save(), filledCount, isAcroForm: true }
}

/**
 * Unified PDF export: uses AcroForm fill when sourcePdfBytes is a fillable PDF,
 * otherwise renders scanned page images with drawn blue field values.
 */
export async function buildFormPdf({ pageImages, sourcePdfBytes, fields, values, formTitle }) {
  if (sourcePdfBytes && sourcePdfBytes.length > 0) {
    try {
      const acro = await fillAcroFormPdf({ pdfBytes: sourcePdfBytes, fields, values })
      if (acro.isAcroForm) {
        return acro.bytes
      }
    } catch {
      // Fall through to image-overlay PDF
    }
  }
  return buildFilledImagePdf({ pageImages, fields, values, formTitle })
}
