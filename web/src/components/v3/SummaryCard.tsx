import { useState } from 'react'
import type { ExplainResponse, GlanceKeyValue, Part, Section } from '../../types'
import { getLocalisedDocType } from '../../i18n'
import { amountDue, isMoneyValue, pickGlance, visualForDocument, type GlanceKind } from '../../design/catalog'
import { assessLabValue, countOutside, titleCaseHeading, type LabAssessment } from '../../documents/labFlag'
import { DocIcon } from '../../ui/icons'
import { formatAmountValue } from '../../utils/currency'

function amountNumber(value: string): number | null {
  const n = Number(value.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86400000)
}

function formatChipDate(iso: string | null | undefined, lang: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  try {
    return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
  } catch {
    return iso
  }
}

function flagWords(label: string, t: Record<string, string>): string {
  if (label === 'High') return t.flagHigh || 'High'
  if (label === 'Low') return t.flagLow || 'Low'
  if (label === 'In range') return t.flagInRange || 'In range'
  if (label === 'Above range') return t.aboveRange || 'Above range'
  if (label === 'Below range') return t.belowRange || 'Below range'
  return label
}

function flagClass(label: string): string {
  if (/high|above|toxic/i.test(label)) return 'bg-[#D9603B]'
  if (/low|below|deficien/i.test(label)) return 'bg-[#F8D9CB]'
  if (/insufficien|borderline/i.test(label)) return 'bg-[#FBEBC4]'
  return 'bg-[#CFE5E0]'
}

function FlagChips({ status, t }: { status: LabAssessment | null; t: Record<string, string> }) {
  if (!status?.label) return null
  return (
    <span className="flex flex-wrap gap-1">
      <span className={`self-start text-[12px] font-bold px-2 py-0.5 rounded-full border-[1.5px] border-[#1A1A1A] ${flagClass(status.label)}`}>
        {flagWords(status.label, t)}
      </span>
      {status.calculated && (
        <span className="self-start text-[12px] font-bold px-2 py-0.5 rounded-full border-[1.5px] border-[#1A1A1A] bg-[#F4F5F2]">
          {t.calculated || 'Calculated'}
        </span>
      )}
    </span>
  )
}

function ClampText({ text, className }: { text: string; className: string }) {
  const [open, setOpen] = useState(false)
  return (
    <button
      type="button"
      onClick={() => setOpen((value) => !value)}
      className={`${className} ${open ? '' : 'line-clamp-3'} text-left break-words [overflow-wrap:anywhere]`}
    >
      {text}
    </button>
  )
}

function Tick({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 self-start text-[13px] font-semibold">
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="#034F46" />
        <path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#F4F5F2" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </span>
  )
}

function DateTile({ iso }: { iso: string }) {
  const d = new Date(iso)
  const month = Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en', { month: 'short' }).toUpperCase()
  const day = Number.isNaN(d.getTime()) ? iso : String(d.getDate())
  const year = Number.isNaN(d.getTime()) ? '' : String(d.getFullYear())
  return (
    <div className="w-[92px] shrink-0 rounded-[22px] border-[1.5px] border-[#1A1A1A] bg-[#1A1A1A] text-[#F4F5F2] flex flex-col items-center py-3">
      <span className="text-[12px] font-bold tracking-[1px]">{month}</span>
      <span className="sv-display text-[48px] leading-none tabular-nums">{day}</span>
      <span className="text-[13px] font-semibold text-[#D3D7D2]">{year}</span>
    </div>
  )
}

