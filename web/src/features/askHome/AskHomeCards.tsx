import { useState } from 'react'
import type { AskProposal, MemoryExcerpt, SavedReminder } from '../../types'
import { getSection, resolveLang } from '../../i18n'
import CalendarEditSheet from '../../components/CalendarEditSheet'
import { calendarDraftEvent } from '../../utils/reminders'
import { canShareIcsFile, downloadIcs, generateIcs, hashString, shareIcsFile } from '../../utils/ics'
import { parseWhenToDateAndTime } from './askProposals.js'
import { saveAcceptedReminder } from './reminderStorage.js'

interface AskHomeCardsProps {
  sources?: MemoryExcerpt[]
  proposals?: AskProposal[]
  lang: string
  t: Record<string, string>
  onOpenSource?: (source: MemoryExcerpt) => void
  onOpenSessionId?: (sourceId: string) => void
  onReminderAdded?: (reminder: SavedReminder, wasNew: boolean) => void
  onToast?: (message: string) => void
}

function formatSourceDate(ts: number, lang: string): string {
  if (!ts) return ''
  try {
    return new Intl.DateTimeFormat(resolveLang(lang), { day: 'numeric', month: 'short' }).format(new Date(ts))
  } catch {
    return ''
  }
}

function sourceTypeLabel(type: MemoryExcerpt['sourceType'], ah: Record<string, string>): string {
  switch (type) {
    case 'relaySession':
      return ah.sourceFromSession || 'Live Relay chat'
    case 'draft':
      return ah.sourceFromDraft || 'Form draft'
    case 'gmail':
      return ah.sourceFromGmail || 'Gmail'
    case 'history':
      return ah.sourceFromHistory || 'Saved chat'
    default:
      return ah.sourceFromDoc || 'Document'
  }
}

