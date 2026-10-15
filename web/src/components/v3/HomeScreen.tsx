import { useEffect, useState, type MouseEvent } from 'react'
import { applyDarkTheme, readDarkTheme } from '../../design/theme'
import type { RecentResult } from '../../types'
import type { ReminderRow } from '../../utils/reminders'
import { SUPPORTED_LANGS, LANG_LABELS, resolveLang, getLocalisedDocType } from '../../i18n'
import { HOME_SAMPLES, HEALTH_SAMPLE, visualForDocument, filterGroup, type FilterGroup } from '../../design/catalog'
import { chipFont, ensureOnboardingFonts } from '../../design/indicFont'
import { DocIcon, IconA11y, IconArrow, IconCalendar, IconCamera, IconChevron, IconClose, IconFile, IconInfo, IconLock, IconMoon, IconSearch, IconSun, IconTick } from '../../ui/icons'

export interface NextUp {
  id: string
  summary: string
  date: string
  time: string
  documentName: string
  recentId: string
}

interface HomeProps {
  t: Record<string, string>
  selectedLang: string
  onSelectLang: (id: string) => void
  isOnline: boolean
  nextUp: NextUp | null
  upcomingCount: number
  upcomingReminders: ReminderRow[]
  pastReminders: ReminderRow[]
  onOpenNext: () => void
  onOpenReminder: (recentId: string) => void
  onDismissNext: (id: string) => void
  onTakePhoto: () => void
  onChooseFiles: () => void
  onChooseFolder?: () => void
  onSample: (file: string) => void
  recent: RecentResult[]
  onOpenRecent: (item: RecentResult) => void
  onRemoveRecent: (e: MouseEvent, item: RecentResult) => void
  onRenameRecent?: (item: RecentResult, name: string) => void
  onDeleteAll: () => void
  saveEnabled: boolean
  onToggleSave: (on: boolean) => void
  onA11y: () => void
  library: boolean
  onOpenLibrary: () => void
  onCloseLibrary: () => void
  onRetryOnline: () => void
}

const chipBtn =
  'sv-press shrink-0 min-h-11 px-[18px] py-2 rounded-full border-[1.5px] border-[#1A1A1A] text-[15px] font-semibold leading-[1.4] text-[#1A1A1A] bg-transparent whitespace-nowrap'

function RecentRow({
  item,
  lang,
  onOpen,
  onRemove,
  onRename,
  renameLabel,
}: {
  item: RecentResult
  lang: string
  onOpen: () => void
  onRemove: (e: MouseEvent) => void
  onRename?: (e: MouseEvent) => void
  renameLabel?: string
}) {
  const doc = item.result?.doc_type || item.result?.document_type
  const visual = visualForDocument(String(doc || ''), {
    medicines: (item.result?.medicines?.length || 0) > 0,
    title: item.title,
    multi: (item.result?.parts?.length || 0) > 1,
  })
  const date = new Intl.DateTimeFormat(resolveLang(lang), { day: 'numeric', month: 'short' }).format(
    new Date(item.timestamp)
  )
  const type = getLocalisedDocType(lang, String(doc || 'other'))
  return (
    <div className="flex items-center gap-3 py-3 pr-2 pl-3 border-[1.5px] border-[#1A1A1A] rounded-[28px] bg-[#F4F5F2]">
      <button type="button" onClick={onOpen} className="sv-press flex items-center gap-3 flex-1 min-w-0 text-left text-[#1A1A1A]">
        <span
          className="w-[46px] h-[46px] shrink-0 box-border rounded-2xl border-[1.5px] border-[#1A1A1A] flex items-center justify-center"
          style={{ background: visual.bg }}
        >
          <DocIcon name={visual.icon} stroke={visual.ink} />
        </span>
        <span className="flex flex-col gap-[3px] flex-1 min-w-0">
          <span className="text-[15.5px] font-semibold leading-[1.3] line-clamp-2">{item.displayName || item.title}</span>
          <span className="text-[13px] text-[#575B58]">
            {type} · {date}
          </span>
        </span>
      </button>
      {onRename && (
        <button type="button" onClick={onRename} className="sv-press h-11 px-2 text-[13px] font-semibold text-[#034F46]">
          {renameLabel}
        </button>
      )}
      <button
        type="button"
        aria-label="Remove"
        onClick={onRemove}
        className="w-11 h-11 shrink-0 rounded-full bg-transparent flex items-center justify-center"
      >
        <IconClose size={16} stroke="#575B58" />
      </button>
    </div>
  )
}

