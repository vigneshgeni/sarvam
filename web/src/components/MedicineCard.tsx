import { useState } from 'react'
import type { MedicineItem, MedicineSlot } from '../types'
import { PillIcon, EyeIcon, CalendarIcon, AlertTriangleIcon } from './icons'
import Sheet from './Sheet'
import { generateIcs, downloadIcs, hashString, type CalendarEventInput } from '../utils/ics'

interface MedicineCardProps {
  medicines?: MedicineItem[]
  resultId: string
  t: Record<string, string>
  onCheckOriginal?: (quote?: string, page?: number) => void
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
}: MedicineCardProps) {
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [userDurations, setUserDurations] = useState<Record<number, number>>({})
  const [selectedSlots, setSelectedSlots] = useState<Record<string, boolean>>(() => {
    // Initialize slot ticks: unticked unless evidence === 'matched' and decoded === true
    const initial: Record<string, boolean> = {}
    if (medicines) {
      medicines.forEach((med, mIdx) => {
        const canTick = med.evidence === 'matched' && med.decoded === true
        med.slots?.forEach((slot) => {
          if (slot !== 'as_needed') {
            initial[`${mIdx}-${slot}`] = canTick
          }
        })
      })
    }
    return initial
  })

  const [slotTimes, setSlotTimes] = useState<Record<string, string>>(() => {
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
  const hasUncertainMed = medicines.some(
    (m) => m.evidence === 'check_original' || !m.decoded
  )

  const handleToggleSlot = (mIdx: number, slot: string) => {
    const key = `${mIdx}-${slot}`
    setSelectedSlots((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleTimeChange = (mIdx: number, slot: string, time: string) => {
    const key = `${mIdx}-${slot}`
    setSlotTimes((prev) => ({ ...prev, [key]: time }))
  }

  const handleSetDuration = (mIdx: number, days: number) => {
    setUserDurations((prev) => ({ ...prev, [mIdx]: days }))
  }

  const handleExportIcs = () => {
    const events: CalendarEventInput[] = []
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    const dateStr = `${yyyy}-${mm}-${dd}`

    medicines.forEach((med, mIdx) => {
      const days = med.duration_days || userDurations[mIdx] || 5
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
    setIsSheetOpen(false)
  }

  return (
    <>
      {/* Medicine Reminders Overview Card */}
      <div className="w-full bg-[#FFFFFF] border border-[#E6E6E1] rounded-[22px] p-5 flex flex-col gap-4 shadow-sm animate-card-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#ECEBFA] text-[#5B52D6] flex items-center justify-center shrink-0">
              <PillIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-[#15171A]">
                {t.medicineReminders || 'Medicine reminders'}
              </h3>
              <p className="text-xs text-[#5E636B]">
                {medicines.length} {medicines.length === 1 ? 'medicine' : 'medicines'} detected
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsSheetOpen(true)}
            className="btn-press px-3.5 py-1.5 bg-[#5B52D6] text-white text-xs font-semibold rounded-xl hover:bg-[#483EB8] transition-colors"
          >
            {t.addReminders || 'Add reminders'}
          </button>
        </div>

        {/* Medicines List Preview */}
        <div className="divide-y divide-[#F0F0EB]">
          {medicines.map((med, idx) => (
            <div key={idx} className="py-2.5 first:pt-0 last:pb-0 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-[#15171A]">
                  {med.name} {med.strength_text ? `(${med.strength_text})` : ''}
                </span>
                <span className="text-xs font-mono bg-[#F0F0EB] px-2 py-0.5 rounded text-[#5E636B]">
                  {med.frequency_raw}
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs text-[#5E636B]">
                {med.food_timing && (
                  <span>
                    {med.food_timing === 'before_food'
                      ? t.beforeFood || 'Before food'
                      : t.afterFood || 'After food'}
                  </span>
                )}
                {med.duration_days && (
                  <span>· {med.duration_days} days</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Configuration & Confirmation Sheet */}
      <Sheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        title={t.medicineReminders || 'Medicine reminders'}
        maxHeight="max-h-[92vh]"
      >
        <div className="flex flex-col gap-5 pt-2">
          <div>
            <h2 className="text-lg font-bold text-[#15171A]">
              {t.medicineReminders || 'Medicine reminders'}
            </h2>
            <p className="text-xs text-[#5E636B] mt-0.5">
              Review times and tap Add to Calendar to save reminders to your device.
            </p>
          </div>

          {/* Uncertainty banner if check_original or !decoded */}
          {hasUncertainMed && (
            <div className="bg-[#FFF4DE] border border-[#F4DDB0] rounded-xl p-3 flex items-start gap-2.5 text-xs text-[#5A3500]">
              <AlertTriangleIcon className="w-4 h-4 text-[#C2410C] shrink-0 mt-0.5" />
              <span>
                {t.medicineCheckWarning ||
                  'Check these against your prescription before adding'}
              </span>
            </div>
          )}

          {/* Per Medicine Configuration */}
          <div className="flex flex-col gap-4">
            {medicines.map((med, mIdx) => {
              const duration = med.duration_days || userDurations[mIdx]

              return (
                <div
                  key={mIdx}
                  className="bg-[#FBF7EF] border border-[#F1EBDD] rounded-2xl p-4 flex flex-col gap-3"
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
                    <span className="text-xs font-medium text-[#5B52D6]">
                      {med.food_timing === 'before_food'
                        ? t.beforeFood || 'Before food'
                        : t.afterFood || 'After food'}
                    </span>
                  )}

                  {/* as_needed or slot checkboxes */}
                  {med.slots?.includes('as_needed') ? (
                    <div className="text-xs text-[#5E636B] italic">
                      {t.takeOnlyWhenNeeded || 'Take only when needed, no reminder'}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 pt-1">
                      <span className="text-xs font-medium text-[#5E636B]">
                        Reminder slots:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {med.slots?.map((slot) => {
                          const slotKey = `${mIdx}-${slot}`
                          const isTicked = !!selectedSlots[slotKey]
                          const timeVal = slotTimes[slotKey] || DEFAULT_SLOT_TIMES[slot]

                          return (
                            <label
                              key={slot}
                              className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-[#E6E6E1] cursor-pointer hover:border-[#5B52D6]"
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isTicked}
                                  onChange={() => handleToggleSlot(mIdx, slot)}
                                  className="w-4 h-4 text-[#5B52D6] rounded border-[#E6E6E1] focus:ring-0"
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
                  {med.duration_days === null && !med.slots?.includes('as_needed') && (
                    <div className="flex flex-col gap-1.5 pt-1">
                      <span className="text-xs font-medium text-[#5E636B]">
                        {t.chooseDuration || 'Choose duration (days):'}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {DURATION_CHIPS.map((days) => (
                          <button
                            key={days}
                            type="button"
                            onClick={() => handleSetDuration(mIdx, days)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                              duration === days
                                ? 'bg-[#5B52D6] text-white'
                                : 'bg-white border border-[#E6E6E1] text-[#15171A]'
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
              className="btn-press w-full py-3 bg-[#5B52D6] text-white font-semibold rounded-2xl flex items-center justify-center gap-2 hover:bg-[#483EB8] transition-colors"
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