export default function SummaryCard({
  result,
  t,
  lang,
  hasDocumentPreview,
  onOpenDocumentPreview,
  layout,
}: {
  result: ExplainResponse
  t: Record<string, string>
  lang: string
  hasDocumentPreview?: boolean
  onOpenDocumentPreview?: () => void
  layout?: GlanceKind
}) {
  const kind = layout || pickGlance(result)
  const docType = result.document_kind || result.doc_type || (result.document_type as string) || 'other'
  const partCount = result.parts?.length || 0
  const visual = visualForDocument(docType, {
    medicines: (result.medicines?.length || 0) > 0 || docType === 'prescription',
    title: result.title,
    multi: kind === 'multi' || partCount > 1,
  })
  const typeLabel = partCount > 1
    ? (t.nDocuments || '{n} documents').replace('{n}', String(partCount))
    : (getLocalisedDocType(lang, docType) || docType)
  const dateLabel = formatChipDate(result.report_date_iso || result.letter_date, lang)
  const outsideCount = countOutside([...(result.sections || []), ...(result.parts || []).flatMap((part) => part.sections || [])])
  const headline = outsideCount > 0
    ? (t.valuesOutside || '{n} values are outside the printed range').replace('{n}', String(outsideCount))
    : (result.glance?.headline || result.title)
  const paid = paidAmounts(result)
  const kvs = result.glance?.key_values || []
  const amounts = kvs.filter((k) => isMoneyValue(k.kind, k.value))
  const allMatched = kvs.length > 0 && kvs.every((k) => k.evidence === 'matched')

  return (
    <section id="sv-summary" className="sv-card-in border-[1.5px] border-[#1A1A1A] rounded-[32px] p-5 flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 h-8 pl-[5px] pr-3 rounded-full border-[1.5px] border-[#1A1A1A] text-[13px] font-bold" style={{ background: visual.bg, color: visual.ink }}>
          <span className="w-[22px] h-[22px] rounded-full bg-[#1A1A1A] flex items-center justify-center">
            <DocIcon name={visual.icon} size={12} stroke={visual.bg === '#1A1A1A' ? '#F4F5F2' : visual.bg} />
          </span>
          {typeLabel}
        </span>
        {dateLabel && (
          <span className="inline-flex items-center h-8 px-3 rounded-full border-[1.5px] border-[#1A1A1A] text-[13px] font-semibold">
            {dateLabel}
          </span>
        )}
        {hasDocumentPreview && onOpenDocumentPreview && (
          <button type="button" onClick={onOpenDocumentPreview} className="sv-press inline-flex items-center gap-1.5 h-8 px-3 rounded-full border-[1.5px] border-[#1A1A1A] bg-transparent text-[13px] font-semibold">
            {t.viewDocument || 'View document'}
          </button>
        )}
      </div>
      <h1 className={`m-0 text-[34px] leading-[1.05] tracking-[-0.4px] ${lang !== 'en' ? 'sv-indic text-[26px] font-semibold' : 'sv-display'}`}>
        {headline}
      </h1>
      {paid.length > 0 && kind !== 'B' && (
        <div className="rounded-[24px] bg-[#CFE5E0] border-[1.5px] border-[#1A1A1A] p-4 flex flex-col gap-1">
          <span className="text-[12px] font-bold tracking-[1.2px]">{t.amountPaid || 'PAID'}</span>
          {paid.map((item) => (
            <span key={item.label + item.value} className="sv-display text-[32px] leading-none tabular-nums">{formatAmountValue(item.value)}</span>
          ))}
        </div>
      )}
      {kind === 'A' && <SplitAmounts amounts={amounts} t={t} allMatched={allMatched} />}
      {kind === 'B' && <AmountToPay result={result} amounts={amounts} t={t} lang={lang} />}
      {kind === 'C' && <Deadline result={result} t={t} lang={lang} />}
      {kind === 'D' && !(result.sections && result.sections.length) && <ValueTiles result={result} kvs={kvs} t={t} allMatched={allMatched} />}
      {kind === 'F' && <AmountStrip amounts={amounts} t={t} allMatched={allMatched} />}
      {kind === 'multi' && <span className="text-[13px] font-semibold text-[#575B58]">{(result.parts || []).length} {t.documentsInUpload || 'documents in this upload'}</span>}
    </section>
  )
}

