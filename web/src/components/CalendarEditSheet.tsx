import Sheet from './Sheet'

export interface CalendarDose {
  key: string
  label: string
  time: string
}

interface CalendarEditSheetProps {
  isOpen: boolean
  onClose: () => void
  t: Record<string, string>
  title: string
  date: string
  time: string
  alert: string
  doses?: CalendarDose[]
  onChange: (next: { title: string; date: string; time: string; alert: string }) => void
  onDoseTime?: (key: string, time: string) => void
  onAdd: () => void
}

const ALERTS = [
  ['day', 'alertOnDay', 'On the day, 9 AM'],
  ['1d', 'alertDayBefore', '1 day before'],
  ['3d', 'alert3Days', '3 days before'],
  ['1w', 'alertWeek', '1 week before'],
] as const

export default function CalendarEditSheet({
  isOpen,
  onClose,
  t,
  title,
  date,
  time,
  alert,
  doses,
  onChange,
  onDoseTime,
  onAdd,
}: CalendarEditSheetProps) {
  const many = (doses?.length || 0) > 1
  return (
    <Sheet isOpen={isOpen} onClose={onClose} title={t.editBeforeAdd || 'Edit before adding'} maxHeight="max-h-[88vh]">
      <div className="flex flex-col gap-3 pt-1">
        <p className="m-0 text-[13px] leading-[1.4] text-[#575B58]">
          {t.calendarLineHint || 'Your calendar shows this short line.'}
        </p>
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          {t.reminderTitle || 'Title'}
          <input
            value={title}
            maxLength={60}
            onChange={(e) => onChange({ title: e.target.value, date, time, alert })}
            className="h-11 px-3 rounded-2xl border-[1.5px] border-[#1A1A1A] bg-[#F4F5F2] text-[15px] font-medium"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          {t.reminderDate || 'Date'}
          <input
            type="date"
            value={date}
            onChange={(e) => onChange({ title, date: e.target.value, time, alert })}
            className="h-11 px-3 rounded-2xl border-[1.5px] border-[#1A1A1A] bg-[#F4F5F2] text-[15px] font-medium"
          />
        </label>
        {!many && (
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            {t.reminderTime || 'Time'}
            <input
              type="time"
              value={time}
              onChange={(e) => onChange({ title, date, time: e.target.value, alert })}
              className="sv-med-time h-11 px-3 rounded-2xl border-[1.5px] border-[#1A1A1A] text-[15px] font-medium"
            />
          </label>
        )}
        {many && (
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold">{t.reminderTime || 'Time'}</span>
            {doses?.map((dose) => (
              <label key={dose.key} className="flex items-center justify-between gap-3 text-[14px]">
                <span className="min-w-0 truncate">{dose.label}</span>
                <input
                  type="time"
                  value={dose.time}
                  onChange={(e) => onDoseTime?.(dose.key, e.target.value)}
                  className="sv-med-time h-10 px-2 rounded-xl border-[1.5px] border-[#1A1A1A] text-[14px]"
                />
              </label>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {ALERTS.map(([id, key, fallback]) => (
            <button
              key={id}
              type="button"
              aria-pressed={alert === id}
              onClick={() => onChange({ title, date, time, alert: id })}
              className={`sv-press h-11 rounded-[22px] border-[1.5px] border-[#1A1A1A] text-[13px] ${alert === id ? 'bg-[#E9B44C] font-bold' : 'bg-transparent font-semibold'}`}
            >
              {t[key] || fallback}
            </button>
          ))}
        </div>
        <button type="button" onClick={onAdd} className="sv-press h-14 rounded-full border-[1.5px] border-[#1A1A1A] bg-[#E9B44C] font-bold text-[17px]">
          {t.addToCalendar || 'Add to calendar'}
        </button>
      </div>
    </Sheet>
  )
}
