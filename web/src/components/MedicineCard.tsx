import { useState } from 'react'
import type { MedicineItem, MedicineSlot } from '../types'
import { PillIcon, EyeIcon, CalendarIcon, AlertTriangleIcon } from './icons'
import Sheet from './Sheet'
import { generateIcs, downloadIcs, hashString, type CalendarEventInput } from '../utils/ics'

interface MedicineActivityState {
  slots: Record<string, boolean>
  times: Record<string, string>
  durations: Record<string, number>
}

interface MedicineCardProps {
  medicines?: MedicineItem[]
  resultId: string
  t: Record<string, string>
  onCheckOriginal?: (quote?: string, page?: number) => void
  saved?: MedicineActivityState
  onChange?: (next: MedicineActivityState) => void
  reminderAdded?: boolean
  onReminderAdded?: () => void
}

const DEFAULT_SLOT_TIMES: Record<MedicineSlot, string> = {
  morning: '08:00',
  afternoon: '14:00',
  evening: '18:00',
  night: '21:00',
  bedtime: '22:00',
  as_needed: '',
}

const DURATION_CHIPS = [3, 5, 7, 10, 14, 30]

export default function MedicineCard({
  medicines,
  resultId,
  t,
  onCheckOriginal,
  saved,
  onChange,
  reminderAdded = false,
  onReminderAdded,
}: MedicineCardProps) {
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [userDurations, setUserDurations] = useState<Record<number, number>>(() => saved?.durations || {})
  const [selectedSlots, setSelectedSlots] = useState<Record<string, boolean>>(() => {
    if (saved && Object.keys(saved.slots || {}).length) return saved.slots
    // Initialize slot ticks: unticked unless evidence === 'matched' and decoded === true
    const initial: Record<string, boolean> = {}
    if (medicines) {
      medicines.forEach((med, mIdx) => {
        const canTick = med.decoded === true
        med.slots?.forEach((slot) => {
          if (slot !== 'as_needed') {
            initial[`${mIdx}-${slot}`] = canTick
          }
        })
      })
    }
    return initial
  })

  const publish = (slots: Record<string, boolean>, times: Record<string, string>, durations: Record<string, number>) => {
    onChange?.({ slots, times, durations })
  }

  const [slotTimes, setSlotTimes] = useState<Record<string, string>>(() => {
    if (saved && Object.keys(saved.times || {}).length) return saved.times
    const initial: Record<string, string> = {}
    if (medicines) {
      medicines.forEach((med, mIdx) => {
        med.slots?.forEach((slot) => {
          if (DEFAULT_SLOT_TIMES[slot]) {
            initial[`${mIdx}-${slot}`] = DEFAULT_SLOT_TIMES[slot]
          }
        })
      })
    }
    return initial
  })

  if (!medicines || medicines.length === 0) return null

  // Check if any medicine is unverified or check_original
  const handleToggleSlot = (mIdx: number, slot: string) => {
    const key = `${mIdx}-${slot}`
    setSelectedSlots((prev) => {
      const slots = { ...prev, [key]: !prev[key] }
      publish(slots, slotTimes, userDurations)
      return slots
    })
  }

  const handleTimeChange = (mIdx: number, slot: string, time: string) => {
    const key = `${mIdx}-${slot}`
    setSlotTimes((prev) => {
      const times = { ...prev, [key]: time }
      publish(selectedSlots, times, userDurations)
      return times
    })
  }

  const handleSetDuration = (mIdx: number, days: number) => {
    setUserDurations((prev) => {
      const durations = { ...prev, [mIdx]: days }
      publish(selectedSlots, slotTimes, durations)
      return durations
    })
  }

  const handleExportIcs = () => {
    const events: CalendarEventInput[] = []
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    const dateStr = `${yyyy}-${mm}-${dd}`

    medicines.forEach((med, mIdx) => {
      const days = med.duration_days ?? userDurations[mIdx]
      if (!days) return
      const strength = med.strength_text ? ` ${med.strength_text}` : ''
      const title = `Take ${med.name}${strength}`
      const desc = `From your prescription. Check the original. Sarvam does not give medical advice.`

      med.slots?.forEach((slot) => {
        if (slot === 'as_needed') return
        const slotKey = `${mIdx}-${slot}`
        if (!selectedSlots[slotKey]) return

        const time = slotTimes[slotKey] || DEFAULT_SLOT_TIMES[slot] || '08:00'
        const [hour, min] = time.split(':')
        const startTimestamp = `${dateStr.replace(/-/g, '')}T${hour}${min}00`

        events.push({
          uid: hashString(`${resultId}-med-${mIdx}-${slot}`),
          title,
          description: desc,
          startDate: startTimestamp,
          isAllDay: false,
          rrule: `FREQ=DAILY;COUNT=${days}`,
          alarmTrigger: '-PT0S',
        })
      })
    })

    if (events.length === 0) return

    const icsContent = generateIcs(events)
    downloadIcs('medicine-reminders.ics', icsContent)
    onReminderAdded?.()
    setIsSheetOpen(false)
  }

  return (
    <>
      {/* Medicine Reminders Overview Card */}
      <section className="bg-[#CFE5E0] border-[1.5px] border-[#1A1A1A] rounded-[32px] p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3 px-1">
          <span className="w-10 h-10 rounded-full bg-[#034F46] flex items-center justify-center shrink-0">
            <PillIcon className="w-5 h-5 text-[#F4F5F2]" />
          </span>
          <h2 className="sv-display text-[26px] m-0">
            {t.medicineReminders || 'Medicine reminders'}<span className="text-[#D9603B]">.</span>
          </h2>
        </div>
        <p className="m-0 mx-1 flex gap-2 items-start text-[13.5px] leading-[1.4] bg-[#F4F5F2] border-[1.5px] border-dashed border-[#1A1A1A] rounded-2xl p-2.5">
          <AlertTriangleIcon className="w-4 h-4 text-[#D9603B] shrink-0 mt-0.5" />
          <span>{t.medicineCheckWarning || 'Check these against your prescription before adding. Sarvam does not give medical advice.'}</span>
        </p>
        {medicines.map((med, idx) => {
          const weekly = !med.decoded && /week/i.test(med.frequency_raw || '')
          const sos = med.as_needed || med.frequency_code === 'SOS'
          const food = med.food_timing === 'before_food' ? (t.beforeFood || 'Before food') : med.food_timing === 'after_food' ? (t.afterFood || 'After food') : med.food_timing === 'at_bedtime' ? (t.atBedtime || 'At bedtime') : ''
          return (
            <div key={idx} className="bg-[#F4F5F2] border-[1.5px] border-[#1A1A1A] rounded-[24px] p-3.5 flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[17px] font-bold">{med.name} {med.strength_text && <span className="font-medium text-[#3B3E3C]">{med.strength_text}</span>}</span>
                <span className="font-mono text-[13px] font-bold px-2 py-0.5 border-[1.5px] border-[#1A1A1A] rounded-lg">{med.frequency_raw}</span>
              </div>
              {sos && <span className="text-[13.5px]">{t.onlyWhenNeeded || 'Only when needed'}</span>}
              {weekly && <span className="text-[13.5px]">{t.pickDayTime || 'Pick a day and time'}</span>}
              {!sos && !weekly && (
                <div className="flex flex-wrap gap-1.5">
                  {med.slots.map((slot) => (
                    <span key={slot} className={`inline-flex items-center h-[30px] px-2.5 rounded-full border-[1.5px] border-[#1A1A1A] text-[12.5px] font-bold ${slot === 'morning' ? 'bg-[#E9B44C]' : slot === 'afternoon' ? 'bg-[#F8D9CB]' : 'bg-[#1A1A1A] text-[#F4F5F2]'}`}>
                      {slot} {DEFAULT_SLOT_TIMES[slot]?.replace(/^0/, '')}
                    </span>
                  ))}
                </div>
              )}
              {(food || med.duration_days) && (
                <span className="text-[13.5px] text-[#3B3E3C]">
                  {food}{food && med.duration_days ? ' · ' : ''}{med.duration_days ? `${med.duration_days} ${t.days || 'days'}` : ''}
                </span>
              )}
            </div>
          )
        })}
        <button type="button" onClick={() => { if (!reminderAdded) setIsSheetOpen(true) }} className="sv-press h-[52px] mx-1 rounded-full border-[1.5px] border-[#1A1A1A] bg-[#E9B44C] text-[16px] font-bold">
          {reminderAdded ? (t.added || 'Added') : (t.setMedicineReminders || 'Set medicine reminders')}
        </button>
      </section>

      {/* Configuration & Confirmation Sheet */}
      <Sheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        title={t.medicineReminders || 'Medicine reminders'}
        maxHeight="max-h-[92vh]"
      >
        <div className="flex flex-col gap-3.5 pt-1">
          <h2 className="sv-display text-[27px] leading-none m-0">
            {t.medicineReminders || 'Medicine reminders'}<span className="text-[#D9603B]">.</span>
          </h2>
          <p className="m-0 flex gap-2 items-start text-[13px] leading-[1.4] border-[1.5px] border-dashed border-[#1A1A1A] rounded-2xl p-2.5 bg-[#F8D9CB]">
            <AlertTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{t.medicineTapTime || 'Check every time against your prescription. Tap a time to change it.'}</span>
          </p>

          {/* Per Medicine Configuration */}
          <div className="flex flex-col gap-4">
            {medicines.map((med, mIdx) => {
              const duration = med.duration_days || userDurations[mIdx]

              return (
                <div
                  key={mIdx}
                  className="border-[1.5px] border-[#1A1A1A] rounded-[26px] p-3.5 flex flex-col gap-2.5"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-sm text-[#15171A]">
                        {med.name}
                      </h4>
                      {med.strength_text && (
                        <span className="text-xs text-[#5E636B]">
                          {med.strength_text}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-mono bg-white border border-[#E6E6E1] px-2 py-0.5 rounded text-[#15171A]">
                      {med.frequency_raw}
                    </span>
                  </div>

                  {/* Food Note */}
                  {med.food_timing && (
                    <span className="text-xs font-medium text-[#034F46]">
                      {med.food_timing === 'before_food'
                        ? t.beforeFood || 'Before food'
                        : t.afterFood || 'After food'}
                    </span>
                  )}

                  {/* as_needed or slot checkboxes */}
                  {med.as_needed || med.frequency_code === 'SOS' ? (
                    <div className="text-[13.5px]">{t.onlyWhenNeeded || 'Only when needed'}</div>
                  ) : !med.decoded && /week/i.test(med.frequency_raw || '') ? (
                    <div className="text-[13.5px]">{t.pickDayTime || 'Pick a day and time'}</div>
                  ) : (
                    <div className="flex flex-col gap-2 pt-1">
                      <span className="text-xs font-medium text-[#5E636B]">
                        Reminder slots:
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {med.slots?.map((slot) => {
                          const slotKey = `${mIdx}-${slot}`
                          const isTicked = !!selectedSlots[slotKey]
                          const timeVal = slotTimes[slotKey] || DEFAULT_SLOT_TIMES[slot]

                          return (
                            <label
                              key={slot}
                              className={`flex flex-col items-center gap-1 px-1 py-2 rounded-2xl border-[1.5px] border-[#1A1A1A] cursor-pointer ${isTicked ? (slot === 'morning' ? 'bg-[#E9B44C]' : slot === 'afternoon' ? 'bg-[#F8D9CB]' : 'bg-[#1A1A1A] text-[#F4F5F2]') : 'bg-transparent'}`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isTicked}
                                  onChange={() => handleToggleSlot(mIdx, slot)}
                                  className="w-4 h-4 text-[#034F46] rounded border-[#E6E6E1] focus:ring-0"
                                />
                                <span className="text-xs capitalize font-medium text-[#15171A]">
                                  {slot}
                                </span>
                              </div>

                              <input
                                type="time"
                                value={timeVal}
                                onChange={(e) =>
                                  handleTimeChange(mIdx, slot, e.target.value)
                                }
                                disabled={!isTicked}
                                className="text-xs font-mono bg-neutral-50 border border-neutral-200 rounded px-1.5 py-0.5 disabled:opacity-50"
                              />
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Duration picker if null */}
                  {med.duration_days == null && !(med.as_needed || med.frequency_code === 'SOS') && (
                    <div className="flex flex-col gap-1.5 pt-1">
                      <span className="text-[12.5px] font-bold text-[#B3361A]">
                        {t.howManyDays || "How many days? The prescription doesn't say."}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {DURATION_CHIPS.map((days) => (
                          <button
                            key={days}
                            type="button"
                            onClick={() => handleSetDuration(mIdx, days)}
                            className={`h-[34px] min-w-11 px-2.5 rounded-full border-[1.5px] border-[#1A1A1A] text-[13px] font-bold ${
                              duration === days ? 'bg-[#E9B44C]' : 'bg-transparent'
                            }`}
                          >
                            {days}d
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Evidence quote button */}
                  {med.evidence === 'check_original' && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => onCheckOriginal?.(med.quote, med.page)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[#475A7A] bg-[#EAEFF7] px-2 py-0.5 rounded-md hover:bg-[#DCE5F2]"
                      >
                        <EyeIcon className="w-3 h-3 text-[#475A7A]" />
                        {t.checkAgainstOriginal || 'Check against original'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Add to Calendar Action Button */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleExportIcs}
              className="sv-press w-full h-14 bg-[#E9B44C] border-[1.5px] border-[#1A1A1A] text-[#1A1A1A] font-bold text-[17px] rounded-full flex items-center justify-center gap-2"
            >
              <CalendarIcon className="w-5 h-5" />
              {t.addToCalendar || 'Add to calendar (.ics)'}
            </button>
          </div>
        </div>
      </Sheet>
    </>
  )
}