function groupLabel(ts: number, t: Record<string, string>, lang: string): string {
  const date = new Date(ts)
  const now = new Date()
  const start = new Date(now)
  const mondayOffset = (start.getDay() + 6) % 7
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - mondayOffset)
  if (date >= start) return t.thisWeek || 'THIS WEEK'
  const month = new Intl.DateTimeFormat(resolveLang(lang), { month: 'long' }).format(date)
  if (date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) {
    return (t.earlierInMonth || 'EARLIER IN {month}').replace('{month}', month.toUpperCase())
  }
  return month.toUpperCase()
}

function RenameDialog({
  item,
  t,
  onClose,
  onSave,
}: {
  item: RecentResult | null
  t: Record<string, string>
  onClose: () => void
  onSave: (name: string) => void
}) {
  const [value, setValue] = useState(item?.displayName || item?.title || '')
  if (!item) return null
  return (
    <div className="fixed inset-0 z-50 bg-[#1A1A1A]/40 flex items-end" onClick={onClose}>
      <form
        className="w-full bg-[#F4F5F2] rounded-t-[28px] border-t-[1.5px] border-[#1A1A1A] p-5 flex flex-col gap-3"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          onSave(value.trim().slice(0, 60))
        }}
      >
        <h2 className="m-0 text-[22px] font-bold">{t.renameTitle || 'Rename this document'}</h2>
        <input
          value={value}
          maxLength={60}
          autoFocus
          onChange={(event) => setValue(event.target.value.slice(0, 60))}
          aria-label={t.renameTitle || 'Rename this document'}
          className="h-12 rounded-full border-[1.5px] border-[#1A1A1A] px-4 text-[16px] bg-transparent"
        />
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="sv-press h-12 flex-1 rounded-full border-[1.5px] border-[#1A1A1A] font-semibold">{t.renameCancel || 'Cancel'}</button>
          <button type="submit" className="sv-press h-12 flex-1 rounded-full border-[1.5px] border-[#1A1A1A] bg-[#E9B44C] font-bold">{t.renameSave || 'Save'}</button>
        </div>
      </form>
    </div>
  )
}

function formatWhen(date: string, time: string, lang: string) {
  let formatted = date
  try {
    formatted = new Intl.DateTimeFormat(resolveLang(lang), { day: 'numeric', month: 'short' }).format(new Date(`${date}T00:00:00`))
  } catch {
    /* keep the printed date */
  }
  return time ? `${formatted} · ${time}` : formatted
}

function ReminderList({
  rows,
  lang,
  empty,
  onOpen,
}: {
  rows: ReminderRow[]
  lang: string
  empty: string
  onOpen: (recentId: string) => void
}) {
  if (!rows.length) return <p className="m-0 text-[15px] text-[#575B58]">{empty}</p>
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          onClick={() => onOpen(row.recentId)}
          className="sv-press flex items-center gap-3 py-3 pr-3 pl-3 border-[1.5px] border-[#1A1A1A] rounded-[28px] bg-[#F4F5F2] text-left text-[#1A1A1A]"
        >
          <span className="w-[46px] h-[46px] shrink-0 box-border rounded-2xl border-[1.5px] border-[#1A1A1A] bg-[#F8D9CB] flex items-center justify-center">
            <IconCalendar size={22} stroke="#1A1A1A" />
          </span>
          <span className="flex flex-col gap-[3px] flex-1 min-w-0">
            <span className="text-[15.5px] font-semibold leading-[1.3] line-clamp-2">{row.summary}</span>
            <span className="text-[13px] text-[#575B58] truncate">
              {formatWhen(row.date, row.time, lang)}
              {row.documentName ? ` · ${row.documentName}` : ''}
            </span>
          </span>
          <IconChevron size={18} stroke="#1A1A1A" className="shrink-0" />
        </button>
      ))}
    </div>
  )
}

