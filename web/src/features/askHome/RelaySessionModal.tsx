import type { RelaySessionRecord } from '../../types'
import { getSection, resolveLang } from '../../i18n'

interface RelaySessionModalProps {
  session: RelaySessionRecord | null
  lang: string
  onClose: () => void
}

export default function RelaySessionModal({ session, lang, onClose }: RelaySessionModalProps) {
  if (!session) return null
  const ah = getSection(lang, 'askHome')
  const formattedDate = session.startedAt
    ? new Intl.DateTimeFormat(resolveLang(lang), {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(session.startedAt))
    : ''

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-end justify-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={session.title}
        data-testid="relay-session-viewer"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[430px] max-h-[82dvh] bg-[#F5F4F2] text-[#1B1B1B] rounded-t-[28px] border-t-[2px] border-[#1B1B1B] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#EAE7E0]">
          <div className="min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#214D47]">
              {ah.sessionViewerTitle || 'Live Relay session'}
              {formattedDate ? ` · ${formattedDate}` : ''}
            </span>
            <h2 className="m-0 text-[20px] font-bold truncate">{session.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={ah.close || 'Close'}
            className="w-11 h-11 rounded-full bg-[#EAE7E0] flex items-center justify-center shrink-0"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#1B1B1B" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {session.participants && session.participants.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {session.participants.map((p) => (
                <span key={p} className="px-2.5 py-1 rounded-full bg-[#D3E5E0] text-[#214D47] text-[12px] font-bold">
                  {p}
                </span>
              ))}
            </div>
          )}
          {(session.captions || []).map((c, idx) => (
            <div key={c.id || idx} className="rounded-[18px] bg-white border-[1.5px] border-[#1B1B1B] px-3.5 py-2.5">
              {c.speaker && (
                <span className="block text-[11.5px] font-bold uppercase tracking-[0.05em] text-[#C96846] mb-0.5">
                  {c.speaker}
                </span>
              )}
              <p className="m-0 text-[15px] leading-[1.45] text-[#1B1B1B]">{c.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
