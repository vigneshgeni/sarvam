import { useState } from 'react'
import type { UserProfile } from '../../types'
import { getSection } from '../../i18n'
import { sanitizeProfileForStorage } from './formMath.js'

interface MyDetailsSheetProps {
  isOpen: boolean
  lang: string
  initialProfile: UserProfile | null
  onSave: (profile: UserProfile) => void
  onClose: () => void
  canSkip?: boolean
}

export default function MyDetailsSheet({
  isOpen,
  lang,
  initialProfile,
  onSave,
  onClose,
  canSkip = true,
}: MyDetailsSheetProps) {
  const ff = getSection(lang, 'formFill')

  const [fullName, setFullName] = useState(initialProfile?.fullName || '')
  const [dob, setDob] = useState(initialProfile?.dob || '')
  const [mobile, setMobile] = useState(initialProfile?.mobile || '')
  const [addressLine, setAddressLine] = useState(initialProfile?.addressLine || '')
  const [city, setCity] = useState(initialProfile?.city || '')
  const [stateVal, setStateVal] = useState(initialProfile?.state || '')
  const [pin, setPin] = useState(initialProfile?.pin || '')
  const [occupation, setOccupation] = useState(initialProfile?.occupation || '')
  const [fatherOrSpouseName, setFatherOrSpouseName] = useState(initialProfile?.fatherOrSpouseName || '')
  const [nomineeName, setNomineeName] = useState(initialProfile?.nomineeName || '')
  const [nomineeRelation, setNomineeRelation] = useState(initialProfile?.nomineeRelation || '')
  const [saveIds, setSaveIds] = useState(Boolean(initialProfile?.saveIds))
  const [pan, setPan] = useState(initialProfile?.pan || '')
  const [aadhaar, setAadhaar] = useState(initialProfile?.aadhaar || '')

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const clean = sanitizeProfileForStorage({
      id: 'me',
      fullName,
      dob,
      mobile,
      addressLine,
      city,
      state: stateVal,
      pin,
      occupation,
      fatherOrSpouseName,
      nomineeName,
      nomineeRelation,
      saveIds,
      pan: saveIds ? pan : '',
      aadhaar: saveIds ? aadhaar : '',
    })
    onSave(clean)
  }

  const inputCls =
    'w-full min-h-[44px] px-3.5 py-2 rounded-[14px] border-[1.5px] border-[#1B1B1B] bg-white text-[15px] text-[#1B1B1B] outline-none focus:border-[#C96846]'

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-end justify-center"
      onClick={canSkip ? onClose : undefined}
      role="presentation"
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={ff.myDetailsTitle || 'My details'}
        data-testid="my-details-sheet"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-[430px] max-h-[88dvh] bg-[#F5F4F2] text-[#1B1B1B] rounded-t-[28px] border-t-[2px] border-[#1B1B1B] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
          <div>
            <h2 className="m-0 text-[20px] font-bold">{ff.myDetailsTitle || 'My details'}</h2>
            <p className="m-0 text-[13px] text-[#5E5E5A]">
              {ff.myDetailsSub || 'Saved only on this phone to fill forms faster.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={ff.close || 'Close'}
            className="w-11 h-11 rounded-full bg-[#EAE7E0] flex items-center justify-center shrink-0"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#1B1B1B" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-2 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            <span>{ff.fullName || 'Full name'}</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} placeholder="e.g. Vignesh S" />
          </label>

          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1 text-[13px] font-semibold">
              <span>{ff.dob || 'Date of birth'}</span>
              <input value={dob} onChange={(e) => setDob(e.target.value)} className={inputCls} placeholder="DD-MM-YYYY" />
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-semibold">
              <span>{ff.mobile || 'Mobile'}</span>
              <input value={mobile} onChange={(e) => setMobile(e.target.value)} className={inputCls} inputMode="tel" placeholder="9876543210" />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            <span>{ff.addressLine || 'Address'}</span>
            <input value={addressLine} onChange={(e) => setAddressLine(e.target.value)} className={inputCls} placeholder="House no, Street, Area" />
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1 text-[13px] font-semibold">
              <span>{ff.city || 'City'}</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} placeholder="Bengaluru" />
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-semibold">
              <span>{ff.state || 'State'}</span>
              <input value={stateVal} onChange={(e) => setStateVal(e.target.value)} className={inputCls} placeholder="Karnataka" />
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-semibold">
              <span>{ff.pin || 'PIN code'}</span>
              <input value={pin} onChange={(e) => setPin(e.target.value)} className={inputCls} inputMode="numeric" maxLength={6} placeholder="560100" />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1 text-[13px] font-semibold">
              <span>{ff.occupation || 'Occupation'}</span>
              <input value={occupation} onChange={(e) => setOccupation(e.target.value)} className={inputCls} placeholder="Salaried" />
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-semibold">
              <span>{ff.fatherOrSpouseName || 'Father or spouse name'}</span>
              <input value={fatherOrSpouseName} onChange={(e) => setFatherOrSpouseName(e.target.value)} className={inputCls} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1 text-[13px] font-semibold">
              <span>{ff.nomineeName || 'Nominee name'}</span>
              <input value={nomineeName} onChange={(e) => setNomineeName(e.target.value)} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-semibold">
              <span>{ff.nomineeRelation || 'Nominee relation'}</span>
              <input value={nomineeRelation} onChange={(e) => setNomineeRelation(e.target.value)} className={inputCls} placeholder="Spouse" />
            </label>
          </div>

          <div className="rounded-[18px] bg-[#D3E5E0] p-3.5 flex flex-col gap-2.5">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="flex flex-col gap-0.5">
                <span className="text-[14px] font-bold text-[#1B1B1B]">
                  {ff.saveIdsSwitch || 'Save ID numbers on this phone'}
                </span>
                <span className="text-[12px] text-[#2E4F49]">
                  {ff.saveIdsHint || 'Optional. PAN and Aadhaar stay on this phone and are never spoken aloud.'}
                </span>
              </span>
              <input
                type="checkbox"
                checked={saveIds}
                onChange={(e) => setSaveIds(e.target.checked)}
                aria-label={ff.saveIdsSwitch || 'Save ID numbers on this phone'}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className="w-[50px] h-7 rounded-full border-[1.5px] border-[#1B1B1B] relative shrink-0 transition-colors"
                style={{ background: saveIds ? '#214D47' : '#EAE7E0' }}
              >
                <span
                  className="absolute top-[2px] w-5 h-5 rounded-full bg-[#E3B660] transition-all"
                  style={{ left: saveIds ? 24 : 3 }}
                />
              </span>
            </label>

            {saveIds && (
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <label className="flex flex-col gap-1 text-[13px] font-semibold">
                  <span>{ff.pan || 'PAN'}</span>
                  <input
                    value={pan}
                    onChange={(e) => setPan(e.target.value.toUpperCase())}
                    className={inputCls}
                    maxLength={10}
                    placeholder="ABCDE1234F"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[13px] font-semibold">
                  <span>{ff.aadhaar || 'Aadhaar'}</span>
                  <input
                    value={aadhaar}
                    onChange={(e) => setAadhaar(e.target.value)}
                    className={inputCls}
                    inputMode="numeric"
                    maxLength={14}
                    placeholder="1234 5678 9012"
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 px-5 py-4 border-t border-[#EAE7E0] shrink-0">
          {canSkip && (
            <button
              type="button"
              onClick={onClose}
              className="sv-press min-h-[48px] px-4 rounded-full border-[2px] border-[#1B1B1B] bg-white text-[15px] font-bold"
            >
              {ff.skipForNow || 'Skip for now'}
            </button>
          )}
          <button
            type="submit"
            data-testid="my-details-save"
            className="sv-press flex-1 min-h-[48px] rounded-full border-[2px] border-[#1B1B1B] bg-[#214D47] text-white text-[15.5px] font-bold"
          >
            {ff.saveDetails || 'Save details'}
          </button>
        </div>
      </form>
    </div>
  )
}
