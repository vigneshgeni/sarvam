/**
 * RelayIntro — Animated "How Live Relay works" intro before CameraScreen.
 *
 * Design source of truth: docs/buildathon/ui-reference/LiveRelayIntro.dc.html (version 3).
 * - Pure CSS keyframes (relayIntro.css), single 21 s loop (three 7 s scenes)
 * - No camera or microphone permission requested on this screen
 * - "Start scanning" and "Skip" both invoke onStart() synchronously inside the user tap
 * - prefers-reduced-motion shows a static three-step list with zero animations
 * - Focus order: Start scanning, then Skip
 */

import { useEffect } from 'react'
import { getDictionary, resolveLang } from '../../i18n/index.js'
import './relayIntro.css'

interface RelayIntroProps {
  lang?: string
  reduceMotion?: boolean
  onStart: () => void
  onBack: () => void
}

export default function RelayIntro({
  lang = 'en',
  reduceMotion = false,
  onStart,
  onBack,
}: RelayIntroProps) {
  const t = getDictionary(resolveLang(lang))

  // Escape key returns to Home
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onBack()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onBack])

  return (
    <div
      data-testid="relay-intro-screen"
      className={`lr-screen${reduceMotion ? ' lr-reduced-motion' : ''}`}
      role="region"
      aria-label={t.relayIntroHowItWorks}
    >
      <div className="lr-root">
        {/* Top bar (cream background, ink title + mustard BETA badge) */}
        <header className="lr-topbar">
          <div className="lr-brand">
            <span className="lr-brand-title">{t.liveRelay}</span>
            <span className="lr-beta-badge">{t.relayIntroBeta}</span>
          </div>
        </header>

        {/* Rounded Teal Card on Cream Page */}
        <div className="lr-card" data-testid="relay-intro-card">
          {/* Animated stage + copy block + progress dots */}
          <div className="lr-animated-shell" data-testid="relay-intro-animated-shell">
            {/* Decorative stage (aria-hidden; copy below gives screen readers all 3 steps) */}
            <div className="lr-stage" aria-hidden="true" data-testid="relay-intro-stage">
              <div className="lr-stage-inner">
            {/* SCENE 1: Invite sheet, family joins, Gemini joins */}
            <div className="lr-an lr-sc1" style={{ position: 'absolute', inset: 0 }}>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: '#F4F3F1',
                  color: '#1B1B1B',
                  borderRadius: 24,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  boxShadow: '0 18px 40px rgba(0,0,0,0.28)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 30 }}>
                  <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontWeight: 600, fontSize: 21, color: '#214D47' }}>
                    Invite family
                  </span>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      background: '#E3EEEB',
                      color: '#214D47',
                      borderRadius: 999,
                      padding: '4px 10px',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    <span
                      className="lr-live"
                      style={{ width: 7, height: 7, borderRadius: '50%', background: '#2E8B6E', display: 'inline-block' }}
                    />
                    Room open
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 14, height: 108 }}>
                  <div
                    className="lr-an lr-qr"
                    style={{
                      width: 108,
                      height: 108,
                      borderRadius: 12,
                      background: '#FFFFFF',
                      border: '1.5px solid #D9D6CF',
                      padding: 8,
                      flex: 'none',
                    }}
                  >
                    <svg width="90" height="90" viewBox="0 0 25 25" shapeRendering="crispEdges">
                      <path
                        fill="#1B1B1B"
                        d="M0 0h7v1h-7zM8 0h2v1h-2zM11 0h1v1h-1zM13 0h2v1h-2zM16 0h1v1h-1zM18 0h7v1h-7zM0 1h1v1h-1zM6 1h1v1h-1zM8 1h4v1h-4zM13 1h2v1h-2zM18 1h1v1h-1zM24 1h1v1h-1zM0 2h1v1h-1zM2 2h3v1h-3zM6 2h1v1h-1zM9 2h1v1h-1zM11 2h1v1h-1zM13 2h4v1h-4zM18 2h1v1h-1zM20 2h3v1h-3zM24 2h1v1h-1zM0 3h1v1h-1zM2 3h3v1h-3zM6 3h1v1h-1zM9 3h1v1h-1zM12 3h1v1h-1zM14 3h3v1h-3zM18 3h1v1h-1zM20 3h3v1h-3zM24 3h1v1h-1zM0 4h1v1h-1zM2 4h3v1h-3zM6 4h1v1h-1zM9 4h2v1h-2zM12 4h2v1h-2zM16 4h1v1h-1zM18 4h1v1h-1zM20 4h3v1h-3zM24 4h1v1h-1zM0 5h1v1h-1zM6 5h1v1h-1zM12 5h1v1h-1zM14 5h2v1h-2zM18 5h1v1h-1zM24 5h1v1h-1zM0 6h7v1h-7zM8 6h3v1h-3zM15 6h1v1h-1zM18 6h7v1h-7zM10 7h1v1h-1zM13 7h1v1h-1zM15 7h1v1h-1zM3 8h2v1h-2zM6 8h5v1h-5zM12 8h3v1h-3zM16 8h2v1h-2zM22 8h3v1h-3zM2 9h5v1h-5zM8 9h4v1h-4zM18 9h1v1h-1zM23 9h2v1h-2zM0 10h1v1h-1zM2 10h11v1h-11zM15 10h5v1h-5zM22 10h3v1h-3zM0 11h3v1h-3zM4 11h2v1h-2zM8 11h1v1h-1zM10 11h1v1h-1zM15 11h3v1h-3zM21 11h2v1h-2zM4 12h1v1h-1zM6 12h5v1h-5zM13 12h1v1h-1zM17 12h5v1h-5zM0 13h1v1h-1zM3 13h1v1h-1zM8 13h2v1h-2zM11 13h1v1h-1zM14 13h2v1h-2zM18 13h3v1h-3zM23 13h1v1h-1zM2 14h1v1h-1zM4 14h2v1h-2zM10 14h1v1h-1zM13 14h4v1h-4zM18 14h3v1h-3zM22 14h2v1h-2zM1 15h1v1h-1zM6 15h4v1h-4zM11 15h2v1h-2zM15 15h1v1h-1zM19 15h1v1h-1zM21 15h2v1h-2zM3 16h1v1h-1zM8 16h1v1h-1zM10 16h1v1h-1zM15 16h10v1h-10zM11 17h1v1h-1zM14 17h1v1h-1zM16 17h1v1h-1zM20 17h1v1h-1zM23 17h2v1h-2zM0 18h7v1h-7zM9 18h3v1h-3zM13 18h1v1h-1zM15 18h2v1h-2zM18 18h1v1h-1zM20 18h1v1h-1zM24 18h1v1h-1zM0 19h1v1h-1zM6 19h1v1h-1zM8 19h2v1h-2zM11 19h3v1h-3zM16 19h1v1h-1zM20 19h3v1h-3zM24 19h1v1h-1zM0 20h1v1h-1zM2 20h3v1h-3zM6 20h1v1h-1zM8 20h1v1h-1zM12 20h1v1h-1zM14 20h1v1h-1zM16 20h6v1h-6zM23 20h2v1h-2zM0 21h1v1h-1zM2 21h3v1h-3zM6 21h1v1h-1zM8 21h5v1h-5zM14 21h1v1h-1zM16 21h5v1h-5zM23 21h2v1h-2zM0 22h1v1h-1zM2 22h3v1h-3zM6 22h1v1h-1zM9 22h1v1h-1zM11 22h2v1h-2zM14 22h1v1h-1zM18 22h1v1h-1zM22 22h3v1h-3zM0 23h1v1h-1zM6 23h1v1h-1zM8 23h2v1h-2zM11 23h3v1h-3zM17 23h7v1h-7zM0 24h7v1h-7zM10 24h1v1h-1zM12 24h5v1h-5zM18 24h1v1h-1zM20 24h5v1h-5z"
                      />
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#6B6862' }}>ROOM CODE</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(['K', '7', 'Q', 'M'] as const).map((ch, idx) => (
                        <span
                          key={ch}
                          className={`lr-an lr-dg${idx + 1}`}
                          style={{
                            width: 38,
                            height: 50,
                            borderRadius: 10,
                            background: '#E9E6DF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 26,
                            fontWeight: 700,
                          }}
                        >
                          {ch}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 13, lineHeight: '17px', color: '#4A4843' }}>
                      Scan the QR or type the code
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, height: 44 }}>
                  <div
                    className="lr-an lr-wa"
                    style={{
                      flex: 1.4,
                      background: '#E3B660',
                      borderRadius: 999,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  >
                    Share on WhatsApp
                  </div>
                  <div
                    style={{
                      flex: 1,
                      border: '1.5px solid #214D47',
                      color: '#214D47',
                      borderRadius: 999,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  >
                    Copy link
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 26 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>Guests can show their camera</span>
                  <span
                    className="lr-an lr-tg"
                    style={{
                      width: 44,
                      height: 26,
                      borderRadius: 13,
                      background: '#C9C5BC',
                      padding: 3,
                      display: 'block',
                    }}
                  >
                    <span
                      className="lr-an lr-kn"
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: '#FFFFFF',
                        display: 'block',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                      }}
                    />
                  </span>
                </div>

                <div style={{ height: 1, background: '#D9D6CF' }} />

                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#6B6862', marginBottom: 6 }}>
                    IN THE ROOM
                  </div>
                  <div style={{ display: 'flex', gap: 4, height: 34, flexWrap: 'nowrap' }}>
                    <span
                      className="lr-an lr-c1"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        height: 34,
                        padding: '0 8px 0 4px',
                        borderRadius: 999,
                        background: '#E9E6DF',
                        fontSize: 12.5,
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: '#214D47',
                          color: '#F4F3F1',
                          fontSize: 11,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        Y
                      </span>
                      You
                    </span>
                    <span
                      className="lr-an lr-c2"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        height: 34,
                        padding: '0 8px 0 4px',
                        borderRadius: 999,
                        background: '#E9E6DF',
                        fontSize: 12.5,
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: '#C96846',
                          color: '#F4F3F1',
                          fontSize: 11,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        A
                      </span>
                      Amma
                    </span>
                    <span
                      className="lr-an lr-c3"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        height: 34,
                        padding: '0 8px 0 4px',
                        borderRadius: 999,
                        background: '#E9E6DF',
                        fontSize: 12.5,
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: '#3E7068',
                          color: '#F4F3F1',
                          fontSize: 11,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        R
                      </span>
                      Ravi
                    </span>
                    <span
                      className="lr-an lr-c4"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        height: 34,
                        padding: '0 8px 0 4px',
                        borderRadius: 999,
                        background: '#E3B660',
                        fontSize: 12.5,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: '#1B1B1B',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24">
                          <path
                            d="M12 2c.6 5.2 4.8 9.4 10 10-5.2.6-9.4 4.8-10 10-.6-5.2-4.8-9.4-10-10 5.2-.6 9.4-4.8 10-10z"
                            fill="#E3B660"
                          />
                        </svg>
                      </span>
                      Gemini
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* SCENE 2: Live screen, camera on a real object, bilingual captions */}
            <div className="lr-an lr-sc2" style={{ position: 'absolute', inset: 0 }}>
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: '100%',
                  height: 188,
                  borderRadius: 22,
                  overflow: 'hidden',
                  background: 'radial-gradient(120% 100% at 50% 40%, #26332F 0%, #0E1514 72%)',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 28,
                    top: 34,
                    right: 28,
                    height: 128,
                    borderRadius: 16,
                    background: 'linear-gradient(180deg, #D8D5CE 0%, #B4B0A8 100%)',
                    boxShadow:
                      'inset 0 2px 0 rgba(255,255,255,0.55), inset 0 -3px 6px rgba(0,0,0,0.25), 0 14px 30px rgba(0,0,0,0.5)',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: 22,
                      top: 20,
                      width: 124,
                      height: 58,
                      borderRadius: 8,
                      background: '#060908',
                      boxShadow: 'inset 0 0 0 2px #2B2F2E, inset 0 4px 10px rgba(0,0,0,0.8)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span
                      className="lr-led"
                      style={{
                        fontSize: 36,
                        fontWeight: 700,
                        letterSpacing: 5,
                        color: '#FF8A4C',
                        textShadow: '0 0 14px rgba(255,138,76,0.85)',
                        fontFamily: "'DM Sans', monospace",
                      }}
                    >
                      E21
                    </span>
                  </div>
                  <div style={{ position: 'absolute', left: 24, top: 90, display: 'flex', gap: 7 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7E7B74' }} />
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7E7B74' }} />
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7E7B74' }} />
                  </div>
                  <div
                    style={{
                      position: 'absolute',
                      left: 24,
                      bottom: 10,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: 1.6,
                      color: '#6B6862',
                    }}
                  >
                    COTTON · QUICK · RINSE
                  </div>
                  <div
                    style={{
                      position: 'absolute',
                      right: 24,
                      top: 20,
                      width: 80,
                      height: 80,
                      borderRadius: '50%',
                      background: 'conic-gradient(from 200deg, #F2F0EC, #9A968E, #E8E5DF, #8B877F, #F2F0EC)',
                      boxShadow: '0 6px 12px rgba(0,0,0,0.35), inset 0 0 0 4px rgba(255,255,255,0.3)',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        left: 38,
                        top: 8,
                        width: 4,
                        height: 18,
                        borderRadius: 2,
                        background: '#1B1B1B',
                      }}
                    />
                  </div>
                </div>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'radial-gradient(circle at 50% 50%, transparent 55%, rgba(0,0,0,0.5) 100%)',
                  }}
                />
                <div
                  className="lr-focus"
                  style={{
                    position: 'absolute',
                    left: 44,
                    top: 48,
                    width: 132,
                    height: 74,
                    border: '2.5px solid #E3B660',
                    borderRadius: 12,
                  }}
                />
                <div style={{ position: 'absolute', left: 10, top: 10, width: 20, height: 20, borderLeft: '2px solid rgba(255,255,255,0.8)', borderTop: '2px solid rgba(255,255,255,0.8)', borderTopLeftRadius: 6 }} />
                <div style={{ position: 'absolute', right: 10, top: 10, width: 20, height: 20, borderRight: '2px solid rgba(255,255,255,0.8)', borderTop: '2px solid rgba(255,255,255,0.8)', borderTopRightRadius: 6 }} />
                <div style={{ position: 'absolute', left: 10, bottom: 10, width: 20, height: 20, borderLeft: '2px solid rgba(255,255,255,0.8)', borderBottom: '2px solid rgba(255,255,255,0.8)', borderBottomLeftRadius: 6 }} />
                <div style={{ position: 'absolute', right: 10, bottom: 10, width: 20, height: 20, borderRight: '2px solid rgba(255,255,255,0.8)', borderBottom: '2px solid rgba(255,255,255,0.8)', borderBottomRightRadius: 6 }} />
                <div
                  style={{
                    position: 'absolute',
                    left: 18,
                    top: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'rgba(0,0,0,0.5)',
                    borderRadius: 999,
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.6,
                  }}
                >
                  <span
                    className="lr-live"
                    style={{ width: 7, height: 7, borderRadius: '50%', background: '#C96846', display: 'inline-block' }}
                  />
                  LIVE
                </div>
                <div
                  style={{
                    position: 'absolute',
                    right: 18,
                    top: 16,
                    background: 'rgba(0,0,0,0.5)',
                    borderRadius: 999,
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: 500,
                  }}
                >
                  Back camera
                </div>
                <div
                  style={{
                    position: 'absolute',
                    left: 18,
                    bottom: 16,
                    background: '#E3B660',
                    color: '#1B1B1B',
                    borderRadius: 999,
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  Gemini sees: error code E21
                </div>
              </div>

              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 196,
                  width: '100%',
                  height: 196,
                  borderRadius: 22,
                  background: '#151C1B',
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div className="lr-an lr-r1" style={{ height: 38, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      background: '#F4F3F1',
                      color: '#1B1B1B',
                      borderRadius: 999,
                      padding: '3px 10px',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.6,
                      flex: 'none',
                    }}
                  >
                    AMMA
                  </span>
                  <span style={{ fontSize: 17, lineHeight: '24px' }}>இது என்ன அர்த்தம்?</span>
                </div>

                <div
                  className="lr-an lr-r2b"
                  style={{
                    height: 56,
                    background: 'rgba(227,182,96,0.12)',
                    borderLeft: '3px solid #E3B660',
                    borderRadius: 10,
                    padding: '5px 10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 14 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: '#E3B660' }}>
                      GEMINI → AMMA · தமிழ்
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, height: 12 }}>
                      <span className="lr-bar" style={{ width: 3, height: 12, borderRadius: 2, background: '#C96846' }} />
                      <span className="lr-bar" style={{ width: 3, height: 12, borderRadius: 2, background: '#C96846', animationDelay: '0.15s' }} />
                      <span className="lr-bar" style={{ width: 3, height: 12, borderRadius: 2, background: '#C96846', animationDelay: '0.3s' }} />
                      <span className="lr-bar" style={{ width: 3, height: 12, borderRadius: 2, background: '#C96846', animationDelay: '0.08s' }} />
                    </span>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: '18px', marginTop: 3 }}>
                    இது வடிகால் பிரச்சனை. வடிகட்டியை சரிபார்க்கவும்.
                  </div>
                </div>

                <div
                  className="lr-an lr-r3"
                  style={{
                    height: 56,
                    background: 'rgba(244,243,241,0.08)',
                    borderLeft: '3px solid rgba(244,243,241,0.7)',
                    borderRadius: 10,
                    padding: '5px 10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 14 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: '#F4F3F1' }}>
                      GEMINI → RAVI · हिन्दी
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, height: 12 }}>
                      <span className="lr-bar" style={{ width: 3, height: 12, borderRadius: 2, background: '#E3B660', animationDelay: '0.2s' }} />
                      <span className="lr-bar" style={{ width: 3, height: 12, borderRadius: 2, background: '#E3B660', animationDelay: '0.05s' }} />
                      <span className="lr-bar" style={{ width: 3, height: 12, borderRadius: 2, background: '#E3B660', animationDelay: '0.28s' }} />
                      <span className="lr-bar" style={{ width: 3, height: 12, borderRadius: 2, background: '#E3B660', animationDelay: '0.12s' }} />
                    </span>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: '18px', marginTop: 3 }}>
                    यह पानी निकलने की समस्या है। फ़िल्टर जाँचें।
                  </div>
                </div>
              </div>
            </div>

            {/* SCENE 3: Gemini fills the PDF form */}
            <div className="lr-an lr-sc3" style={{ position: 'absolute', inset: 0 }}>
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  top: 0,
                  width: 250,
                  height: 304,
                  background: '#F4F3F1',
                  color: '#1B1B1B',
                  borderRadius: 14,
                  boxShadow: '0 18px 40px rgba(0,0,0,0.28)',
                  padding: '16px 18px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#214D47' }}>Application form</span>
                  <span
                    style={{
                      border: '1.5px solid #C96846',
                      color: '#C96846',
                      borderRadius: 6,
                      padding: '1px 6px',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.6,
                    }}
                  >
                    PDF
                  </span>
                </div>
                <div style={{ height: 1.5, background: '#D9D6CF', marginBottom: 10 }} />

                <div className="lr-an lr-h1" style={{ padding: '4px 6px 6px', borderRadius: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#6B6862' }}>NAME</div>
                  <div style={{ height: 26, borderBottom: '1.5px solid #D9D6CF', fontSize: 16, lineHeight: '26px' }}>
                    <span className="lr-an lr-f1" style={{ display: 'inline-block' }}>Ravi Kumar</span>
                  </div>
                </div>
                <div className="lr-an lr-h2" style={{ padding: '4px 6px 6px', borderRadius: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#6B6862' }}>DATE OF BIRTH</div>
                  <div style={{ height: 26, borderBottom: '1.5px solid #D9D6CF', fontSize: 16, lineHeight: '26px' }}>
                    <span className="lr-an lr-f2" style={{ display: 'inline-block' }}>14 / 03 / 1990</span>
                  </div>
                </div>
                <div className="lr-an lr-h3" style={{ padding: '4px 6px 6px', borderRadius: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#6B6862' }}>ADDRESS</div>
                  <div style={{ height: 26, borderBottom: '1.5px solid #D9D6CF', fontSize: 16, lineHeight: '26px' }}>
                    <span className="lr-an lr-f3" style={{ display: 'inline-block' }}>Anna Nagar, Chennai</span>
                  </div>
                </div>
                <div
                  className="lr-an lr-h4 lr-miss"
                  style={{
                    padding: '4px 6px 6px',
                    borderRadius: 8,
                    outline: '2px dashed transparent',
                    outlineOffset: 1,
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#6B6862' }}>PHONE</div>
                  <div style={{ height: 26, borderBottom: '1.5px solid #D9D6CF', fontSize: 16, lineHeight: '26px' }}>
                    <span className="lr-an lr-f4" style={{ display: 'inline-block' }}>98765 43210</span>
                  </div>
                </div>
              </div>

              <div
                className="lr-an lr-ask"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 318,
                  width: '100%',
                  height: 62,
                  background: '#1B3B37',
                  border: '1.5px solid #E3B660',
                  borderRadius: 18,
                  padding: '8px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#E3B660' }}>GEMINI ASKS</div>
                  <div style={{ fontSize: 16, lineHeight: '24px' }}>What is your phone number?</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 26 }}>
                  <span className="lr-bar" style={{ width: 5, height: 26, borderRadius: 3, background: '#C96846' }} />
                  <span className="lr-bar" style={{ width: 5, height: 26, borderRadius: 3, background: '#C96846', animationDelay: '0.14s' }} />
                  <span className="lr-bar" style={{ width: 5, height: 26, borderRadius: 3, background: '#C96846', animationDelay: '0.28s' }} />
                  <span className="lr-bar" style={{ width: 5, height: 26, borderRadius: 3, background: '#C96846', animationDelay: '0.08s' }} />
                </div>
              </div>

              <div
                className="lr-an lr-ready"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 318,
                  width: '100%',
                  height: 62,
                  background: '#E3B660',
                  color: '#1B1B1B',
                  borderRadius: 18,
                  padding: '8px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>PDF ready</div>
                  <div style={{ fontSize: 13 }}>Share it or keep it in Sarvam</div>
                </div>
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#1B1B1B"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
                </svg>
              </div>
            </div>
            </div>
          </div>

          {/* Copy block (all 3 scenes readable by screen readers) */}
          <div className="lr-copy" data-testid="relay-intro-copy">
            <div className="lr-an lr-t1 lr-copy-slide">
              <h1 className="lr-copy-title">{t.relayIntroStep1Title}</h1>
              <p className="lr-copy-body">{t.relayIntroStep1Body}</p>
            </div>
            <div className="lr-an lr-t2 lr-copy-slide">
              <h2 className="lr-copy-title">{t.relayIntroStep2Title}</h2>
              <p className="lr-copy-body">{t.relayIntroStep2Body}</p>
            </div>
            <div className="lr-an lr-t3 lr-copy-slide">
              <h2 className="lr-copy-title">{t.relayIntroStep3Title}</h2>
              <p className="lr-copy-body">{t.relayIntroStep3Body}</p>
            </div>
          </div>

          {/* Progress dots */}
          <div className="lr-dots" aria-hidden="true" data-testid="relay-intro-dots">
            <span className="lr-an lr-d1 lr-dot" />
            <span className="lr-an lr-d2 lr-dot" />
            <span className="lr-an lr-d3 lr-dot" />
          </div>
        </div>

        {/* Reduced-motion static three-step list (inside same teal card) */}
        <ol className="lr-static-list" data-testid="relay-intro-static-list">
          <li className="lr-static-card">
            <span className="lr-static-num" aria-hidden="true">1</span>
            <div>
              <h2 className="lr-static-title">{t.relayIntroStep1Title}</h2>
              <p className="lr-static-body">{t.relayIntroStep1Body}</p>
            </div>
          </li>
          <li className="lr-static-card">
            <span className="lr-static-num" aria-hidden="true">2</span>
            <div>
              <h2 className="lr-static-title">{t.relayIntroStep2Title}</h2>
              <p className="lr-static-body">{t.relayIntroStep2Body}</p>
            </div>
          </li>
          <li className="lr-static-card">
            <span className="lr-static-num" aria-hidden="true">3</span>
            <div>
              <h2 className="lr-static-title">{t.relayIntroStep3Title}</h2>
              <p className="lr-static-body">{t.relayIntroStep3Body}</p>
            </div>
          </li>
        </ol>
        </div>

        {/* Actions on cream background — Focus order: Start scanning, then Skip */}
        <div className="lr-actions">
          <button
            type="button"
            className="lr-go"
            data-testid="relay-intro-start"
            onClick={onStart}
          >
            <span>{t.relayIntroStartScanning}</span>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#1B1B1B"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>

          <button
            type="button"
            className="lr-skip"
            data-testid="relay-intro-skip"
            onClick={onStart}
          >
            {t.relayIntroSkip}
          </button>
        </div>
      </div>
    </div>
  )
}