export default function AskHomeCards({
  sources,
  proposals,
  lang,
  t,
  onOpenSource,
  onOpenSessionId,
  onReminderAdded,
  onToast,
}: AskHomeCardsProps) {
  const ah = getSection(lang, 'askHome')
  const [statuses, setStatuses] = useState<Record<string, 'added' | 'dismissed'>>({})

  // Calendar edit sheet state for propose_calendar_event
  const [calProposalId, setCalProposalId] = useState<string | null>(null)
  const [calDraft, setCalDraft] = useState({ title: '', date: '', time: '09:00', alert: 'day', notes: '' })

  const handleAcceptReminder = async (prop: Extract<AskProposal, { type: 'propose_reminder' }>) => {
    const parsed = parseWhenToDateAndTime(prop.when)
    const { reminder, added } = await saveAcceptedReminder({
      title: prop.title,
      date: parsed.date,
      time: parsed.time,
      when: prop.when,
      source: ah.fromAskSarvam || 'From Ask Sarvam',
      sourceId: sources?.[0]?.sourceId || '',
    })
    setStatuses((prev) => ({ ...prev, [prop.id]: 'added' }))
    if (reminder) {
      onReminderAdded?.(reminder, added)
      onToast?.(
        added
          ? ah.toastReminderAdded || 'Reminder added · on Home and in Notifications'
          : ah.toastReminderExists || 'This reminder is already saved'
      )
    }
  }

  const handleOpenCalendarSheet = (prop: Extract<AskProposal, { type: 'propose_calendar_event' }>) => {
    const parsed = parseWhenToDateAndTime(prop.start)
    setCalDraft({
      title: prop.title,
      date: parsed.date,
      time: parsed.time,
      alert: 'day',
      notes: prop.notes || '',
    })
    setCalProposalId(prop.id)
  }

  const handleConfirmCalendarAdd = async () => {
    const event = calendarDraftEvent({
      uid: `ask-${hashString(`${calDraft.title}|${calDraft.date}|${calDraft.time}`)}`,
      title: calDraft.title,
      note: calDraft.notes || 'Sarvam calendar event.',
      date: calDraft.date,
      time: calDraft.time,
      alert: calDraft.alert,
    })
    const ics = generateIcs([event])
    const fileName = `${(calDraft.title || 'sarvam-event').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 40)}.ics`
    if (canShareIcsFile()) {
      const outcome = await shareIcsFile(fileName, ics, calDraft.title)
      if (outcome !== 'shared') {
        downloadIcs(fileName, ics)
      }
    } else {
      downloadIcs(fileName, ics)
    }
    if (calProposalId) {
      setStatuses((prev) => ({ ...prev, [calProposalId]: 'added' }))
    }
    setCalProposalId(null)
    onToast?.(ah.addedCalendarBadge || 'Calendar event ready')
  }

  const handleDismiss = (id: string) => {
    setStatuses((prev) => ({ ...prev, [id]: 'dismissed' }))
  }

  const primarySource = sources && sources.length > 0 ? sources[0] : null

  return (
    <div className="flex flex-col gap-2.5 mt-1">
      {/* Source card */}
      {primarySource && (
        <div
          data-testid="ask-source-card"
          className="flex items-center justify-between gap-3 rounded-[20px] border-[1.5px] border-[#1B1B1B] bg-[#F5F4F2] px-3.5 py-2.5"
        >
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#214D47]">
              {sourceTypeLabel(primarySource.sourceType, ah)}
              {primarySource.timestamp ? ` · ${formatSourceDate(primarySource.timestamp, lang)}` : ''}
            </span>
            <span className="text-[14.5px] font-bold text-[#1B1B1B] truncate">{primarySource.title}</span>
          </div>
          <button
            type="button"
            data-testid="ask-source-open-btn"
            onClick={() => onOpenSource?.(primarySource)}
            className="sv-press min-h-[44px] px-4 rounded-full border-[1.5px] border-[#1B1B1B] bg-white text-[#1B1B1B] text-[13.5px] font-bold shrink-0"
          >
            {ah.sourceOpen || 'Open'}
          </button>
        </div>
      )}

      {/* Agentic approval cards (never act without a tap!) */}
      {proposals?.map((prop) => {
        const status = statuses[prop.id]
        const tag =
          prop.type === 'propose_reminder'
            ? ah.proposalReminderTag || 'Reminder'
            : prop.type === 'propose_calendar_event'
            ? ah.proposalCalendarTag || 'Calendar event'
            : ah.proposalSessionTag || 'Saved session'

        const title =
          prop.type === 'open_session'
            ? prop.title || sources?.find((s) => s.sourceId === prop.sourceId)?.title || prop.sourceId
            : prop.title

        const sub =
          prop.type === 'propose_reminder'
            ? prop.when
            : prop.type === 'propose_calendar_event'
            ? prop.start
            : ah.sourceFromSession || 'Live Relay chat'

        return (
          <div
            key={prop.id}
            data-testid={`ask-proposal-card-${prop.type}`}
            className="rounded-[20px] border-[2px] border-[#1B1B1B] bg-white p-3.5 flex flex-col gap-2.5"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#C96846]">{tag}</span>
              <span className="text-[15px] font-bold text-[#1B1B1B] leading-snug">{title}</span>
              {sub && <span className="text-[13px] text-[#5E5E5A]">{sub}</span>}
            </div>

            {status === 'added' ? (
              <span
                data-testid="ask-proposal-added-badge"
                className="self-start px-3 py-1 rounded-full bg-[#D3E5E0] text-[#214D47] text-[12.5px] font-bold"
              >
                {prop.type === 'propose_reminder'
                  ? ah.addedReminderBadge || 'Reminder added · on Home and in Notifications'
                  : ah.addedCalendarBadge || 'Calendar event ready'}
              </span>
            ) : status === 'dismissed' ? (
              <span data-testid="ask-proposal-dismissed-badge" className="text-[12.5px] font-semibold text-[#5E5E5A]">
                {ah.dismissedBadge || 'Dismissed'}
              </span>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid={`ask-proposal-add-${prop.type}`}
                  onClick={() => {
                    if (prop.type === 'propose_reminder') {
                      void handleAcceptReminder(prop)
                    } else if (prop.type === 'propose_calendar_event') {
                      handleOpenCalendarSheet(prop)
                    } else if (prop.type === 'open_session') {
                      setStatuses((prev) => ({ ...prev, [prop.id]: 'added' }))
                      onOpenSessionId?.(prop.sourceId)
                    }
                  }}
                  className="sv-press min-h-[44px] px-5 rounded-full border-[2px] border-[#1B1B1B] bg-[#E3B660] text-[#1B1B1B] text-[14px] font-bold"
                >
                  {prop.type === 'open_session' ? ah.sourceOpen || 'Open' : ah.add || 'Add'}
                </button>
                <button
                  type="button"
                  data-testid={`ask-proposal-dismiss-${prop.type}`}
                  onClick={() => handleDismiss(prop.id)}
                  className="sv-press min-h-[44px] px-4 rounded-full border-[1.5px] border-[#1B1B1B] bg-transparent text-[#1B1B1B] text-[14px] font-semibold"
                >
                  {ah.notNow || 'Not now'}
                </button>
              </div>
            )}
          </div>
        )
      })}

      {/* Prefilled CalendarEditSheet for propose_calendar_event */}
      <CalendarEditSheet
        isOpen={Boolean(calProposalId)}
        onClose={() => setCalProposalId(null)}
        t={t}
        title={calDraft.title}
        date={calDraft.date}
        time={calDraft.time}
        alert={calDraft.alert}
        onChange={(next) => setCalDraft((prev) => ({ ...prev, ...next }))}
        onAdd={() => { void handleConfirmCalendarAdd() }}
      />
    </div>
  )
}
