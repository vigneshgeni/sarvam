import { useState } from 'react'
import type { ExplainResponse } from '../../types'
import { downloadIcs, generateIcs, hashString } from '../../utils/ics'
import { emiRrule, isUpcoming, noticeByDate } from '../reminders'
import OutlineList from './OutlineList'

function saveReminder(title: string, date: string, rrule?: string, alarm = '-P1D') {
  const ics = generateIcs([
    {
      uid: hashString(`${title}-${date}-${rrule || 'once'}`),
      title,
      startDate: date,
      isAllDay: true,
      rrule,
      alarmTrigger: alarm,
    },
  ])
  downloadIcs('sarvam-reminder.ics', ics)
}

export function DirectionsBlock({ result, t }: { result: ExplainResponse; t: Record<string, string> }) {
  return <OutlineList title={t.directionsTitle || 'What the notice says'} lines={result.profile?.directions || []} />
}

export function WaysToPayBlock({ result, t }: { result: ExplainResponse; t: Record<string, string> }) {
  return <OutlineList title={t.waysToPay || 'Ways to pay'} lines={result.profile?.how_to_pay || []} />
}

export function ItemsBlock({ result, t }: { result: ExplainResponse; t: Record<string, string> }) {
  const items = result.profile?.line_items || []
  const [open, setOpen] = useState(false)
  if (!items.length) return null
  const shown = open ? items : items.slice(0, 5)
  return (
    <section className="rounded-[32px] border-[1.5px] border-[#1A1A1A] p-5 flex flex-col gap-2">
      <h2 className="sv-display text-[26px] leading-none m-0">
        {t.itemsTitle || 'Items'}<span className="text-[#D9603B]">.</span>
      </h2>
      {shown.map((item, i) => (
        <div key={item.description + i} className="flex justify-between gap-3 py-2 border-t border-[#E2E5E0] first:border-0">
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold">{item.description}</span>
            {item.qty && <span className="block text-[12px] text-[#575B58]">{item.qty}</span>}
          </span>
          {item.amount && <span className="sv-display text-[18px] shrink-0">{item.amount}</span>}
        </div>
      ))}
      {items.length > 5 && !open && (
        <button type="button" className="sv-press self-start text-[14px] font-bold underline" onClick={() => setOpen(true)}>
          {(t.showAllItems || 'Show all {n}').replace('{n}', String(items.length))}
        </button>
      )}
    </section>
  )
}

export function WarrantyBlock({ result, t }: { result: ExplainResponse; t: Record<string, string> }) {
  const until = result.profile?.warranty_until
  if (!until) return null
  return (
    <section className="rounded-[32px] border-[1.5px] border-[#1A1A1A] bg-[#CFE5E0] p-5">
      <h2 className="sv-display text-[26px] leading-none m-0">
        {(t.warrantyUntil || 'Warranty until {date}').replace('{date}', until)}<span className="text-[#D9603B]">.</span>
      </h2>
      {isUpcoming(until) && (
        <button
          type="button"
          className="sv-press mt-3 h-11 px-4 rounded-full border-[1.5px] border-[#1A1A1A] bg-[#E9B44C] text-[14px] font-bold"
          onClick={() => saveReminder(t.warrantyReminder || 'Warranty ends', until, undefined, '-P7D')}
        >
          {t.remindMe || 'Remind me'}
        </button>
      )}
    </section>
  )
}

export function DiagnosisBlock({ result, t }: { result: ExplainResponse; t: Record<string, string> }) {
  const text = result.profile?.diagnosis_as_written
  if (!text) return null
  return (
    <section className="rounded-[32px] border-[1.5px] border-[#1A1A1A] p-5">
      <h2 className="sv-display text-[26px] leading-none m-0">
        {t.diagnosisAsWritten || 'Diagnosis as written'}<span className="text-[#D9603B]">.</span>
      </h2>
      <p className="m-0 mt-3 text-[16px] leading-[1.5] italic">“{text}”</p>
    </section>
  )
}

export function AdviceBlock({ result, t }: { result: ExplainResponse; t: Record<string, string> }) {
  return <OutlineList title={t.adviceOnDischarge || 'Advice on discharge'} lines={result.profile?.advice_lines || []} />
}

export function ConsequenceBlock({ result }: { result: ExplainResponse }) {
  const text = result.profile?.consequence
  if (!text) return null
  return (
    <section className="rounded-[32px] border-[1.5px] border-[#1A1A1A] bg-[#D9603B] p-5 text-[#1A1A1A]">
      <h2 className="text-[16px] font-bold m-0">Watch out</h2>
      <p className="m-0 mt-2 text-[15.5px] leading-[1.45]">{text}</p>
    </section>
  )
}