function SplitAmounts({
  amounts,
  t,
  allMatched,
}: {
  amounts: GlanceKeyValue[]
  t: Record<string, string>
  allMatched: boolean
}) {
  const parsed = amounts
    .map((a) => ({ ...a, n: amountNumber(a.value) || 0 }))
    .sort((a, b) => b.n - a.n)
  const total = parsed[0]
  const parts = parsed.slice(1).sort((a, b) => b.n - a.n)
  const approved = parts[0]
  const cut = parts[1]
  const pct = total && approved ? Math.round((approved.n / total.n) * 100) : 0
  const cutPct = 100 - pct
  return (
    <div className="flex flex-col gap-3">
      <div role="img" aria-label={`${pct} percent ${approved?.label || ''}, ${cutPct} percent ${cut?.label || ''}`} className="flex h-12 box-border border-[1.5px] border-[#1A1A1A] rounded-full overflow-hidden">
        <span className="sv-grow bg-[#034F46] text-[#F4F5F2] flex items-center pl-4 text-[14px] font-bold border-r-[1.5px] border-[#1A1A1A]" style={{ width: `${pct}%` }}>
          {pct}% {approved?.label}
        </span>
        <span className="flex-1 bg-[#D9603B] flex items-center justify-center text-[14px] font-bold" style={{ backgroundImage: 'repeating-linear-gradient(135deg, rgba(26,26,26,.12) 0 6px, transparent 6px 12px)' }}>
          {cutPct}% {cut?.label}
        </span>
      </div>
      <div className="grid grid-cols-3 border-[1.5px] border-[#1A1A1A] rounded-[24px] overflow-hidden">
        {amounts.map((s, i) => (
          <div key={s.label + i} className={`flex flex-col gap-1.5 p-3 min-w-0 ${i > 0 ? 'border-l-[1.5px] border-[#1A1A1A]' : ''}`}>
            <span className="text-[12px] font-semibold text-[#3B3E3C] leading-tight">{s.label}</span>
            <span className="sv-display text-[20px] leading-[1.1] tabular-nums break-words">{formatAmountValue(s.value)}</span>
          </div>
        ))}
      </div>
      {allMatched && <Tick label={t.allAmountsFound || 'All amounts found in your document'} />}
    </div>
  )
}

function AmountToPay({
  result,
  amounts,
  t,
  lang,
}: {
  result: ExplainResponse
  amounts: GlanceKeyValue[]
  t: Record<string, string>
  lang: string
}) {
  const payable = amountDue(result)
  const dueIso = payable.due || result.actions?.find((a) => a.due_date)?.due_date
  const left = daysUntil(dueIso)
  const date = dueIso ? formatChipDate(dueIso, lang) : null
  const figure = formatAmountValue(payable.value || amounts[0]?.value || '')
  return (
    <div className="flex gap-3">
      <div className="flex-1 min-w-0 rounded-[24px] bg-[#F8D9CB] border-[1.5px] border-[#1A1A1A] p-4 flex flex-col gap-1">
        <span className="text-[12px] font-bold tracking-[1.2px]">{t.toPay || 'TO PAY'}</span>
        <span className="sv-display text-[44px] leading-none tabular-nums">{figure}</span>
        {date && (
          <span className="text-[14px] font-semibold">
            {(t.byDate || 'by {date}').replace('{date}', date)}
            {left != null && left >= 0 ? ` · ${(t.daysLeft || '{n} days left').replace('{n}', String(left))}` : ''}
          </span>
        )}
      </div>
      {dueIso && <DateTile iso={dueIso} />}
    </div>
  )
}