function RemindersPage({
  t,
  lang,
  indic,
  tab,
  onTab,
  upcoming,
  past,
  onBack,
  onOpen,
}: {
  t: Record<string, string>
  lang: string
  indic: boolean
  tab: 'upcoming' | 'past'
  onTab: (tab: 'upcoming' | 'past') => void
  upcoming: ReminderRow[]
  past: ReminderRow[]
  onBack: () => void
  onOpen: (recentId: string) => void
}) {
  const tabs = [
    { id: 'upcoming' as const, label: t.upcomingTab || 'Upcoming' },
    { id: 'past' as const, label: t.pastTab || 'Past' },
  ]
  return (
    <div className="sv-screen-in bg-[#F4F5F2] text-[#1A1A1A] px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] flex flex-col gap-4 min-h-[100dvh]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={t.backHome || 'Back to Home'}
          onClick={onBack}
          className="sv-press w-12 h-12 shrink-0 box-border rounded-full border-[1.5px] border-[#1A1A1A] flex items-center justify-center bg-transparent"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
      </div>
      <h1 className={indic ? 'sv-indic m-0 text-[30px] leading-[1.35] font-semibold break-words' : 'sv-display m-0 text-[42px] leading-none tracking-[-0.5px]'}>
        {t.remindersTitle || 'Reminders'}
        <span className="text-[#D9603B]">.</span>
      </h1>
      <div className="flex gap-2" role="tablist">
        {tabs.map((item) => {
          const on = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onTab(item.id)}
              className="sv-press shrink-0 h-10 px-4 rounded-full border-[1.5px] border-[#1A1A1A] text-[14px] text-[#1A1A1A]"
              style={{
                background: on ? '#E9B44C' : 'transparent',
                color: on ? '#1A1A1A' : undefined,
                fontWeight: on ? 700 : 600,
                fontFamily: indic ? chipFont(lang) : undefined,
              }}
            >
              {item.label}
            </button>
          )
        })}
      </div>
      {tab === 'upcoming' ? (
        <ReminderList rows={upcoming} lang={lang} empty={t.noUpcomingReminders || 'Nothing coming up.'} onOpen={onOpen} />
      ) : (
        <ReminderList rows={past} lang={lang} empty={t.noPastReminders || 'No past reminders.'} onOpen={onOpen} />
      )}
    </div>
  )
}

