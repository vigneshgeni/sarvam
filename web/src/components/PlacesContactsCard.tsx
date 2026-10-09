import { useState } from 'react'
import type { PlaceItem, ContactItem } from '../types'
import {
  MapPinIcon,
  NavigationIcon,
  PhoneIcon,
  MailIcon,
  CopyIcon,
  CheckIcon,
  EyeIcon,
} from './icons'

interface PlacesContactsCardProps {
  places?: PlaceItem[]
  contacts?: ContactItem[]
  t: Record<string, string>
  onCheckOriginal?: (quote?: string, page?: number) => void
}

export default function PlacesContactsCard({
  places,
  contacts,
  t,
  onCheckOriginal,
}: PlacesContactsCardProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [openMapIndex, setOpenMapIndex] = useState<number | null>(null)

  const hasPlaces = places && places.length > 0
  const hasContacts = contacts && contacts.length > 0

  if (!hasPlaces && !hasContacts) return null

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text).catch(() => {})
    setCopiedKey(key)
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev))
    }, 2000)
  }

  const mapsEmbedKey = import.meta.env.VITE_MAPS_EMBED_KEY

  return (
    <div className="w-full bg-[#FDECE6] border border-[#F3B8A6] rounded-[22px] p-5 flex flex-col gap-5 text-[#7A2E1B] animate-card-in">
      {/* Places Subsection */}
      {hasPlaces && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#C2410C]/15 text-[#C2410C] flex items-center justify-center shrink-0">
              <MapPinIcon className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-base text-[#7A2E1B] tracking-tight">
              {t.places || 'Places'}
            </h3>
          </div>

          <div className="flex flex-col gap-3">
            {places.map((place, idx) => {
              const enc = encodeURIComponent(place.address)
              const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${enc}`
              const dirUrl = `https://www.google.com/maps/dir/?api=1&destination=${enc}`
              const isMapOpen = openMapIndex === idx
              const copyId = `place-${idx}`

              return (
                <div
                  key={idx}
                  className="bg-white/80 rounded-2xl p-4 border border-[#F3B8A6]/70 flex flex-col gap-2.5"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-sm text-[#15171A]">
                      {place.label}
                    </span>
                    <p className="text-xs text-[#5E636B] leading-relaxed">
                      {place.address}
                    </p>
                  </div>

                  {/* Evidence chip */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {place.evidence === 'matched' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0E5B37] bg-[#E4F3EC] px-2 py-0.5 rounded-md">
                        <CheckIcon className="w-3 h-3 text-[#0E5B37]" />
                        {t.foundInDoc || 'Found in your document'}
                      </span>
                    )}
                    {place.evidence === 'check_original' && (
                      <button
                        type="button"
                        onClick={() => onCheckOriginal?.(place.quote, place.page)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[#475A7A] bg-[#EAEFF7] px-2 py-0.5 rounded-md hover:bg-[#DCE5F2] transition-colors"
                      >
                        <EyeIcon className="w-3 h-3 text-[#475A7A]" />
                        {t.checkAgainstOriginal || 'Check against original'}
                      </button>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-press inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#C2410C] text-white text-xs font-semibold rounded-lg hover:bg-[#9C340A] transition-colors"
                    >
                      <MapPinIcon className="w-3.5 h-3.5" />
                      {t.openInMaps || 'Open in Maps'}
                    </a>

                    <a
                      href={dirUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-press inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-[#C2410C] border border-[#F3B8A6] text-xs font-semibold rounded-lg hover:bg-[#FDECE6] transition-colors"
                    >
                      <NavigationIcon className="w-3.5 h-3.5" />
                      {t.directions || 'Directions'}
                    </a>

                    <button
                      type="button"
                      onClick={() => handleCopy(place.address, copyId)}
                      className="btn-press inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-[#5E636B] border border-[#E6E6E1] text-xs font-medium rounded-lg hover:bg-neutral-50 transition-colors"
                    >
                      <CopyIcon className="w-3.5 h-3.5" />
                      {copiedKey === copyId ? t.copied || 'Copied!' : t.copyText || 'Copy'}
                    </button>

                    {/* Opt-in Google Maps Embed only if VITE_MAPS_EMBED_KEY */}
                    {mapsEmbedKey && (
                      <button
                        type="button"
                        onClick={() => setOpenMapIndex(isMapOpen ? null : idx)}
                        className="btn-press inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-[#C2410C] border border-[#F3B8A6] text-xs font-medium rounded-lg hover:bg-[#FDECE6] transition-colors"
                      >
                        {isMapOpen ? t.hideMap || 'Hide map' : t.showMap || 'Show map'}
                      </button>
                    )}
                  </div>

                  {/* Embedded Map Frame (Only upon explicit user tap) */}
                  {mapsEmbedKey && isMapOpen && (
                    <div className="mt-2 w-full h-48 rounded-xl overflow-hidden border border-[#F3B8A6] bg-neutral-100">
                      <iframe
                        width="100%"
                        height="100%"
                        style={{ border: 0 }}
                        loading="lazy"
                        allowFullScreen
                        referrerPolicy="no-referrer-when-downgrade"
                        src={`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(
                          mapsEmbedKey
                        )}&q=${enc}`}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Contacts Subsection */}
      {hasContacts && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#C2410C]/15 text-[#C2410C] flex items-center justify-center shrink-0">
              <PhoneIcon className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-base text-[#7A2E1B] tracking-tight">
              {t.contacts || 'Contacts'}
            </h3>
          </div>

          <div className="flex flex-col gap-3">
            {contacts.map((contact, idx) => {
              const isEmail = contact.value.includes('@')
              const cleanPhone = contact.value.replace(/[^\d+]/g, '')
              const copyId = `contact-${idx}`

              return (
                <div
                  key={idx}
                  className="bg-white/80 rounded-2xl p-4 border border-[#F3B8A6]/70 flex flex-col gap-2.5"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-sm text-[#15171A]">
                      {contact.label}
                    </span>
                    <span className="text-sm font-medium text-[#7A2E1B]">
                      {contact.value}
                    </span>
                  </div>

                  {/* Evidence chip */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {contact.evidence === 'matched' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0E5B37] bg-[#E4F3EC] px-2 py-0.5 rounded-md">
                        <CheckIcon className="w-3 h-3 text-[#0E5B37]" />
                        {t.foundInDoc || 'Found in your document'}
                      </span>
                    )}
                    {contact.evidence === 'check_original' && (
                      <button
                        type="button"
                        onClick={() => onCheckOriginal?.(contact.quote, contact.page)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[#475A7A] bg-[#EAEFF7] px-2 py-0.5 rounded-md hover:bg-[#DCE5F2] transition-colors"
                      >
                        <EyeIcon className="w-3 h-3 text-[#475A7A]" />
                        {t.checkAgainstOriginal || 'Check against original'}
                      </button>
                    )}
                  </div>

                  {/* Contact Action Buttons */}
                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    {isEmail ? (
                      <a
                        href={`mailto:${contact.value.trim()}`}
                        className="btn-press inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#C2410C] text-white text-xs font-semibold rounded-lg hover:bg-[#9C340A] transition-colors"
                      >
                        <MailIcon className="w-3.5 h-3.5" />
                        {t.email || 'Email'}
                      </a>
                    ) : (
                      <a
                        href={`tel:${cleanPhone}`}
                        className="btn-press inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#C2410C] text-white text-xs font-semibold rounded-lg hover:bg-[#9C340A] transition-colors"
                      >
                        <PhoneIcon className="w-3.5 h-3.5" />
                        {t.call || 'Call'}
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => handleCopy(contact.value, copyId)}
                      className="btn-press inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-[#5E636B] border border-[#E6E6E1] text-xs font-medium rounded-lg hover:bg-neutral-50 transition-colors"
                    >
                      <CopyIcon className="w-3.5 h-3.5" />
                      {copiedKey === copyId ? t.copied || 'Copied!' : t.copyText || 'Copy'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