function Deadline({ result, t, lang }: { result: ExplainResponse; t: Record<string, string>; lang: string }) {
  const due = result.actions?.find((a) => a.due_date)
  if (!due?.due_date) return null
  const left = daysUntil(due.due_date)
  const passed = due.date_status === 'passed' || (left != null && left < 0)
  if (passed) {
    return <span className="self-start inline-flex h-8 items-center px-3 rounded-full bg-[#1A1A1A] text-[#F4F5F2] text-[13px] font-bold">{t.datePassed || 'Date has passed'}</span>
  }
  return (
    <div className="flex gap-3">
      <DateTile iso={due.due_date} />
      <div className="flex-1 rounded-[24px] bg-[#F8D9CB] border-[1.5px] border-[#1A1A1A] p-4 flex flex-col gap-2 justify-center">
        <span className="text-[14px] font-semibold">{formatChipDate(due.due_date, lang)}</span>
        <span className="sv-display text-[28px] leading-none">{(t.daysLeft || '{n} days left').replace('{n}', String(left ?? ''))}</span>
        <span className="h-1.5 rounded-full bg-[#1A1A1A]/15 overflow-hidden">
          <span className="block h-full bg-[#D9603B]" style={{ width: `${Math.max(8, Math.min(100, ((left ?? 0) / 30) * 100))}%` }} />
        </span>
      </div>
    </div>
  )
}

function paidAmounts(result: ExplainResponse): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = []
  const take = (items?: GlanceKeyValue[]) => {
    for (const item of items || []) {
      if (!isMoneyValue(item.kind, item.value) || !/paid|received/i.test(item.label || '')) continue
      if (rows.some((row) => row.value === item.value)) continue
      rows.push({ label: item.label, value: item.value })
    }
  }
  take(result.glance?.key_values)
  for (const part of result.parts || []) take(part.glance?.key_values)
  return rows
}

function ValueTiles({
  result,
  kvs,
  t,
  allMatched,
}: {
  result: ExplainResponse
  kvs: GlanceKeyValue[]
  t: Record<string, string>
  allMatched: boolean
}) {
  const sectionValues = (result.sections || []).flatMap((s) => s.values || [])
  if (sectionValues.length > 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2.5">
          {sectionValues.slice(0, 4).map((v, i) => (
            <LabTile key={v.label + i} label={v.label} value={v.value} unit={v.unit} range={v.ref_range || v.range} printed={v.flag_printed} printedName={v.label_printed} t={t} />
          ))}
        </div>
        {allMatched && <Tick label={t.allValuesFound || 'All values found in your document'} />}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {kvs.slice(0, 4).map((kv, i) => (
        <div key={kv.label + i} className={`rounded-[22px] border-[1.5px] border-[#1A1A1A] p-3.5 flex flex-col gap-1 ${kv.kind === 'date' ? 'bg-[#CFE5E0]' : ''}`}>
          <span className="text-[12px] font-semibold text-[#575B58]">{kv.label}</span>
          <span className="sv-display text-[28px] leading-none">{kv.kind === 'amount' ? formatAmountValue(kv.value) : kv.value}</span>
        </div>
      ))}
    </div>
  )
}

function LabTile({
  label,
  value,
  unit,
  range,
  printed,
  printedName,
  t,
}: {
  label: string
  value: string
  unit?: string
  range?: string
  printed?: string | null
  printedName?: string
  t: Record<string, string>
}) {
  const status = assessLabValue(value, range, printed)
  return (
    <div className={`min-w-0 overflow-hidden rounded-[22px] border-[1.5px] border-[#1A1A1A] p-3 flex flex-col gap-1 ${status?.outside ? 'bg-[#F8D9CB]' : ''}`}>
      <ClampText text={label} className="text-[12px] font-semibold leading-snug text-[#575B58]" />
      {printedName && printedName !== label && (
        <span className="text-[11px] leading-snug text-[#575B58] break-words [overflow-wrap:anywhere]">{printedName}</span>
      )}
      <span className="sv-display text-[26px] leading-none break-words [overflow-wrap:anywhere]">{value}</span>
      {unit && <span className="text-[12px] font-semibold leading-snug break-words [overflow-wrap:anywhere]">{unit}</span>}
      {range && <span className="text-[12px] leading-snug text-[#575B58] break-words [overflow-wrap:anywhere]">{range}</span>}
      <FlagChips status={status} t={t} />
    </div>
  )
}

