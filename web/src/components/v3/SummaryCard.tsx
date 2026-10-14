import { useState } from 'react'
import type { ExplainResponse, GlanceKeyValue, Part, Section } from '../../types'
import { getLocalisedDocType } from '../../i18n'
import { isMoneyValue, pickGlance, visualForDocument, type GlanceKind } from '../../design/catalog'
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
  const docType = result.doc_type || (result.document_type as string) || 'other'
  const visual = visualForDocument(docType, {
    medicines: (result.medicines?.length || 0) > 0,
    title: result.title,
    multi: kind === 'multi',
  })
  const typeLabel = getLocalisedDocType(lang, docType) || docType
  const dateLabel = formatChipDate(result.report_date_iso || result.letter_date, lang)
  const headline = result.glance?.headline || result.title
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
      {kind === 'A' && <SplitAmounts amounts={amounts} t={t} allMatched={allMatched} />}
      {kind === 'B' && <AmountToPay result={result} amounts={amounts} t={t} lang={lang} />}
      {kind === 'C' && <Deadline result={result} t={t} lang={lang} />}
      {kind === 'D' && <ValueTiles result={result} kvs={kvs} t={t} allMatched={allMatched} />}
      {kind === 'Dplus' && <SectionedValues sections={result.sections || []} t={t} />}
      {kind === 'F' && <AmountStrip amounts={amounts} t={t} allMatched={allMatched} />}
      {kind === 'multi' && <PageMap result={result} t={t} />}
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
  const due = result.actions?.find((a) => a.due_date && a.date_status !== 'passed')
  const left = daysUntil(due?.due_date)
  const date = due?.due_date ? formatChipDate(due.due_date, lang) : null
  return (
    <div className="flex gap-3">
      <div className="flex-1 min-w-0 rounded-[24px] bg-[#F8D9CB] border-[1.5px] border-[#1A1A1A] p-4 flex flex-col gap-1">
        <span className="text-[12px] font-bold tracking-[1.2px]">{t.toPay || 'TO PAY'}</span>
        <span className="sv-display text-[44px] leading-none tabular-nums">{formatAmountValue(amounts[0]?.value || '')}</span>
        {date && (
          <span className="text-[14px] font-semibold">
            {(t.byDate || 'by {date}').replace('{date}', date)}
            {left != null && left >= 0 ? ` · ${(t.daysLeft || '{n} days left').replace('{n}', String(left))}` : ''}
          </span>
        )}
      </div>
      {due?.due_date && <DateTile iso={due.due_date} />}
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
            <div key={v.label + i} className="rounded-[22px] border-[1.5px] border-[#1A1A1A] p-3.5 flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-[#575B58]">{v.label}</span>
              <span className="sv-display text-[28px] leading-none tabular-nums">
                {v.value} {v.unit && <span className="text-[16px]">{v.unit}</span>}
              </span>
              {v.ref_range && <span className="text-[12px] text-[#575B58]">{v.ref_range}</span>}
              {v.flag_printed === 'High' || v.flag_printed === 'Low' ? (
                <span className={`self-start text-[12px] font-bold px-2 py-0.5 rounded-full border-[1.5px] border-[#1A1A1A] ${v.flag_printed === 'High' ? 'bg-[#D9603B]' : 'bg-[#F8D9CB]'}`}>{v.flag_printed}</span>
              ) : v.ref_range ? (
                <span className="self-start text-[12px] font-bold px-2 py-0.5 rounded-full bg-[#CFE5E0] border-[1.5px] border-[#1A1A1A]">{t.inRange || 'In range'}</span>
              ) : null}
            </div>
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

export function SectionedValues({ sections, t }: { sections: Section[]; t: Record<string, string> }) {
  const ranked = [...sections].sort((a, b) => {
    const fa = a.values.some((v) => v.flag_printed) ? 0 : 1
    const fb = b.values.some((v) => v.flag_printed) ? 0 : 1
    return fa - fb
  })
  const flagged = sections.flatMap((s) => s.values.filter((v) => v.flag_printed).map((v) => ({ ...v, heading: s.heading, page: s.page }))).slice(0, 6)
  const [open, setOpen] = useState<Record<number, boolean>>(() => {
    const init: Record<number, boolean> = {}
    ranked.forEach((s, i) => {
      if (s.values.some((v) => v.flag_printed)) init[i] = true
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
      {ranked.map((s, i) => {
        const outside = s.values.filter((v) => v.flag_printed).length
        return (
          <div key={s.heading + i} className="rounded-[28px] border-[1.5px] border-[#1A1A1A] overflow-hidden">
            <button type="button" className="w-full text-left p-3.5 flex items-center gap-3" aria-expanded={!!open[i]} onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}>
              <span className="flex-1 min-w-0">
                <span className="block text-[16px] font-bold">{s.heading}</span>
                <span className="block text-[13px] text-[#575B58]">{s.values.length} values · page {s.page}</span>
              </span>
              <span className={`text-[12px] font-bold px-2 py-1 rounded-full border-[1.5px] border-[#1A1A1A] ${outside ? 'bg-[#F8D9CB]' : 'bg-[#CFE5E0]'}`}>
                {outside ? (t.nOutside || '{n} outside').replace('{n}', String(outside)) : (t.allInRange || 'All in range')}
              </span>
            </button>
            {open[i] && (
              <div className="grid grid-cols-2 gap-2.5 px-3.5 pb-3.5">
                {s.values.map((v, j) => (
                  <div key={v.label + j} className="rounded-[22px] border-[1.5px] border-[#1A1A1A] p-3">
                    <span className="block text-[12px] font-semibold text-[#575B58]">{v.label}</span>
                    <span className="sv-display text-[22px] leading-none">{v.value} {v.unit}</span>
                  </div>
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

function PageMap({ result, t }: { result: ExplainResponse; t: Record<string, string> }) {
  const parts = result.parts || []
  const pages = Math.max(...parts.map((p) => p.pages[1]), 1)
  const tints = ['#CFE5E0', '#F8D9CB', '#FBEBC4']
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[12px] font-bold tracking-[1.2px]">{t.inThisUpload || 'IN THIS UPLOAD'}</span>
      <div className="flex gap-2" role="img" aria-label={parts.map((p) => `${p.title}, pages ${p.pages[0]} to ${p.pages[1]}`).join('. ')}>
        {Array.from({ length: pages }, (_, i) => {
          const page = i + 1
          const partIndex = parts.findIndex((p) => page >= p.pages[0] && page <= p.pages[1])
          return <span key={page} className="h-[78px] flex-1 rounded-[12px] border-[1.5px] border-[#1A1A1A]" style={{ background: tints[Math.max(partIndex, 0) % 3] }} />
        })}
      </div>
      <Tick label={t.splitUsingHeadings || 'Split using the headings on your pages'} />
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