export default function HomeScreen(props: HomeProps) {
  const { t, selectedLang, recent } = props
  const [renameItem, setRenameItem] = useState<RecentResult | null>(null)
  const [remindersOpen, setRemindersOpen] = useState(false)
  const [dark, setDark] = useState(readDarkTheme)
  useEffect(() => {
    const sync = () => setDark(readDarkTheme())
    window.addEventListener('sarvam-theme', sync)
    return () => window.removeEventListener('sarvam-theme', sync)
  }, [])
  const [reminderTab, setReminderTab] = useState<'upcoming' | 'past'>('upcoming')
  const indic = selectedLang !== 'en' && selectedLang !== 'auto'
  ensureOnboardingFonts()
  useEffect(() => {
    if (remindersOpen) window.scrollTo(0, 0)
  }, [remindersOpen])
  if (props.library) return <AllDocuments {...props} />
  if (remindersOpen) {
    return (
      <RemindersPage
        t={t}
        lang={selectedLang}
        indic={indic}
        tab={reminderTab}
        onTab={setReminderTab}
        upcoming={props.upcomingReminders}
        past={props.pastReminders}
        onBack={() => setRemindersOpen(false)}
        onOpen={(id) => { setRemindersOpen(false); props.onOpenReminder(id) }}
      />
    )
  }
  const offlineBanner = !props.isOnline ? (
    <div className="rounded-[24px] border-[1.5px] border-[#1A1A1A] bg-[#FBEBC4] px-4 py-3 text-[15px] leading-snug">
      <span className="font-bold">{t.offlineTitle || "You're offline"}. </span>
      {t.offlineBody || 'Your saved results still open. Reading a new document needs the internet.'}
    </div>
  ) : null
  const shown = recent.slice(0, 4)
  return (
    <div className="sv-screen-in bg-[#F4F5F2] text-[#1A1A1A] px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <div className="text-[32px] font-bold tracking-[-1px]">
          Sarvam<span className="text-[#D9603B]">.</span>
        </div>
        <span className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={dark}
            aria-label={dark ? (t.lightTheme || 'Light') : (t.darkTheme || 'Dark')}
            onClick={() => applyDarkTheme(!dark)}
            className="sv-press w-12 h-12 rounded-full border-[1.5px] border-[#1A1A1A] flex items-center justify-center"
          >
            {dark ? <IconSun size={22} /> : <IconMoon size={22} />}
          </button>
        <button
          type="button"
          onClick={props.onA11y}
          aria-label={t.a11yOptions || 'Accessibility options'}
          className="sv-press w-14 h-14 box-border rounded-full border-4 border-[#FADCD1] bg-[#D9603B] flex items-center justify-center shadow-[0_0_0_2px_#1A1A1A]"
        >
          <IconA11y />
        </button>
        </span>
      </header>
      {offlineBanner}

      <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="Language">
        {SUPPORTED_LANGS.map((lang) => {
          const selected = selectedLang === lang.id
          const autoLabel = LANG_LABELS[resolveLang('auto')] || 'English'
          const label = lang.id === 'auto' ? `Auto · ${autoLabel}` : lang.label
          return (
            <button
              key={lang.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => props.onSelectLang(lang.id)}
              className={chipBtn}
              style={{
                background: selected ? '#E9B44C' : 'transparent',
                color: selected ? '#1A1A1A' : undefined,
                fontFamily: chipFont(lang.id === 'auto' ? 'en' : lang.id),
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      <section className="bg-[#1A1A1A] text-[#F4F5F2] rounded-[40px] px-[22px] pt-[26px] pb-6 flex flex-col gap-3">
        <span className="self-start text-[12px] font-bold tracking-[1.2px] text-[#1A1A1A] bg-[#D9603B] px-3 py-1.5 rounded-[14px]">
          {t.heroTag || '9 INDIAN LANGUAGES · TEXT + VOICE'}
        </span>
        <h1 className={indic ? 'sv-indic m-0 text-[30px] leading-[1.45] font-semibold break-words' : 'sv-display m-0 mt-0.5 text-[44px] leading-none tracking-[-0.6px]'}>
          {t.hello}
        </h1>
        <p className="m-0 text-[15.5px] leading-[1.4] text-[#D3D7D2]">
          {t.heroSub || 'Snap any letter, bill or report. Sarvam explains it simply, in your language.'}
        </p>
      </section>

      {props.nextUp && (
        <div className="flex items-stretch gap-1 py-3.5 pl-4 pr-2 border-[1.5px] border-[#1A1A1A] rounded-[28px] bg-[#F8D9CB] text-[#1A1A1A]">
          <button
            type="button"
            onClick={props.onOpenNext}
            className="sv-press flex items-center gap-3.5 flex-1 min-w-0 text-left"
          >
            <span className="w-[46px] h-[46px] shrink-0 rounded-full bg-[#D9603B] border-[1.5px] border-[#1A1A1A] box-border flex items-center justify-center">
              <IconCalendar size={22} stroke="#1A1A1A" />
            </span>
            <span className="flex flex-col gap-0.5 flex-1 min-w-0">
              <span className="text-[12px] font-bold tracking-[1px]">
                {(t.nextUp || 'Next up')} · {formatWhen(props.nextUp.date, props.nextUp.time, selectedLang)}
              </span>
              <span className="text-[15px] font-medium leading-[1.3] line-clamp-2">{props.nextUp.summary}</span>
              {props.nextUp.documentName && (
                <span className="text-[12px] text-[#575B58] truncate">{props.nextUp.documentName}</span>
              )}
            </span>
          </button>
          <span className="flex flex-col items-end justify-between shrink-0">
            <button
              type="button"
              aria-label={t.dismiss || 'Dismiss'}
              onClick={() => props.onDismissNext(props.nextUp!.id)}
              className="sv-press w-9 h-9 rounded-full flex items-center justify-center"
            >
              <IconClose size={16} stroke="#1A1A1A" />
            </button>
            {props.upcomingCount > 1 && (
              <button
                type="button"
                onClick={() => { setReminderTab('upcoming'); setRemindersOpen(true) }}
                className="text-[12px] font-bold underline px-1 pb-1"
              >
                {t.viewAllCount || 'View all'}
              </button>
            )}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <button type="button" onClick={props.onTakePhoto} className="sv-press flex items-center gap-4 p-5 border-[1.5px] border-[#1A1A1A] rounded-[32px] bg-[#034F46] text-[#F4F5F2] text-left">
          <span className="w-14 h-14 rounded-full bg-[#E9B44C] border-[1.5px] border-[#1A1A1A] box-border shrink-0 flex items-center justify-center">
            <IconCamera size={26} stroke="#1A1A1A" />
          </span>
          <span className="flex flex-col gap-1 flex-1">
            <span className="text-[20px] font-bold">{t.takePhoto}</span>
            <span className="text-[14px] text-[#CFE5E0] leading-[1.3]">{t.takePhotoSub}</span>
          </span>
          <IconChevron size={20} stroke="#F4F5F2" />
        </button>
        <button type="button" onClick={props.onChooseFiles} className="sv-press flex items-center gap-4 py-4 px-5 border-[1.5px] border-[#1A1A1A] rounded-[32px] bg-[#F4F5F2] text-[#1A1A1A] text-left">
          <span className="w-14 h-14 rounded-full bg-[#CFE5E0] shrink-0 flex items-center justify-center">
            <IconFile size={24} stroke="#034F46" />
          </span>
          <span className="flex flex-col gap-0.5 flex-1">
            <span className="text-[18px] font-bold">{t.chooseFiles || 'Choose files'}</span>
            <span className="text-[14px] text-[#575B58]">{t.chooseFileSub}</span>
          </span>
          <IconChevron size={20} stroke="#1A1A1A" />
        </button>
        {props.onChooseFolder && (
          <button type="button" onClick={props.onChooseFolder} className="sv-press hidden sm:flex h-11 items-center justify-center rounded-full border-[1.5px] border-[#1A1A1A] text-[14px] font-semibold">
            {t.chooseFolder || 'Choose folder'}
          </button>
        )}
        <p className="m-0 flex gap-2 items-start text-[13px] leading-[1.4] text-[#575B58] px-1.5">
          <IconInfo size={16} stroke="#575B58" className="shrink-0 mt-px" />
          <span>{t.aiTranslationDisclaimer}</span>
        </p>
      </div>

      <div className="flex items-baseline justify-between mt-1.5">
        <h2 className="sv-display m-0 text-[27px] tracking-[-0.3px]">
          {t.samples || 'Try a sample'}
          <span className="text-[#D9603B]">.</span>
        </h2>
        <span className="text-[13px] text-[#575B58]">{t.sampleHint || 'Tap to see how it works'}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {HOME_SAMPLES.map((s) => (
          <button
            key={s.file}
            type="button"
            onClick={() => props.onSample(s.file)}
            className="sv-press flex flex-col items-start gap-3 p-4 border-[1.5px] border-[#1A1A1A] rounded-[28px] bg-[#F4F5F2] text-[#1A1A1A] text-left min-h-[156px] box-border"
          >
            <span className="flex w-full items-center justify-between">
              <span
                className="w-[46px] h-[46px] box-border rounded-full border-[1.5px] border-[#1A1A1A] flex items-center justify-center"
                style={{ background: s.bg }}
              >
                <DocIcon name={s.icon} stroke={s.ink} />
              </span>
              <span className="text-[11px] font-bold tracking-[0.8px] px-2 py-1 rounded-lg border-[1.5px] border-[#1A1A1A]">
                {s.kind}
              </span>
            </span>
            <span className="flex flex-col gap-[3px]">
              <span className="text-[16px] font-bold leading-[1.35] break-words" style={indic ? { fontFamily: chipFont(selectedLang) } : undefined}>{t[s.titleKey] || s.title}</span>
              <span className="text-[13px] text-[#575B58]">{t[s.subKey] || s.sub}</span>
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => props.onSample(HEALTH_SAMPLE)}
        className="sv-press flex items-center gap-4 p-4 border-[1.5px] border-[#1A1A1A] rounded-[28px] bg-[#F4F5F2] text-[#1A1A1A] text-left"
      >
        <span aria-hidden="true" className="relative w-[66px] h-[74px] shrink-0">
          <span className="absolute left-0 top-2.5 w-11 h-[58px] box-border border-[1.5px] border-[#1A1A1A] rounded-[10px] bg-[#E9B44C] -rotate-[8deg]" />
          <span className="absolute left-[11px] top-[5px] w-11 h-[58px] box-border border-[1.5px] border-[#1A1A1A] rounded-[10px] bg-[#F8D9CB] -rotate-[2deg]" />
          <span className="absolute left-[22px] top-0 w-11 h-[58px] box-border border-[1.5px] border-[#1A1A1A] rounded-[10px] bg-[#034F46] rotate-[5deg] flex flex-col gap-[5px] p-2.5 px-2">
            <span className="h-[3px] rounded-sm bg-[#CFE5E0]" />
            <span className="h-[3px] w-[70%] rounded-sm bg-[#CFE5E0]" />
            <span className="h-[3px] rounded-sm bg-[#CFE5E0]" />
          </span>
        </span>
        <span className="flex flex-col gap-1 flex-1 min-w-0">
          <span className="self-start text-[11px] font-bold tracking-[0.8px] px-2 py-1 rounded-lg border-[1.5px] border-[#1A1A1A]">
            PDF · 5 PAGES
          </span>
          <span className="text-[16px] font-bold leading-[1.35] break-words" style={indic ? { fontFamily: chipFont(selectedLang) } : undefined}>{t.healthCheckup || 'Health checkup'}</span>
          <span className="text-[13px] text-[#575B58] leading-[1.3]">
            {t.healthCheckupSub || 'Lab report, prescription and bill in one file, split for you'}
          </span>
        </span>
        <IconChevron size={18} stroke="#1A1A1A" className="shrink-0" />
      </button>

      <div className="flex items-baseline justify-between mt-1.5">
        <h2 className="sv-display m-0 text-[27px] tracking-[-0.3px]">
          {t.recent || 'Recent on this phone'}
          <span className="text-[#D9603B]">.</span>
        </h2>
        {recent.length > 0 && (
          <button type="button" onClick={props.onDeleteAll} className="border-0 bg-transparent py-2.5 whitespace-nowrap font-bold text-[14px] text-[#B3361A]">
            {t.deleteAll || 'Delete all'}
          </button>
        )}
      </div>
      {shown.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {shown.map((item) => (
            <RecentRow
              key={item.id}
              item={item}
              lang={selectedLang}
              onOpen={() => props.onOpenRecent(item)}
              onRemove={(e) => props.onRemoveRecent(e, item)}
              renameLabel={t.rename || 'Rename'}
              onRename={props.onRenameRecent ? (e) => { e.stopPropagation(); setRenameItem(item) } : undefined}
            />
          ))}
          {recent.length >= 5 && (
            <button
              type="button"
              onClick={props.onOpenLibrary}
              className="sv-press h-[52px] box-border rounded-full border-[1.5px] border-[#1A1A1A] flex items-center justify-center gap-2.5 text-[#1A1A1A] text-[15.5px] font-bold"
            >
              {t.viewAllDocuments || 'View all documents'}
              <span className="min-w-7 h-6 px-2 box-border rounded-xl bg-[#1A1A1A] text-[#F4F5F2] inline-flex items-center justify-center text-[12.5px]">
                {recent.length}
              </span>
              <IconArrow size={16} stroke="#1A1A1A" />
            </button>
          )}
        </div>
      )}

      <label className="flex items-center gap-3.5 bg-[#F4F5F2] border-[1.5px] border-[#1A1A1A] rounded-[28px] py-4 px-[18px] cursor-pointer relative">
        <span className="flex flex-col gap-[3px] flex-1">
          <span className="text-[16px] font-bold">{t.saveRecentSetting || 'Save results on this phone'}</span>
          <span className="text-[13px] text-[#575B58]">{t.savedOnThisPhoneOnly}</span>
        </span>
        <input
          type="checkbox"
          checked={props.saveEnabled}
          aria-label={t.saveRecentSetting || 'Save results on this phone'}
          onChange={(e) => props.onToggleSave(e.target.checked)}
          className="absolute opacity-0 w-px h-px"
        />
        <span aria-hidden="true" className="w-[54px] h-8 box-border rounded-2xl border-[1.5px] border-[#1A1A1A] relative shrink-0" style={{ background: props.saveEnabled ? '#034F46' : '#E2E5E0' }}>
          <span
            className="absolute top-0.5 w-6 h-6 rounded-full bg-[#E9B44C]"
            style={{ right: props.saveEnabled ? 2 : 'auto', left: props.saveEnabled ? 'auto' : 2 }}
          />
        </span>
      </label>

      <section className="box-border bg-[#034F46] text-[#F4F5F2] rounded-[40px] px-[22px] py-[26px] flex flex-col gap-4 relative overflow-hidden">
        <svg aria-hidden="true" width="150" height="150" viewBox="0 0 150 150" className="absolute -right-[30px] -top-[30px]">
          <circle cx="75" cy="75" r="60" fill="none" stroke="#2E6E64" strokeWidth="2" strokeDasharray="3 8" />
          <circle cx="75" cy="75" r="38" fill="none" stroke="#2E6E64" strokeWidth="2" />
        </svg>
        <span className="w-[52px] h-[52px] rounded-full bg-[#D9603B] border-[1.5px] border-[#1A1A1A] box-border flex items-center justify-center">
          <IconLock size={24} stroke="#1A1A1A" />
        </span>
        <h2 className={indic ? 'sv-indic m-0 text-[28px] leading-[1.4] font-semibold' : 'sv-display m-0 text-[34px] leading-none'}>{t.privateTitle || 'Private by design.'}</h2>
        <div className="flex flex-col gap-2.5 text-[15px] leading-[1.35]">
          <span className="flex gap-2.5 items-start">
            <IconTick size={18} stroke="#D9603B" className="shrink-0 mt-px" />
            {t.privacyCloud || 'Your document is read on Google Cloud and not stored.'}
          </span>
          <span className="flex gap-2.5 items-start">
            <IconTick size={18} stroke="#D9603B" className="shrink-0 mt-px" />
            {t.privacyRating || 'If you rate a result, only the rating is saved.'}
          </span>
        </div>
      </section>

      <RenameDialog
        key={renameItem?.id || 'none'}
        item={renameItem}
        t={t}
        onClose={() => setRenameItem(null)}
        onSave={(name) => {
          if (renameItem) props.onRenameRecent?.(renameItem, name)
          setRenameItem(null)
        }}
      />
    </div>
  )
}

const FILTERS: { id: 'all' | FilterGroup; key: string; label: string }[] = [
  { id: 'all', key: 'filterAll', label: 'All' },
  { id: 'health', key: 'filterHealth', label: 'Health' },
  { id: 'money', key: 'filterMoney', label: 'Money' },
  { id: 'bills', key: 'filterBills', label: 'Bills' },
  { id: 'notices', key: 'filterNotices', label: 'Notices' },
  { id: 'legal', key: 'filterLegal', label: 'Legal' },
  { id: 'forms', key: 'filterForms', label: 'Forms' },
]

function AllDocuments(props: HomeProps) {
  const [q, setQ] = useState('')
  const [renameItem, setRenameItem] = useState<RecentResult | null>(null)
  const [filter, setFilter] = useState<'all' | FilterGroup>('all')
  const { t, recent, selectedLang } = props
  const counts = { all: recent.length, health: 0, money: 0, bills: 0, notices: 0, legal: 0, forms: 0 }
  for (const item of recent) {
    const g = filterGroup(String(item.result?.doc_type || ''), item.title)
    if (g) counts[g] += 1
  }
  const query = q.trim().toLowerCase()
  const filtered = recent.filter((item) => {
    const doc = String(item.result?.doc_type || '')
    const g = filterGroup(doc, item.title)
    if (filter !== 'all' && g !== filter) return false
    if (!query) return true
    const type = getLocalisedDocType(selectedLang, doc).toLowerCase()
    const name = `${item.displayName || ''} ${item.title}`.toLowerCase()
    return name.includes(query) || type.includes(query) || doc.includes(query)
  })
  const groups: { label: string; items: RecentResult[] }[] = []
  for (const item of filtered) {
    const label = groupLabel(item.timestamp, t, selectedLang)
    const last = groups[groups.length - 1]
    if (!last || last.label !== label) groups.push({ label, items: [item] })
    else last.items.push(item)
  }
  return (
    <div className="sv-screen-in bg-[#F4F5F2] text-[#1A1A1A] px-5 pt-4 pb-8 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button type="button" aria-label={t.backHome || 'Back to Home'} onClick={props.onCloseLibrary} className="sv-press w-12 h-12 shrink-0 box-border rounded-full border-[1.5px] border-[#1A1A1A] flex items-center justify-center bg-transparent">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <span className="flex-1" />
        <button type="button" onClick={props.onDeleteAll} className="sv-press h-11 px-4 rounded-full border-[1.5px] border-[#1A1A1A] bg-transparent font-semibold text-[14px] text-[#B3361A]">
          {t.deleteAll || 'Delete all'}
        </button>
      </div>
      <div className="flex items-baseline justify-between">
        <h1 className="sv-display m-0 text-[42px] leading-none tracking-[-0.5px]">
          {t.allDocuments || 'All documents'}
          <span className="text-[#D9603B]">.</span>
        </h1>
        <span className="text-[14px] font-semibold text-[#575B58]">
          {(t.nSaved || '{n} saved').replace('{n}', String(recent.length))}
        </span>
      </div>
      <div className="flex items-center gap-2.5 h-[52px] box-border px-4 border-[1.5px] border-[#1A1A1A] rounded-full relative">
        <IconSearch size={20} stroke="#1A1A1A" />
        <label htmlFor="doc-search" className="absolute w-px h-px overflow-hidden">
          {t.searchDocuments || 'Search your documents'}
        </label>
        <input
          id="doc-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.searchPlaceholder || 'Search by name or type'}
          className="flex-1 min-w-0 border-0 bg-transparent font-medium text-[15.5px] text-[#1A1A1A] outline-none"
        />
      </div>
      <div className="chips flex gap-2 overflow-x-auto -mr-5 pr-5">
        {FILTERS.filter((f) => f.id === 'all' || counts[f.id] > 0).map((f) => {
          const n = counts[f.id]
          const on = filter === f.id
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className="sv-press shrink-0 h-10 px-4 rounded-full border-[1.5px] border-[#1A1A1A] text-[14px] text-[#1A1A1A]"
              style={{ background: on ? '#E9B44C' : 'transparent', color: on ? '#1A1A1A' : undefined, fontWeight: on ? 700 : 600 }}
            >
              {t[f.key] || f.label} {n}
            </button>
          )
        })}
      </div>
      {groups.length === 0 && (
        <p className="text-[15px] text-[#575B58] m-0">{t.noDocumentsMatch || 'No documents match'}</p>
      )}
      {groups.map((g) => (
        <div key={g.label} className="flex flex-col gap-2.5">
          <span className="text-[12.5px] font-bold tracking-[1.2px] text-[#575B58] mt-1">{g.label}</span>
          {g.items.map((item) => (
            <RecentRow
              key={item.id}
              item={item}
              lang={selectedLang}
              onOpen={() => props.onOpenRecent(item)}
              onRemove={(e) => props.onRemoveRecent(e, item)}
              renameLabel={t.rename || 'Rename'}
              onRename={props.onRenameRecent ? (e) => { e.stopPropagation(); setRenameItem(item) } : undefined}
            />
          ))}
        </div>
      ))}
      <RenameDialog
        key={renameItem?.id || 'none'}
        item={renameItem}
        t={t}
        onClose={() => setRenameItem(null)}
        onSave={(name) => {
          if (renameItem) props.onRenameRecent?.(renameItem, name)
          setRenameItem(null)
        }}
      />
    </div>
  )
}
