import { useEffect, useState, type ReactNode } from 'react'
import type { ExplainResponse, Part } from '../types'
import { partAsResult } from './kinds'
import { assessLabValue } from './labFlag'
import { resolveProfile } from './profiles'

function span(part: Part): [number, number] {
  const pages = part.pages || []
  const start = Number(pages[0]) || 1
  const end = Number(pages[1] || pages[0]) || start
  return [Math.min(start, end), Math.max(start, end)]
}

function flagged(parts: Part[]) {
  const rows: { label: string; value: string; unit: string; flag: string; section: string; page: number }[] = []
  for (const part of parts) {
    for (const section of part.sections || []) {
      for (const value of section.values || []) {
        const status = assessLabValue(value.value, value.ref_range || value.range, value.flag_printed)
        if (status?.outside) {
          rows.push({
            label: value.name || value.label || '',
            value: value.value,
            unit: value.unit || '',
            flag: status.label,
            section: section.heading || section.title || part.title,
            page: section.page || span(part)[0],
          })
        }
      }
    }
  }
  return rows
}

export default function MultiDocument({
  result,
  t,
  renderBlocks,
}: {
  result: ExplainResponse
  t: Record<string, string>
  renderBlocks: (result: ExplainResponse) => ReactNode
}) {
  const parts = result.parts || []
  const [active, setActive] = useState(0)
  const flags = flagged(parts)
  const maxPage = Math.max(1, ...parts.map((part) => span(part)[1]))
  const owner = Array.from({ length: maxPage }, (_, index) => {
    const page = index + 1
    return parts.findIndex((part) => {
      const [start, end] = span(part)
      return page >= start && page <= end
    })
  })
  const groups: { id: number; start: number; end: number }[] = []
  owner.forEach((id, index) => {
    if (id < 0) return
    const last = groups[groups.length - 1]
    if (last && last.id === id && last.end === index - 1) last.end = index
    else groups.push({ id, start: index, end: index })
  })

  useEffect(() => {
    const nodes = parts
      .map((_, index) => document.getElementById(`sv-doc-${index}`))
      .filter((node): node is HTMLElement => !!node)
    if (!nodes.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        const id = hit?.target.id.replace('sv-doc-', '')
        if (id != null && id !== '') setActive(Number(id))
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: [0.15, 0.4] }
    )
    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [parts])

  return (
    <div className="flex flex-col gap-4">
      <section className="border-[1.5px] border-[#1A1A1A] rounded-[32px] p-5 flex flex-col gap-3">
        <span className="text-[12px] font-bold tracking-[1.2px] text-[#575B58]">
          {(t.inThisUpload || 'IN THIS UPLOAD').toUpperCase()}
        </span>
        <div
          className="grid gap-2 overflow-x-auto"
          style={{ gridTemplateColumns: `repeat(${maxPage}, minmax(36px, 1fr))` }}
          role="img"
          aria-label={t.pageMapLabel || 'Pages coloured by document'}
        >
          {owner.map((id, index) => {
            const visual = id >= 0 ? resolveProfile(partAsResult(parts[id], result)).visual : null
            return (
              <span
                key={index}
                className="min-h-[72px] rounded-[14px] border-[1.5px] border-[#1A1A1A] p-1.5 flex flex-col"
                style={{ background: visual?.bg || '#E2E5E0', color: visual?.ink || '#1A1A1A' }}
              >
                <span className="h-1 rounded-full bg-current opacity-70" />
                <span className="h-1 mt-1 rounded-full bg-current opacity-40 w-4/5" />
                <span className="mt-auto self-center text-[11px] font-bold">{index + 1}</span>
              </span>
            )
          })}
          {groups.map((group) => {
            const visual = resolveProfile(partAsResult(parts[group.id], result)).visual
            return (
              <span
                key={`bar-${group.id}-${group.start}`}
                className="h-2 rounded-[4px] border-[1.5px] border-[#1A1A1A]"
                style={{
                  background: visual.bg,
                  gridColumn: `${group.start + 1} / ${group.end + 2}`,
                }}
              />
            )
          })}
          {groups.map((group) => (
            <span
              key={`label-${group.id}-${group.start}`}
              className="text-[12.5px] font-bold truncate"
              style={{ gridColumn: `${group.start + 1} / ${group.end + 2}` }}
            >
              {parts[group.id].title}
            </span>
          ))}
        </div>
      </section>

      <nav
        aria-label={t.documentsInUpload || 'Documents in this upload'}
        className="sticky top-0 z-20 flex gap-2 p-1 border-[1.5px] border-[#1A1A1A] rounded-[28px] bg-[#F4F5F2]"
      >
        {parts.map((part, index) => (
          <button
            key={part.part_id || part.title}
            type="button"
            aria-current={active === index}
            className="sv-press min-w-0 flex-1 h-11 rounded-[22px] text-[14px] font-bold inline-flex items-center justify-center gap-1.5 px-2"
            style={{ background: active === index ? '#E9B44C' : 'transparent' }}
            onClick={() => {
              window.scrollTo(0, 0)
              document.getElementById(`sv-doc-${index}`)?.scrollIntoView({ behavior: 'auto', block: 'start' })
            }}
          >
            <span className="w-5 h-5 rounded-full border-[1.5px] border-[#1A1A1A] text-[11px] inline-flex items-center justify-center shrink-0" style={{ background: active === index ? '#1A1A1A' : 'transparent', color: active === index ? '#F4F5F2' : '#1A1A1A' }}>
              {index + 1}
            </span>
            <span className="truncate">{part.title}</span>
          </button>
        ))}
      </nav>

      {flags.length > 0 && (
        <section className="bg-[#F8D9CB] border-[1.5px] border-[#1A1A1A] rounded-[32px] p-4 flex flex-col gap-2.5">
          <h2 className="sv-display text-[26px] leading-none m-0">
            {t.lookFirst || 'Look at these first'}<span className="text-[#D9603B]">.</span>
          </h2>
          <div className="bg-[#F4F5F2] border-[1.5px] border-[#1A1A1A] rounded-[24px] px-3.5">
            {flags.map((row) => (
              <div key={`${row.label}-${row.page}`} className="flex items-center gap-2 py-2.5 border-t border-[#E2E5E0] first:border-0">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold">{row.label}</span>
                  <span className="block text-[12px] text-[#575B58]">{row.section} · {row.page}</span>
                </span>
                <span className="sv-display text-[22px] leading-none">{row.value}</span>
                <span className="text-[12px] font-bold px-2 py-0.5 rounded-full border-[1.5px] border-[#1A1A1A]" style={{ background: row.flag === 'High' ? '#D9603B' : '#E9B44C' }}>
                  {row.flag}
                </span>
              </div>
            ))}
          </div>
          <span className="text-[12.5px] font-semibold">{t.valuesAsPrinted || 'Values and flags exactly as printed'}</span>
        </section>
      )}

      {parts.map((part, index) => {
        const asResult = partAsResult(part, result)
        const profile = resolveProfile(asResult)
        const [start, end] = span(part)
        const pageLabel = start === end ? String(start) : `${start}–${end}`
        const when = part.date_iso || ''
        return (
          <section key={part.part_id || part.title} id={`sv-doc-${index}`} className="flex flex-col gap-3 scroll-mt-16">
            <div className="flex items-center gap-3 px-1">
              <span className="w-10 h-10 shrink-0 rounded-[14px] border-[1.5px] border-[#1A1A1A] flex items-center justify-center text-[16px] font-bold" style={{ background: profile.visual.bg, color: profile.visual.ink }}>
                {index + 1}
              </span>
              <span className="min-w-0 flex flex-col">
                <span className="text-[11.5px] font-bold tracking-[1.2px] text-[#575B58]">
                  {(start === end
                    ? (t.documentOnePage || 'DOCUMENT {n} OF {m} · PAGE {pages}')
                    : (t.documentNofM || 'DOCUMENT {n} OF {m} · PAGES {pages}'))
                    .replace('{n}', String(index + 1))
                    .replace('{m}', String(parts.length))
                    .replace('{pages}', pageLabel)}
                </span>
                <span className="sv-display text-[26px] leading-[1.1]">
                  {part.title}<span className="text-[#D9603B]">.</span>
                </span>
                <span className="text-[13px] text-[#3B3E3C]">
                  {[part.issuer, when].filter(Boolean).join(' · ')}
                </span>
              </span>
            </div>
            {renderBlocks(asResult)}
          </section>
        )
      })}
    </div>
  )
}