function rowStatus(value: { value?: string | null; ref_range?: string | null; range?: string | null; flag_printed?: string | null }) {
  return assessLabValue(value.value || '', value.ref_range || value.range, value.flag_printed)
}

export function LabValues({ result, t }: { result: ExplainResponse; t: Record<string, string> }) {
  const sections = result.sections || []
  const count = sections.reduce((n, s) => n + (s.values?.length || 0), 0)
  if (count > 4) return <SectionedValues sections={sections} t={t} />
  return <ValueTiles result={result} kvs={[]} t={t} allMatched={sections.every((s) => s.values.every((v) => v.evidence === 'matched'))} />
}

export function SectionedValues({ sections, t }: { sections: Section[]; t: Record<string, string> }) {
  const ordered = sections
  const flagged = ordered.flatMap((s) =>
    s.values
      .filter((v) => rowStatus(v)?.outside)
      .map((v) => ({ ...v, heading: s.heading, page: s.page }))
  )
  const [open, setOpen] = useState<Record<number, boolean>>(() => {
    const init: Record<number, boolean> = {}
    ordered.forEach((s, i) => {
      if (s.values.some((v) => rowStatus(v)?.outside)) init[i] = true
    })
    return init
  })
  return (
    <div className="flex flex-col gap-3">
      {flagged.length > 0 && (
        <div className="rounded-[24px] bg-[#F8D9CB] border-[1.5px] border-[#1A1A1A] p-4 flex flex-col gap-2.5">
          <h2 className="sv-display text-[22px] m-0">{t.lookFirst || 'Look at these first'}<span className="text-[#D9603B]">.</span></h2>
          {flagged.map((v, i) => (
            <div key={v.label + i} className="flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold">{v.label}</span>
                <span className="block text-[12px] text-[#3B3E3C]">{v.heading} · page {v.page}</span>
              </span>
              <span className="sv-display text-[22px] leading-none tabular-nums">{v.value}</span>
            </div>
          ))}
        </div>
      )}
      <p className="m-0 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#034F46]">
        {t.valuesAsPrinted || 'Values and flags exactly as printed'}
      </p>
      {ordered.map((s, i) => {
        const outside = s.values.filter((v) => rowStatus(v)?.outside).length
        const decided = s.values.filter((v) => rowStatus(v)).length
        const allInRange = decided > 0 && outside === 0
        return (
          <div key={s.heading + i} className="rounded-[28px] border-[1.5px] border-[#1A1A1A] overflow-hidden">
            <button type="button" className="w-full text-left p-3.5 flex items-center gap-3" aria-expanded={!!open[i]} onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}>
              <span className="flex-1 min-w-0">
                <span className="block text-[16px] font-bold break-words">{titleCaseHeading(s.heading)}</span>
                {s.heading_printed && s.heading_printed !== s.heading && (
                  <span className="block text-[12px] text-[#575B58]">{s.heading_printed}</span>
                )}
                <span className="block text-[13px] text-[#575B58]">{(t.valuesOnPage || '{n} values · page {p}').replace('{n}', String(s.values.length)).replace('{p}', String(s.page))}</span>
              </span>
              <span className={`text-[12px] font-bold px-2 py-1 rounded-full border-[1.5px] border-[#1A1A1A] ${outside ? 'bg-[#F8D9CB]' : allInRange ? 'bg-[#CFE5E0]' : 'bg-[#F4F5F2]'}`}>
                {outside
                  ? (t.nOutside || '{n} outside').replace('{n}', String(outside))
                  : allInRange
                    ? (t.allInRange || 'All in range')
                    : (t.nValues || '{n} values').replace('{n}', String(s.values.length))}
              </span>
            </button>
            {open[i] && (
              <div className="grid grid-cols-2 gap-2.5 px-3.5 pb-3.5">
                {s.values.map((v, j) => (
                  <LabTile key={v.label + j} label={v.label} value={v.value} unit={v.unit} range={v.ref_range || v.range} printed={v.flag_printed} printedName={v.label_printed} t={t} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function AmountStrip({
  amounts,
  t,
  allMatched,
}: {
  amounts: GlanceKeyValue[]
  t: Record<string, string>
  allMatched: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 border-[1.5px] border-[#1A1A1A] rounded-[24px] overflow-hidden">
        {amounts.slice(0, 3).map((s, i, arr) => (
          <div key={s.label + i} className={`flex flex-col gap-1.5 p-3 min-w-0 ${i > 0 ? 'border-l-[1.5px] border-[#1A1A1A]' : ''} ${i === arr.length - 1 ? 'bg-[#E9B44C]' : ''}`}>
            <span className="text-[12px] font-semibold text-[#3B3E3C]">{s.label}</span>
            <span className="sv-display text-[20px] leading-none tabular-nums">{formatAmountValue(s.value)}</span>
          </div>
        ))}
      </div>
      {allMatched && <Tick label={t.allAmountsFound || 'All amounts found in your document'} />}
    </div>
  )
}

export function PartPanels({ result, t }: { result: ExplainResponse; t: Record<string, string> }) {
  const parts = result.parts || []
  if (parts.length < 2) return null
  return (
    <div className="flex flex-col gap-5">
      {parts.map((part, index) => (
        <PartPanel key={part.part_id || part.title} part={part} index={index} t={t} />
      ))}
    </div>
  )
}

function PartPanel({ part, index, t }: { part: Part; index: number; t: Record<string, string> }) {
  const tints = ['#CFE5E0', '#F8D9CB', '#FBEBC4']
  const amounts = (part.glance?.key_values || []).filter((k) => isMoneyValue(k.kind, k.value))
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 shrink-0 rounded-full border-[1.5px] border-[#1A1A1A] flex items-center justify-center text-[14px] font-bold" style={{ background: tints[index % 3] }}>
          {index + 1}
        </span>
        <div className="min-w-0">
          <h2 className="sv-display text-[26px] leading-[1.05] m-0">{part.title}</h2>
          <p className="m-0 mt-1 text-[13px] text-[#575B58]">
            {part.issuer ? `${part.issuer} · ` : ''}
            {t.pages || 'Pages'} {part.pages[0]}–{part.pages[1]}
          </p>
        </div>
      </div>
      {part.sections && part.sections.length > 0 && <SectionedValues sections={part.sections} t={t} />}
      {part.medicines && part.medicines.length > 0 && (
        <div className="rounded-[28px] border-[1.5px] border-[#1A1A1A] bg-[#CFE5E0] p-4 flex flex-col gap-3">
          <h3 className="m-0 text-[16px] font-bold">{part.medicines.length} {t.medicines || 'medicines'}</h3>
          {part.medicines.map((med) => (
            <div key={med.name} className="rounded-[22px] bg-[#F4F5F2] border-[1.5px] border-[#1A1A1A] p-3">
              <span className="block text-[16px] font-bold">{med.name}{med.strength_text ? ` ${med.strength_text}` : ''}</span>
              <span className="block text-[13px] text-[#3B3E3C] mt-1">{med.instruction_text || med.frequency_raw}</span>
            </div>
          ))}
        </div>
      )}
      {amounts.length >= 2 && amounts.length <= 3 && <AmountStrip amounts={amounts} t={t} allMatched={amounts.every((a) => a.evidence === 'matched')} />}
      {part.summary_lines && part.summary_lines.length > 0 && (
        <p className="m-0 text-[15px] leading-[1.45] text-[#3B3E3C]">{part.summary_lines.join(' ')}</p>
      )}
    </section>
  )
}
