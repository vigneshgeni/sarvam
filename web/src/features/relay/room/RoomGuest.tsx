/**
 * RoomGuest — Lightweight, code-split guest view for /r/:code.
 * Does NOT import firebase/ai or Gemini code.
 *
 * Steps:
 * 1. Join card: room code prefilled, name, language picker, "Join with mic on" (camera off).
 * 2. Call view: active camera full screen, row of participant tiles, mute/unmute, Leave,
 *    reconnecting pill, captions/pins/camera-handoff ready for P3.
 * 3. "You left" and "Room ended" screens with a link to Sarvam.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  LocalVideoTrack,
  Participant,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client'
import { getDictionary, resolveLang, SUPPORTED_LANGS } from '../../../i18n/index.js'
import {
  isValidRoomCode,
  joinRelayRoom,
  normalizeRoomCode,
  RelayApiError,
  translateRelayCaption,
} from './relayApi.js'
import { sanitizeCaption } from '../captionSanitizer.js'

interface GuestParticipant {
  identity: string
  name: string
  role: 'host' | 'guest'
  isSpeaking?: boolean
}

export interface GuestCaptionItem {
  id: string
  speaker: string
  lang: string
  text: string
  translatedText?: string
  translatedFrom?: string
  ts: number
}

interface PinnedPagePreview {
  pageId: string
  pageNumber: number
  thumb: string
}

type GuestScreenState = 'join' | 'call' | 'left' | 'ended'

function parseParticipant(p: Participant, localId?: string): GuestParticipant {
  let role: 'host' | 'guest' = 'guest'
  let name = p.name || (p.identity === localId ? 'You' : 'Guest')
  try {
    if (p.metadata) {
      const m = JSON.parse(p.metadata) as { role?: string; name?: string }
      if (m.role === 'host' || m.role === 'guest') role = m.role
      if (m.name) name = m.name
    }
  } catch {
    // ignore
  }
  return { identity: p.identity, name, role, isSpeaking: p.isSpeaking }
}

export default function RoomGuest({ initialCode }: { initialCode: string }) {
  const [screen, setScreen] = useState<GuestScreenState>('join')
  const [code, setCode] = useState<string>(() => normalizeRoomCode(initialCode))
  const [name, setName] = useState<string>('')
  const [lang, setLang] = useState<string>(() => {
    try {
      return resolveLang('auto')
    } catch {
      return 'en'
    }
  })
  const [joining, setJoining] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [participants, setParticipants] = useState<GuestParticipant[]>([])
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false)
  const [activeCameraLabel, setActiveCameraLabel] = useState<string>('')
  const [allowGuestCamera, setAllowGuestCamera] = useState(false)
  const [guestCamState, setGuestCamState] = useState<'off' | 'requested' | 'on'>('off')
  const [captions, setCaptions] = useState<GuestCaptionItem[]>([])
  const [pinnedPage, setPinnedPage] = useState<PinnedPagePreview | null>(null)
  const [showPinModal, setShowPinModal] = useState(false)

  const roomRef = useRef<Room | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const pendingVideoTrackRef = useRef<{ track: RemoteTrack | LocalVideoTrack; label: string } | null>(null)
  const localCamTrackRef = useRef<LocalVideoTrack | null>(null)
  const remoteAudioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const translationCacheRef = useRef<Map<string, string>>(new Map())
  const leftIntentionallyRef = useRef(false)
  const langRef = useRef(lang)

  useEffect(() => {
    langRef.current = lang
  }, [lang])

  const t = getDictionary(resolveLang(lang))

  const syncParticipants = useCallback((room: Room | null) => {
    if (!room) {
      setParticipants([])
      return
    }
    const list: GuestParticipant[] = [parseParticipant(room.localParticipant, room.localParticipant.identity)]
    room.remoteParticipants.forEach((rp) => {
      list.push(parseParticipant(rp, room.localParticipant.identity))
    })
    setParticipants(list)
  }, [])

  const detachAllRemoteAudio = useCallback(() => {
    remoteAudioElsRef.current.forEach((el) => {
      try {
        el.srcObject = null
        el.remove()
      } catch {
        // ignore
      }
    })
    remoteAudioElsRef.current.clear()
  }, [])

  const stopGuestCamera = useCallback(async () => {
    const room = roomRef.current
    const tr = localCamTrackRef.current
    localCamTrackRef.current = null
    if (tr) {
      if (room && room.state === 'connected') {
        try {
          await room.localParticipant.unpublishTrack(tr)
        } catch {
          // ignore
        }
      }
      tr.stop()
    }
    setGuestCamState('off')
  }, [])

  const attachVideoTrack = useCallback((track: RemoteTrack | LocalVideoTrack | null, ownerLabel: string) => {
    if (!track) {
      pendingVideoTrackRef.current = null
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
      setHasRemoteVideo(false)
      return
    }
    pendingVideoTrackRef.current = { track, label: ownerLabel }
    if (ownerLabel) setActiveCameraLabel(ownerLabel)
    const el = videoRef.current
    if (!el) return
    track.attach(el)
    el.muted = true
    el.playsInline = true
    el.autoplay = true
    void el.play().catch(() => {})
    setHasRemoteVideo(true)
  }, [])

  // Once the call screen mounts <video>, attach any video track that subscribed during room.connect()
  useEffect(() => {
    if (screen !== 'call') return
    if (pendingVideoTrackRef.current) {
      const { track, label } = pendingVideoTrackRef.current
      attachVideoTrack(track, label)
      return
    }
    const room = roomRef.current
    if (!room) return
    room.remoteParticipants.forEach((rp) => {
      const info = parseParticipant(rp)
      rp.videoTrackPublications.forEach((pub) => {
        if (pub.track) {
          attachVideoTrack(pub.track as RemoteTrack, `${info.name}'s camera`)
        }
      })
    })
  }, [screen, attachVideoTrack])

  useEffect(() => {
    return () => {
      void stopGuestCamera()
      detachAllRemoteAudio()
      if (roomRef.current) {
        void roomRef.current.disconnect().catch(() => {})
        roomRef.current = null
      }
    }
  }, [detachAllRemoteAudio, stopGuestCamera])

  const startGuestCamera = useCallback(async () => {
    const room = roomRef.current
    if (!room || room.state !== 'connected') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      const vTrack = stream.getVideoTracks()[0]
      if (!vTrack) return
      const localTrack = new LocalVideoTrack(vTrack, undefined, true)
      localCamTrackRef.current = localTrack
      await room.localParticipant.publishTrack(localTrack, { source: Track.Source.Camera })
      setGuestCamState('on')
      attachVideoTrack(localTrack, `${name || 'Your'} camera`)
    } catch {
      setGuestCamState('off')
    }
  }, [attachVideoTrack, name])

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanCode = normalizeRoomCode(code)
    if (!isValidRoomCode(cleanCode)) {
      setErrorMsg(t.relayRoomErrNotFound || 'Room not found. Check the 4-letter code and try again.')
      return
    }
    const cleanName = name.trim() || 'Guest'
    setJoining(true)
    setErrorMsg(null)
    leftIntentionallyRef.current = false

    // Unlock audio playback synchronously inside Join tap (iOS Safari requirement)
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (AC) {
        const ctx = new AC()
        void ctx.resume().then(() => ctx.close()).catch(() => {})
      }
    } catch {
      // ignore
    }

    try {
      const joined = await joinRelayRoom({
        code: cleanCode,
        name: cleanName,
        language: lang,
      })

      setAllowGuestCamera(joined.allowGuestCamera)
      setActiveCameraLabel(`${joined.hostName}'s camera`)

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      })

      room.on(RoomEvent.ParticipantConnected, () => syncParticipants(room))
      room.on(RoomEvent.ParticipantDisconnected, (rp: RemoteParticipant) => {
        const meta = parseParticipant(rp)
        syncParticipants(room)
        if (meta.role === 'host' && !leftIntentionallyRef.current) {
          detachAllRemoteAudio()
          void room.disconnect().catch(() => {})
          setScreen('ended')
        }
      })

      room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, pub: RemoteTrackPublication, rp: RemoteParticipant) => {
          const info = parseParticipant(rp)
          if (track.kind === Track.Kind.Video) {
            attachVideoTrack(track, `${info.name}'s camera`)
          } else if (track.kind === Track.Kind.Audio) {
            const el = track.attach() as HTMLAudioElement
            el.autoplay = true
            el.style.display = 'none'
            document.body.appendChild(el)
            remoteAudioElsRef.current.set(`${rp.identity}-${pub.trackSid}`, el)
            void el.play().catch(() => {})
          }
        },
      )

      room.on(
        RoomEvent.TrackUnsubscribed,
        (track: RemoteTrack, pub: RemoteTrackPublication, rp: RemoteParticipant) => {
          if (track.kind === Track.Kind.Audio) {
            const key = `${rp.identity}-${pub.trackSid}`
            const el = remoteAudioElsRef.current.get(key)
            if (el) {
              el.remove()
              remoteAudioElsRef.current.delete(key)
            }
          } else if (track.kind === Track.Kind.Video) {
            track.detach()
          }
        },
      )

      room.on(RoomEvent.RoomMetadataChanged, (metaStr: string) => {
        try {
          const m = JSON.parse(metaStr) as { allowGuestCamera?: boolean; ended?: boolean }
          if (typeof m.allowGuestCamera === 'boolean') {
            setAllowGuestCamera(m.allowGuestCamera)
          }
          if (m.ended && !leftIntentionallyRef.current) {
            detachAllRemoteAudio()
            void room.disconnect().catch(() => {})
            setScreen('ended')
          }
        } catch {
          // ignore
        }
      })

      room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
        try {
          const msg = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>
          if (msg.type === 'end') {
            if (!leftIntentionallyRef.current) {
              detachAllRemoteAudio()
              void stopGuestCamera()
              void room.disconnect().catch(() => {})
              setScreen('ended')
            }
            return
          }
          if (msg.type === 'settings' && typeof msg.allowGuestCamera === 'boolean') {
            setAllowGuestCamera(msg.allowGuestCamera)
            return
          }
          if (msg.type === 'camera_grant' && msg.identity === room.localParticipant.identity) {
            void startGuestCamera()
            return
          }
          if (msg.type === 'camera_revoke') {
            void stopGuestCamera()
            if (typeof msg.activeCameraLabel === 'string') {
              setActiveCameraLabel(msg.activeCameraLabel)
            }
            // Re-attach host video if subscribed
            room.remoteParticipants.forEach((rp) => {
              const info = parseParticipant(rp)
              if (info.role === 'host') {
                rp.videoTrackPublications.forEach((pub) => {
                  if (pub.track) {
                    attachVideoTrack(pub.track as RemoteTrack, `${info.name}'s camera`)
                  }
                })
              }
            })
            return
          }
          if (msg.type === 'pin' && typeof msg.thumb === 'string') {
            setPinnedPage({
              pageId: String(msg.pin || Date.now()),
              pageNumber: Number(msg.pageNumber || 1),
              thumb: msg.thumb,
            })
            return
          }
          if (msg.type === 'caption' && typeof msg.text === 'string') {
            const clean = sanitizeCaption(msg.text, 'output')
            if (!clean) return
            const item: GuestCaptionItem = {
              id: String(msg.id || Date.now()),
              speaker: String(msg.speaker || 'Gemini'),
              lang: String(msg.lang || 'en'),
              text: clean,
              ts: Number(msg.ts || Date.now()),
            }
            setCaptions((prev) => {
              const exists = prev.findIndex((c) => c.id === item.id)
              if (exists >= 0) {
                const copy = [...prev]
                copy[exists] = { ...copy[exists], ...item }
                return copy
              }
              return [...prev.slice(-39), item]
            })
            // Optional caption translation when caption lang differs from viewer's language
            const viewerLang = resolveLang(langRef.current)
            if (item.lang && item.lang !== viewerLang && item.lang !== 'auto') {
              const cached = translationCacheRef.current.get(item.id)
              if (cached) {
                setCaptions((prev) =>
                  prev.map((c) => (c.id === item.id ? { ...c, translatedText: cached, translatedFrom: item.lang } : c)),
                )
              } else {
                void translateRelayCaption({ text: clean, from: item.lang, to: viewerLang }).then((res) => {
                  if (!res?.translated) return
                  translationCacheRef.current.set(item.id, res.translated)
                  setCaptions((prev) =>
                    prev.map((c) =>
                      c.id === item.id ? { ...c, translatedText: res.translated, translatedFrom: item.lang } : c,
                    ),
                  )
                })
              }
            }
          }
        } catch {
          // ignore
        }
      })

      room.on(RoomEvent.Reconnecting, () => setReconnecting(true))
      room.on(RoomEvent.Reconnected, () => {
        setReconnecting(false)
        syncParticipants(room)
      })
      room.on(RoomEvent.Disconnected, () => {
        detachAllRemoteAudio()
        void stopGuestCamera()
        if (!leftIntentionallyRef.current) {
          setScreen('ended')
        }
      })

      await room.connect(joined.livekitUrl, joined.token)
      await room.startAudio().catch(() => {})
      // Enable guest microphone (camera stays OFF)
      try {
        await room.localParticipant.setMicrophoneEnabled(true)
      } catch {
        setIsMuted(true)
      }

      roomRef.current = room
      setScreen('call')
      syncParticipants(room)

      // Attach any already-subscribed remote video/audio tracks
      room.remoteParticipants.forEach((rp) => {
        const info = parseParticipant(rp)
        rp.trackPublications.forEach((pub) => {
          if (pub.track && pub.track.kind === Track.Kind.Video) {
            attachVideoTrack(pub.track as RemoteTrack, `${info.name}'s camera`)
          } else if (pub.track && pub.track.kind === Track.Kind.Audio) {
            const el = pub.track.attach() as HTMLAudioElement
            el.autoplay = true
            el.style.display = 'none'
            document.body.appendChild(el)
            remoteAudioElsRef.current.set(`${rp.identity}-${pub.trackSid}`, el)
            void el.play().catch(() => {})
          }
        })
      })
    } catch (err) {
      const msg =
        err instanceof RelayApiError
          ? t[err.info.i18nKey] || err.info.message
          : t.relayRoomErrGeneric || 'Could not connect to the room. Please try again.'
      setErrorMsg(msg)
    } finally {
      setJoining(false)
    }
  }

  const handleToggleMute = async () => {
    const room = roomRef.current
    if (!room) return
    const nextMuted = !isMuted
    setIsMuted(nextMuted)
    try {
      await room.localParticipant.setMicrophoneEnabled(!nextMuted)
    } catch {
      // ignore
    }
  }

  const handleRequestCamera = () => {
    const room = roomRef.current
    if (!room || room.state !== 'connected') return
    if (guestCamState === 'on') {
      void stopGuestCamera()
      const bytes = new TextEncoder().encode(JSON.stringify({ type: 'camera_release' }))
      void room.localParticipant.publishData(bytes, { reliable: true }).catch(() => {})
      return
    }
    setGuestCamState('requested')
    const bytes = new TextEncoder().encode(
      JSON.stringify({ type: 'camera_request', name: name.trim() || 'Guest' }),
    )
    void room.localParticipant.publishData(bytes, { reliable: true }).catch(() => {})
  }

  const handleLeave = async () => {
    leftIntentionallyRef.current = true
    await stopGuestCamera()
    detachAllRemoteAudio()
    if (roomRef.current) {
      await roomRef.current.disconnect().catch(() => {})
      roomRef.current = null
    }
    setScreen('left')
  }

  const outerStyle: React.CSSProperties = {
    minHeight: '100dvh',
    width: '100%',
    background: screen === 'call' ? '#214D47' : '#F4F5F2',
    display: 'flex',
    justifyContent: 'center',
    fontFamily: 'DM Sans, system-ui, sans-serif',
  }

  const colStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 430,
    minHeight: '100dvh',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
  }

  // ── Step 1: Join Card ─────────────────────────────────────────────
  if (screen === 'join') {
    return (
      <div style={outerStyle} data-testid="guest-join-page">
        <div style={{ ...colStyle, padding: 'max(20px, env(safe-area-inset-top, 20px)) 20px 24px', gap: 16 }}>
          <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 26, fontWeight: 600, color: '#1B1B1B' }}>
              Sarvam<span style={{ color: '#C96846' }}>.</span>
            </span>
            <span
              style={{
                background: '#E3B660',
                color: '#1B1B1B',
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 9px',
                borderRadius: 999,
              }}
            >
              LIVE RELAY
            </span>
          </header>

          <form
            onSubmit={handleJoin}
            data-testid="guest-join-card"
            style={{
              background: '#214D47',
              color: '#F5F4F2',
              borderRadius: 28,
              padding: 22,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              boxShadow: '0 16px 36px rgba(27,27,27,0.16)',
            }}
          >
            <h1 style={{ margin: 0, fontFamily: 'Fraunces, Georgia, serif', fontSize: 28, lineHeight: 1.2 }}>
              {t.relayJoinTitle || 'Join Live Relay'}
            </h1>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.45, color: 'rgba(245,244,242,0.88)' }}>
              {t.relayJoinSubtitle || 'Join the family call and hear Gemini together. No login needed.'}
            </p>

            {/* Room code */}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: '#D3E5E0' }}>
                {t.relayRoomCode || 'Room code'}
              </span>
              <input
                type="text"
                data-testid="guest-code-input"
                value={code}
                onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
                maxLength={4}
                autoCapitalize="characters"
                style={{
                  height: 48,
                  padding: '0 14px',
                  borderRadius: 14,
                  border: '1.5px solid rgba(255,255,255,0.28)',
                  background: 'rgba(255,255,255,0.12)',
                  color: '#F5F4F2',
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: 6,
                  textTransform: 'uppercase',
                }}
              />
            </label>

            {/* Name */}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: '#D3E5E0' }}>
                {t.relayYourName || 'Your name'}
              </span>
              <input
                type="text"
                data-testid="guest-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.relayYourNamePlaceholder || 'e.g. Amma, Arun'}
                required
                style={{
                  height: 48,
                  padding: '0 14px',
                  borderRadius: 14,
                  border: '1.5px solid rgba(255,255,255,0.28)',
                  background: 'rgba(255,255,255,0.12)',
                  color: '#F5F4F2',
                  fontSize: 16,
                }}
              />
            </label>

            {/* Language picker */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: '#D3E5E0' }}>
                {t.relayYourLanguage || 'Your language'}
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SUPPORTED_LANGS.filter((l) => l.id !== 'auto').map((l) => {
                  const active = resolveLang(lang) === l.id
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setLang(l.id)}
                      style={{
                        minHeight: 40,
                        padding: '0 12px',
                        borderRadius: 999,
                        border: active ? '2px solid #E3B660' : '1px solid rgba(255,255,255,0.28)',
                        background: active ? '#E3B660' : 'rgba(255,255,255,0.08)',
                        color: active ? '#1B1B1B' : '#F5F4F2',
                        fontSize: 13.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {l.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {errorMsg && (
              <div
                role="alert"
                data-testid="guest-join-error"
                style={{
                  padding: '10px 12px',
                  borderRadius: 14,
                  background: 'rgba(229, 83, 61, 0.22)',
                  border: '1.5px solid #E5533D',
                  color: '#F5F4F2',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              data-testid="guest-join-btn"
              disabled={joining}
              style={{
                width: '100%',
                minHeight: 54,
                borderRadius: 999,
                border: 0,
                background: '#E3B660',
                color: '#1B1B1B',
                fontSize: 17,
                fontWeight: 700,
                cursor: joining ? 'wait' : 'pointer',
                marginTop: 4,
              }}
            >
              {joining ? t.relayJoining || 'Joining…' : t.relayJoinWithMic || 'Join with mic on'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Step 3: Left / Room Ended screens ─────────────────────────────
  if (screen === 'left' || screen === 'ended') {
    const isEnded = screen === 'ended'
    return (
      <div style={outerStyle}>
        <div
          data-testid={isEnded ? 'guest-room-ended' : 'guest-left-screen'}
          style={{
            ...colStyle,
            justifyContent: 'center',
            padding: 24,
            gap: 16,
          }}
        >
          <div
            style={{
              background: '#214D47',
              color: '#F5F4F2',
              borderRadius: 28,
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              textAlign: 'center',
            }}
          >
            <h1 style={{ margin: 0, fontFamily: 'Fraunces, Georgia, serif', fontSize: 26 }}>
              {isEnded
                ? t.relayRoomEndedTitle || 'Room ended'
                : t.relayYouLeftTitle || 'You left the room'}
            </h1>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, color: 'rgba(245,244,242,0.88)' }}>
              {isEnded
                ? t.relayRoomEndedBody || 'The host ended this Live Relay call.'
                : t.relayYouLeftBody || 'You can close this tab or open Sarvam to read your own documents.'}
            </p>
            <a
              href="/"
              style={{
                marginTop: 8,
                minHeight: 50,
                borderRadius: 999,
                background: '#E3B660',
                color: '#1B1B1B',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 16,
              }}
            >
              {t.relayOpenSarvam || 'Open Sarvam'}
            </a>
          </div>
        </div>
      </div>
    )
  }

  // ── Step 2: Call View ─────────────────────────────────────────────
  return (
    <div style={outerStyle}>
      <div
        data-testid="guest-call-screen"
        style={{
          ...colStyle,
          background: '#0E0E0E',
          color: '#F5F4F2',
          overflow: 'hidden',
        }}
      >
        {/* Full-screen active camera video */}
        <video
          ref={videoRef}
          data-testid="guest-remote-video"
          playsInline
          autoPlay
          muted
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            background: '#0E0E0E',
          }}
        />

        {!hasRemoteVideo && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(245,244,242,0.75)',
              fontSize: 16,
              fontWeight: 600,
              pointerEvents: 'none',
            }}
          >
            {t.relayWaitingForVideo || 'Waiting for camera…'}
          </div>
        )}

        {/* Top Bar: Room badge + Active camera chip + Reconnecting pill */}
        <div
          style={{
            position: 'relative',
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'max(12px, env(safe-area-inset-top, 12px)) 14px 8px',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.72), transparent)',
            gap: 8,
          }}
        >
          <span
            data-testid="guest-active-camera-chip"
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              background: 'rgba(14,14,14,0.78)',
              border: '1px solid rgba(255,255,255,0.2)',
              fontSize: 12.5,
              fontWeight: 700,
            }}
          >
            {activeCameraLabel || `Room ${code}`}
          </span>

          {reconnecting && (
            <span
              data-testid="guest-reconnecting-pill"
              style={{
                padding: '5px 10px',
                borderRadius: 999,
                background: '#C96846',
                color: '#1B1B1B',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {t.relayStatusReconnecting || 'Reconnecting…'}
            </span>
          )}
        </div>

        {/* Participant Tiles + Pinned Page Chip */}
        <div
          style={{
            position: 'relative',
            zIndex: 20,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            padding: '4px 14px',
          }}
        >
          <div data-testid="guest-participants-row" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {participants.map((p) => (
              <span
                key={p.identity}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: 'rgba(20,20,20,0.78)',
                  border: p.isSpeaking ? '1.5px solid #E3B660' : '1px solid rgba(255,255,255,0.18)',
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: p.role === 'host' ? '#214D47' : '#C96846',
                    color: '#F5F4F2',
                    fontSize: 10,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {(p.name || 'G').slice(0, 1).toUpperCase()}
                </span>
                {p.name}
              </span>
            ))}
          </div>

          {pinnedPage && (
            <button
              type="button"
              data-testid="guest-pinned-chip"
              onClick={() => setShowPinModal(true)}
              style={{
                minHeight: 36,
                padding: '4px 12px',
                borderRadius: 999,
                border: '1.5px solid #E3B660',
                background: 'rgba(27,27,27,0.88)',
                color: '#E3B660',
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Pinned page {pinnedPage.pageNumber}
            </button>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Captions Panel (aria-live polite — receives P3 broadcasts) */}
        {captions.length > 0 && (
          <div
            aria-live="polite"
            data-testid="guest-captions-panel"
            style={{
              position: 'relative',
              zIndex: 20,
              margin: '0 12px 10px',
              maxHeight: 168,
              overflowY: 'auto',
              padding: '10px 12px',
              borderRadius: 18,
              background: 'rgba(18, 18, 18, 0.84)',
              border: '1px solid rgba(255,255,255,0.16)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {captions.slice(-4).map((c) => (
              <div key={c.id} style={{ fontSize: 14.5, lineHeight: 1.38 }}>
                <span style={{ fontWeight: 700, color: c.speaker === 'Gemini' ? '#E3B660' : '#D3E5E0', marginRight: 6 }}>
                  {c.speaker}:
                </span>
                <span>{c.translatedText || c.text}</span>
                {c.translatedText && c.translatedFrom && (
                  <span style={{ marginLeft: 6, fontSize: 11.5, opacity: 0.72 }}>
                    (from {c.translatedFrom})
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Bottom Controls: Mute, Optional Show my camera, Leave */}
        <div
          style={{
            position: 'relative',
            zIndex: 20,
            padding: '12px 16px max(20px, env(safe-area-inset-bottom, 20px))',
            background: 'rgba(10,10,10,0.88)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <button
            type="button"
            data-testid="guest-mute-btn"
            onClick={() => { void handleToggleMute() }}
            aria-label={isMuted ? t.relayUnmuteMic || 'Unmute microphone' : t.relayMuteMic || 'Mute microphone'}
            aria-pressed={isMuted}
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              border: 0,
              background: isMuted ? '#F5F4F2' : 'rgba(255,255,255,0.16)',
              color: isMuted ? '#1B1B1B' : '#F5F4F2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flex: 'none',
            }}
          >
            <svg viewBox="0 0 24 24" width={21} height={21} fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              {isMuted && <path d="M4 4l16 16" />}
            </svg>
          </button>

          {allowGuestCamera && (
            <button
              type="button"
              data-testid="guest-show-camera-btn"
              onClick={handleRequestCamera}
              style={{
                flex: 1,
                minHeight: 48,
                padding: '0 14px',
                borderRadius: 24,
                border: 0,
                background: guestCamState === 'on' ? '#C96846' : '#E3B660',
                color: guestCamState === 'on' ? '#F5F4F2' : '#1B1B1B',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {guestCamState === 'on'
                ? 'Stop my camera'
                : guestCamState === 'requested'
                  ? 'Waiting for host…'
                  : 'Show my camera'}
            </button>
          )}

          <button
            type="button"
            data-testid="guest-leave-btn"
            onClick={() => { void handleLeave() }}
            style={{
              minWidth: 84,
              height: 48,
              padding: '0 18px',
              borderRadius: 24,
              border: 0,
              background: '#E5533D',
              color: '#F5F4F2',
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
              flex: 'none',
            }}
          >
            {t.relayLeaveRoom || 'Leave'}
          </button>
        </div>

        {/* Pinned Page Thumbnail Lightbox */}
        {showPinModal && pinnedPage && (
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => setShowPinModal(false)}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 80,
              background: 'rgba(0,0,0,0.92)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              gap: 12,
            }}
          >
            <img
              src={pinnedPage.thumb}
              alt={`Pinned page ${pinnedPage.pageNumber}`}
              style={{ maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain', borderRadius: 12 }}
            />
            <button
              type="button"
              onClick={() => setShowPinModal(false)}
              style={{
                minHeight: 44,
                padding: '0 20px',
                borderRadius: 999,
                border: 0,
                background: '#E3B660',
                color: '#1B1B1B',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {t.close || 'Close'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