export function LoanTermsBlock({ result, t }: { result: ExplainResponse; t: Record<string, string> }) {
  const p = result.profile
  const rows = [
    [t.tenure || 'Tenure', p?.tenure],
    [t.loanAccount || 'Loan account', p?.loan_account],
    [t.outstanding || 'Outstanding', p?.outstanding],
    [t.interestRate || 'Interest rate', p?.interest_rate],
    ...(p?.charges || []).map((c) => [c.label, c.value] as [string, string]),
  ].filter((row) => row[1])
  if (!rows.length) return null
  return (
    <section className="rounded-[32px] border-[1.5px] border-[#1A1A1A] p-5 flex flex-col gap-2">
      <h2 className="sv-display text-[26px] leading-none m-0">
        {t.loanTerms || 'Loan terms'}<span className="text-[#D9603B]">.</span>
      </h2>
      {rows.map(([label, value]) => (
        <div key={String(label)} className="flex justify-between gap-3 py-2 border-t border-[#E2E5E0]">
          <span className="text-[14px] text-[#575B58]">{label}</span>
          <span className="text-[15px] font-semibold text-right">{value}</span>
        </div>
      ))}
    </section>
  )
}

export function NextEmiBlock({ result, t }: { result: ExplainResponse; t: Record<string, string> }) {
  const when = result.profile?.next_emi_date
  const amount = result.profile?.emi_amount
  if (!when && !amount) return null
  return (
    <section className="rounded-[32px] border-[1.5px] border-[#1A1A1A] bg-[#CFE5E0] p-5">
      <p className="m-0 text-[13px] font-bold tracking-[1px]">{t.nextEmi || 'NEXT EMI'}</p>
      <h2 className="sv-display text-[32px] leading-none m-0 mt-2">{amount || when}</h2>
      {when && amount && <p className="m-0 mt-2 text-[15px]">{when}</p>}
      {when && (
        <button
          type="button"
          className="sv-press mt-3 h-11 px-4 rounded-full border-[1.5px] border-[#1A1A1A] bg-[#E9B44C] text-[14px] font-bold"
          onClick={() => saveReminder(t.emiReminder || 'EMI', when, emiRrule(result.profile))}
        >
          {t.emiReminder || 'EMI reminder'}
        </button>
      )}
    </section>
  )
}

export function KeyTermsBlock({ result, t }: { result: ExplainResponse; t: Record<string, string> }) {
  const p = result.profile
  const tiles = [
    [t.rentOrPrice || 'Rent', p?.rent_or_price],
    [t.deposit || 'Deposit', p?.deposit],
    [t.lockIn || 'Lock-in', p?.lock_in],
    [t.noticePeriod || 'Notice period', p?.notice_period],
    [t.term || 'Term', p?.term],
  ].filter((row) => row[1])
  if (!tiles.length) return null
  return (
    <section className="grid grid-cols-2 gap-2.5">
      {tiles.map(([label, value]) => (
        <div key={String(label)} className="rounded-[22px] border-[1.5px] border-[#1A1A1A] p-3.5">
          <span className="block text-[12px] font-semibold text-[#575B58]">{label}</span>
          <span className="sv-display text-[22px] leading-none">{value}</span>
        </div>
      ))}
    </section>
  )
}

export function TimelineBlock({ result, t }: { result: ExplainResponse; t: Record<string, string> }) {
  const start = result.profile?.start_date
  const end = result.profile?.end_date
  if (!start && !end) return null
  const today = new Date().toISOString().slice(0, 10)
  const noticeBy = noticeByDate(end, result.profile?.notice_period)
  return (
    <section className="rounded-[28px] border-[1.5px] border-[#1A1A1A] p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[14px] font-semibold">{start || '—'}</span>
        <span className="relative flex-1 h-[3px] bg-[#1A1A1A]">
          {start && end && today >= start && today <= end && (
            <span className="absolute left-1/2 -top-1 w-3 h-3 rounded-full bg-[#E9B44C] border-[1.5px] border-[#1A1A1A]" aria-label={t.today || 'Today'} />
          )}
        </span>
        <span className="text-[14px] font-semibold">{end || '—'}</span>
      </div>
      {noticeBy && (
        <p className="m-0 text-[14px]">
          {(t.noticeBy || 'Give notice by {date}').replace('{date}', noticeBy)}
          <span className="ml-2 text-[12px] font-bold px-2 py-0.5 rounded-full bg-[#FBEBC4]">{t.calculatedChip || 'Calculated'}</span>
        </p>
      )}
    </section>
  )
}

export function FormStepsBlock({ result, t }: { result: ExplainResponse; t: Record<string, string> }) {
  const lines = (result.profile?.form_fields || []).map((field) =>
    field.instruction ? `${field.name}. ${field.instruction}` : field.name
  )
  return <OutlineList title={t.howToFill || 'What you need to do'} lines={lines} />
}

export function NotADiagnosisBlock({ t }: { t: Record<string, string> }) {
  return (
    <section className="rounded-[28px] border-[1.5px] border-[#1A1A1A] bg-[#D9603B] p-4 text-[#1A1A1A]">
      <h2 className="text-[16px] font-bold m-0">{t.notADiagnosis || 'Not a diagnosis.'}</h2>
      <p className="m-0 mt-1 text-[14.5px] leading-[1.45]">
        {t.notADiagnosisBody || 'Sarvam explains what is printed. Only your doctor can say what it means for you.'}
      </p>
    </section>
  )
}
