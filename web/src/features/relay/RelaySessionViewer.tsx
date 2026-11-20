/**
 * RelaySessionViewer — Read-only saved Live Relay session viewer opened from Recent on Home.
 * Displays participants, saved scanned/pinned pages, and the full speaker-labelled transcript.
 */

import type { RelaySessionRecord } from '../../utils/db.js'

interface RelaySessionViewerProps {
  session: RelaySessionRecord
  onClose: () => void
  t: Record<string, string>
}

export default function RelaySessionViewer({ session, onClose, t }: RelaySessionViewerProps) {
  const formattedDate = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(session.endedAt || session.startedAt))

  return (
    <div
      data-testid="relay-session-viewer"
      style={{
        minHeight: '100dvh',
        background: '#F4F5F2',
        color: '#1B1B1B',
        padding: 'max(18px, env(safe-area-inset-top, 18px)) 20px max(24px, env(safe-area-inset-bottom, 24px))',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        fontFamily: 'DM Sans, system-ui, sans-serif',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          data-testid="relay-session-back"
          onClick={onClose}
          aria-label={t.backHome || 'Back to Home'}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            border: '1.5px solid #1B1B1B',
            background: 'transparent',
            color: '#1B1B1B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flex: 'none',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <span
            style={{
              display: 'inline-block',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.8,
              padding: '2px 8px',
              borderRadius: 999,
              background: '#214D47',
              color: '#F4F5F2',
              marginBottom: 4,
            }}
          >
            {t.liveRelay || 'Live Relay'}
          </span>
          <h1 style={{ margin: 0, fontFamily: 'Fraunces, Georgia, serif', fontSize: 24, lineHeight: 1.2 }}>
            {session.title}
          </h1>
          <div style={{ fontSize: 12.5, color: '#575B58', marginTop: 2 }}>{formattedDate}</div>
        </div>
      </div>

      {/* Participants */}
      {(session.participants?.length || 0) > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(session.participants || []).map((name, idx) => (
            <span
              key={`${name}-${idx}`}
              style={{
                padding: '4px 12px',
                borderRadius: 999,
                background: '#D3E5E0',
                color: '#214D47',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {name}
            </span>
          ))}
        </div>
      )}

      {/* Pages */}
      {(session.pages?.length || 0) > 0 && (
        <section>
          <h2 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: '#575B58' }}>
            Pages ({(session.pages || []).length})
          </h2>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {(session.pages || []).map((p, idx) => (
              <div
                key={p.id}
                style={{
                  width: 110,
                  flex: 'none',
                  borderRadius: 14,
                  overflow: 'hidden',
                  border: '1.5px solid #1B1B1B',
                  background: '#1B1B1B',
                }}
              >
                <img
                  src={p.dataUrl || p.thumbDataUrl}
                  alt={`Page ${idx + 1}`}
                  style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
                />
                <div style={{ padding: '4px 8px', fontSize: 11.5, fontWeight: 700, color: '#F4F5F2' }}>
                  Page {idx + 1}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Read-only Transcript */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: '#575B58' }}>
          Transcript
        </h2>
        {(session.captions?.length || 0) === 0 ? (
          <div style={{ fontSize: 14.5, color: '#575B58', padding: '12px 14px', borderRadius: 18, background: '#EAE7E0' }}>
            No captions were recorded in this session.
          </div>
        ) : (
          (session.captions || []).map((c, idx) => {
            const isGemini = c.speaker === 'Gemini'
            return (
              <div
                key={`${c.ts || idx}-${idx}`}
                style={{
                  padding: '12px 14px',
                  borderRadius: 18,
                  border: '1.5px solid #1B1B1B',
                  background: isGemini ? '#214D47' : '#FFFFFF',
                  color: isGemini ? '#F4F5F2' : '#1B1B1B',
                }}
              >
                <div style={{ fontSize: 11.5, fontWeight: 700, color: isGemini ? '#E3B660' : '#214D47', marginBottom: 4 }}>
                  {c.speaker || 'Speaker'}
                </div>
                <div style={{ fontSize: 15, lineHeight: 1.45 }}>{c.text}</div>
              </div>
            )
          })
        )}
      </section>
    </div>
  )
}
