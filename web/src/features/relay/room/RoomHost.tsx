/**
 * RoomHost — "Invite family" button, LiveKit room connection reusing the host's
 * EXISTING camera & microphone tracks (never calls getUserMedia again), collapsible
 * Invite sheet (QR, 4-char code boxes, WhatsApp, Copy link, Allow guest camera switch,
 * live "In the room" list), and compact status pill ("Room K7QM · 2 in the room").
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import {
  LocalAudioTrack,
  LocalVideoTrack,
  Participant,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client'
import QRCode from 'qrcode'
import {
  buildRoomJoinUrl,
  buildWhatsAppShareUrl,
  createRelayRoom,
  endRelayRoom,
  RelayApiError,
  updateRelayRoomSettings,
} from './relayApi.js'

export interface RoomMemberInfo {
  identity: string
  name: string
  role: 'host' | 'guest'
  lang: string
  isSpeaking?: boolean
}

export interface RoomHostHandle {
  replaceVideoTrack: (newTrack: MediaStreamTrack) => Promise<void>
  endRoom: () => Promise<void>
  broadcastData: (payload: Record<string, unknown>, reliable?: boolean) => void
  publishGeminiAudioTrack: (track: MediaStreamTrack) => Promise<void>
  getRoomCode: () => string | null
  getHostKey: () => string | null
  getMembers: () => RoomMemberInfo[]
  isInRoom: () => boolean
}

interface RoomHostProps {
  lang: string
  hostName?: string
  getMediaStream: () => MediaStream | null
  t: Record<string, string>
  onRoomActiveChange?: (info: { active: boolean; code: string | null; hostKey: string | null; memberCount: number; members: RoomMemberInfo[] }) => void
  onGuestJoined?: (member: RoomMemberInfo) => void
  onGuestLeft?: (identity: string) => void
  onRemoteAudioTrack?: (identity: string, name: string, track: MediaStreamTrack | null) => void
  onRemoteVideoTrack?: (identity: string, name: string, track: RemoteTrack | null) => void
  onActiveSpeakersChanged?: (speakers: RoomMemberInfo[]) => void
  onDataMessage?: (payload: Record<string, unknown>, sender: RoomMemberInfo | null) => void
  onAllowGuestCameraChange?: (allowed: boolean) => void
}

function parseParticipantMeta(p: Participant, fallbackRole: 'host' | 'guest'): RoomMemberInfo {
  let role: 'host' | 'guest' = fallbackRole
  let lang = 'en'
  let name = p.name || (fallbackRole === 'host' ? 'You' : 'Guest')
  try {
    if (p.metadata) {
      const parsed = JSON.parse(p.metadata) as { role?: string; lang?: string; name?: string }
      if (parsed.role === 'host' || parsed.role === 'guest') role = parsed.role
      if (parsed.lang) lang = parsed.lang
      if (parsed.name) name = parsed.name
    }
  } catch {
    // ignore invalid metadata
  }
  return { identity: p.identity, name, role, lang, isSpeaking: p.isSpeaking }
}

const RoomHost = forwardRef<RoomHostHandle, RoomHostProps>(function RoomHost(
  {
    lang,
    hostName = 'You',
    getMediaStream,
    t,
    onRoomActiveChange,
    onGuestJoined,
    onGuestLeft,
    onRemoteAudioTrack,
    onRemoteVideoTrack,
    onActiveSpeakersChanged,
    onDataMessage,
    onAllowGuestCameraChange,
  },
  ref,
) {
  const [creating, setCreating] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [joinUrl, setJoinUrl] = useState<string>('')
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [allowGuestCamera, setAllowGuestCamera] = useState(false)
  const [copied, setCopied] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [members, setMembers] = useState<RoomMemberInfo[]>([])

  const roomRef = useRef<Room | null>(null)
  const hostKeyRef = useRef<string | null>(null)
  const roomCodeRef = useRef<string | null>(null)
  const videoTrackRef = useRef<LocalVideoTrack | null>(null)
  const audioTrackRef = useRef<LocalAudioTrack | null>(null)
  const geminiTrackRef = useRef<LocalAudioTrack | null>(null)
  const remoteAudioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map())

  const syncMembers = useCallback(
    (room: Room | null) => {
      if (!room) {
        setMembers([])
        onRoomActiveChange?.({ active: false, code: null, hostKey: null, memberCount: 0, members: [] })
        return
      }
      const list: RoomMemberInfo[] = [
        parseParticipantMeta(room.localParticipant, 'host'),
      ]
      room.remoteParticipants.forEach((rp) => {
        list.push(parseParticipantMeta(rp, 'guest'))
      })
      setMembers(list)
      onRoomActiveChange?.({
        active: true,
        code: roomCodeRef.current,
        hostKey: hostKeyRef.current,
        memberCount: list.length,
        members: list,
      })
    },
    [onRoomActiveChange],
  )

  const cleanupRoom = useCallback(async (notifyServer: boolean) => {
    const code = roomCodeRef.current
    const hostKey = hostKeyRef.current
    const room = roomRef.current

    roomRef.current = null
    roomCodeRef.current = null
    hostKeyRef.current = null

    if (room && notifyServer) {
      try {
        const bytes = new TextEncoder().encode(JSON.stringify({ type: 'end' }))
        await room.localParticipant.publishData(bytes, { reliable: true })
      } catch {
        // ignore
      }
    }

    // Detach all remote audio elements
    remoteAudioElsRef.current.forEach((el) => {
      try {
        el.srcObject = null
        el.remove()
      } catch {
        // ignore
      }
    })
    remoteAudioElsRef.current.clear()

    // Unpublish tracks WITHOUT stopping the underlying host MediaStreamTracks (camera/Gemini still own them)
    if (room) {
      try {
        await room.disconnect(false)
      } catch {
        // ignore
      }
    }
    videoTrackRef.current = null
    audioTrackRef.current = null
    geminiTrackRef.current = null

    if (notifyServer && code && hostKey) {
      await endRelayRoom({ hostKey, code }).catch(() => {})
    }

    setRoomCode(null)
    setJoinUrl('')
    setQrDataUrl('')
    setSheetOpen(false)
    setAllowGuestCamera(false)
    setReconnecting(false)
    setMembers([])
    onRoomActiveChange?.({ active: false, code: null, hostKey: null, memberCount: 0, members: [] })
  }, [onRoomActiveChange])

  useEffect(() => {
    return () => {
      void cleanupRoom(false)
    }
  }, [cleanupRoom])

  useImperativeHandle(
    ref,
    () => ({
      async replaceVideoTrack(newTrack: MediaStreamTrack) {
        if (videoTrackRef.current) {
          await videoTrackRef.current.replaceTrack(newTrack, false)
        } else if (roomRef.current?.state === 'connected') {
          const lv = new LocalVideoTrack(newTrack, undefined, false)
          videoTrackRef.current = lv
          await roomRef.current.localParticipant.publishTrack(lv, {
            source: Track.Source.Camera,
          })
        }
      },
      async endRoom() {
        await cleanupRoom(true)
      },
      broadcastData(payload: Record<string, unknown>, reliable = true) {
        const room = roomRef.current
        if (!room || room.state !== 'connected') return
        try {
          const bytes = new TextEncoder().encode(JSON.stringify(payload))
          void room.localParticipant.publishData(bytes, { reliable }).catch(() => {})
        } catch {
          // ignore
        }
      },
      async publishGeminiAudioTrack(track: MediaStreamTrack) {
        const room = roomRef.current
        if (!room || room.state !== 'connected') return
        if (geminiTrackRef.current) return
        const localTrack = new LocalAudioTrack(track, undefined, false)
        geminiTrackRef.current = localTrack
        await room.localParticipant.publishTrack(localTrack, {
          name: 'gemini',
          source: Track.Source.Unknown,
        })
      },
      getRoomCode: () => roomCodeRef.current,
      getHostKey: () => hostKeyRef.current,
      getMembers: () => members,
      isInRoom: () => roomRef.current !== null && roomCodeRef.current !== null,
    }),
    [cleanupRoom, members],
  )

  const handleOpenRoom = useCallback(async () => {
    if (creating || roomCodeRef.current) return
    setCreating(true)
    setErrorMsg(null)

    try {
      const created = await createRelayRoom({ hostName, language: lang })
      const resolvedJoinUrl = buildRoomJoinUrl(created.code)
      const lkUrl =
        created.livekitUrl ||
        (import.meta.env.VITE_LIVEKIT_URL as string | undefined) ||
        ''
      if (!lkUrl) {
        throw new Error('Missing LiveKit URL')
      }

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      })

      room.on(RoomEvent.ParticipantConnected, (rp: RemoteParticipant) => {
        const info = parseParticipantMeta(rp, 'guest')
        syncMembers(room)
        onGuestJoined?.(info)
      })

      room.on(RoomEvent.ParticipantDisconnected, (rp: RemoteParticipant) => {
        const el = remoteAudioElsRef.current.get(rp.identity)
        if (el) {
          el.remove()
          remoteAudioElsRef.current.delete(rp.identity)
        }
        onRemoteAudioTrack?.(rp.identity, rp.name || 'Guest', null)
        onRemoteVideoTrack?.(rp.identity, rp.name || 'Guest', null)
        syncMembers(room)
        onGuestLeft?.(rp.identity)
      })

      room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, pub: RemoteTrackPublication, rp: RemoteParticipant) => {
          if (track.kind === Track.Kind.Audio) {
            // Never play or mix our own gemini track back
            if (pub.trackName === 'gemini') return
            const el = track.attach() as HTMLAudioElement
            el.autoplay = true
            el.style.display = 'none'
            document.body.appendChild(el)
            remoteAudioElsRef.current.set(`${rp.identity}-${pub.trackSid}`, el)
            void el.play().catch(() => {})
            onRemoteAudioTrack?.(rp.identity, rp.name || 'Guest', track.mediaStreamTrack)
          } else if (track.kind === Track.Kind.Video) {
            onRemoteVideoTrack?.(rp.identity, rp.name || 'Guest', track)
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
            onRemoteAudioTrack?.(rp.identity, rp.name || 'Guest', null)
          } else if (track.kind === Track.Kind.Video) {
            onRemoteVideoTrack?.(rp.identity, rp.name || 'Guest', null)
          }
        },
      )

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        const infos = speakers.map((sp) =>
          parseParticipantMeta(sp, sp.identity === room.localParticipant.identity ? 'host' : 'guest'),
        )
        onActiveSpeakersChanged?.(infos)
      })

      room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant) => {
        try {
          const parsed = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>
          const sender = participant ? parseParticipantMeta(participant, 'guest') : null
          onDataMessage?.(parsed, sender)
        } catch {
          // ignore non-JSON
        }
      })

      room.on(RoomEvent.Reconnecting, () => setReconnecting(true))
      room.on(RoomEvent.Reconnected, () => {
        setReconnecting(false)
        syncMembers(room)
      })

      await room.connect(lkUrl, created.token)

      // Publish the EXISTING camera & microphone MediaStreamTracks (never call getUserMedia again)
      const stream = getMediaStream()
      const existingVideo = stream?.getVideoTracks().find((tr) => tr.readyState === 'live')
      const existingAudio = stream?.getAudioTracks().find((tr) => tr.readyState === 'live')

      if (existingVideo) {
        const lv = new LocalVideoTrack(existingVideo, undefined, false)
        videoTrackRef.current = lv
        await room.localParticipant.publishTrack(lv, { source: Track.Source.Camera })
      }
      if (existingAudio) {
        const la = new LocalAudioTrack(existingAudio, undefined, false)
        audioTrackRef.current = la
        await room.localParticipant.publishTrack(la, { source: Track.Source.Microphone })
      }

      roomRef.current = room
      roomCodeRef.current = created.code
      hostKeyRef.current = created.hostKey
      setRoomCode(created.code)
      setJoinUrl(resolvedJoinUrl)
      setSheetOpen(true)
      syncMembers(room)

      try {
        const qr = await QRCode.toDataURL(resolvedJoinUrl, { width: 168, margin: 1 })
        setQrDataUrl(qr)
      } catch {
        setQrDataUrl('')
      }
    } catch (err) {
      const msg =
        err instanceof RelayApiError
          ? t[err.info.i18nKey] || err.info.message
          : t.relayRoomErrGeneric || 'Could not open room. Please try again.'
      setErrorMsg(msg)
    } finally {
      setCreating(false)
    }
  }, [
    creating,
    getMediaStream,
    hostName,
    lang,
    onActiveSpeakersChanged,
    onDataMessage,
    onGuestJoined,
    onGuestLeft,
    onRemoteAudioTrack,
    onRemoteVideoTrack,
    syncMembers,
    t,
  ])

  const handleToggleGuestCamera = async () => {
    const code = roomCodeRef.current
    const hostKey = hostKeyRef.current
    if (!code || !hostKey) return
    const next = !allowGuestCamera
    setAllowGuestCamera(next)
    onAllowGuestCameraChange?.(next)
    try {
      await updateRelayRoomSettings({ hostKey, code, allowGuestCamera: next })
      if (roomRef.current?.state === 'connected') {
        const bytes = new TextEncoder().encode(JSON.stringify({ type: 'settings', allowGuestCamera: next }))
        void roomRef.current.localParticipant.publishData(bytes, { reliable: true }).catch(() => {})
      }
    } catch {
      setAllowGuestCamera(!next)
      onAllowGuestCameraChange?.(!next)
    }
  }

  const handleCopyLink = async () => {
    if (!joinUrl) return
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
    }
  }

  const memberCount = members.length || 1
  const pillLabel = roomCode
    ? (t.relayRoomPill || 'Room {code} · {n} in the room')
        .replace('{code}', roomCode)
        .replace('{n}', String(memberCount))
    : ''

  return (
    <>
      {/* Trigger button OR compact active Room pill */}
      {!roomCode ? (
        <button
          type="button"
          data-testid="relay-invite-btn"
          onClick={() => { void handleOpenRoom() }}
          disabled={creating}
          aria-label={t.relayInviteFamily || 'Invite family'}
          style={{
            pointerEvents: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            minHeight: 44,
            padding: '0 14px',
            borderRadius: 22,
            border: '1.5px solid rgba(255,255,255,0.28)',
            background: 'rgba(33, 77, 71, 0.92)',
            color: '#F5F4F2',
            fontSize: 13,
            fontWeight: 700,
            cursor: creating ? 'wait' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.2}>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M19 8v6M16 11h6" strokeLinecap="round" />
          </svg>
          {creating ? t.relayCreatingRoom || 'Opening room…' : t.relayInviteFamily || 'Invite family'}
        </button>
      ) : (
        <button
          type="button"
          data-testid="relay-room-pill"
          data-room-code={roomCode}
          data-member-count={memberCount}
          onClick={() => setSheetOpen((o) => !o)}
          aria-expanded={sheetOpen}
          style={{
            pointerEvents: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            minHeight: 44,
            padding: '0 14px',
            borderRadius: 22,
            border: '1.5px solid rgba(227,182,96,0.75)',
            background: 'rgba(33, 77, 71, 0.94)',
            color: '#F5F4F2',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: reconnecting ? '#C96846' : '#E3B660',
              display: 'inline-block',
            }}
          />
          {pillLabel}
        </button>
      )}

      {/* Friendly Room Creation Error with Retry */}
      {errorMsg && !roomCode && (
        <div
          role="alert"
          data-testid="relay-invite-error"
          style={{
            pointerEvents: 'auto',
            position: 'fixed',
            left: '50%',
            transform: 'translateX(-50%)',
            top: 120,
            zIndex: 72,
            width: 'min(340px, calc(100vw - 32px))',
            background: '#F4F5F2',
            color: '#1B1B1B',
            borderRadius: 20,
            border: '2px solid #1B1B1B',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            boxShadow: '0 16px 36px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600 }}>{errorMsg}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => { void handleOpenRoom() }}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 999,
                border: '1.5px solid #1B1B1B',
                background: '#E3B660',
                color: '#1B1B1B',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {t.relayTryAgain || 'Try again'}
            </button>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              style={{
                minHeight: 44,
                padding: '0 14px',
                borderRadius: 999,
                border: '1.5px solid #214D47',
                background: 'transparent',
                color: '#214D47',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {t.close || 'Close'}
            </button>
          </div>
        </div>
      )}

      {/* Collapsible Invite Sheet */}
      {roomCode && sheetOpen && (
        <div
          role="dialog"
          aria-label={t.relayInviteFamily || 'Invite family'}
          data-testid="relay-invite-sheet"
          style={{
            pointerEvents: 'auto',
            position: 'absolute',
            left: 12,
            right: 12,
            top: 120,
            zIndex: 66,
            background: '#F4F5F2',
            color: '#1B1B1B',
            borderRadius: 24,
            border: '2px solid #1B1B1B',
            padding: 16,
            boxShadow: '0 18px 44px rgba(0,0,0,0.45)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            fontFamily: 'DM Sans, system-ui, sans-serif',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 20, fontWeight: 600, color: '#214D47' }}>
              {t.relayInviteFamily || 'Invite family'}
            </span>
            <button
              type="button"
              data-testid="relay-invite-hide"
              onClick={() => setSheetOpen(false)}
              aria-label={t.relayHideInvite || 'Hide'}
              style={{
                minHeight: 44,
                padding: '0 14px',
                borderRadius: 999,
                border: '1.5px solid #214D47',
                background: 'transparent',
                color: '#214D47',
                fontSize: 13.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {t.relayHideInvite || 'Hide'}
            </button>
          </div>

          {/* QR + 4-char code boxes */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt={`QR code for room ${roomCode}`}
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 12,
                  border: '1.5px solid #D9D6CF',
                  background: '#fff',
                  padding: 4,
                  flex: 'none',
                }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#575B58', textTransform: 'uppercase' }}>
                {t.relayRoomCode || 'Room code'}
              </div>
              <div data-testid="relay-room-code" style={{ display: 'flex', gap: 6 }}>
                {roomCode.split('').map((ch, idx) => (
                  <span
                    key={`${ch}-${idx}`}
                    style={{
                      width: 40,
                      height: 48,
                      borderRadius: 10,
                      background: '#EAE7E0',
                      border: '1.5px solid #1B1B1B',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 24,
                      fontWeight: 700,
                      color: '#1B1B1B',
                    }}
                  >
                    {ch}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* WhatsApp + Copy link */}
          <div style={{ display: 'flex', gap: 8 }}>
            <a
              href={buildWhatsAppShareUrl(roomCode, joinUrl, hostName)}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="relay-share-whatsapp"
              style={{
                flex: 1.3,
                minHeight: 44,
                borderRadius: 999,
                background: '#E3B660',
                color: '#1B1B1B',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13.5,
                fontWeight: 700,
                padding: '0 12px',
              }}
            >
              {t.relayShareWhatsApp || 'Share on WhatsApp'}
            </a>
            <button
              type="button"
              data-testid="relay-copy-link"
              onClick={() => { void handleCopyLink() }}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 999,
                border: '1.5px solid #214D47',
                background: 'transparent',
                color: '#214D47',
                fontSize: 13.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {copied ? t.relayCopied || 'Copied' : t.relayCopyLink || 'Copy link'}
            </button>
          </div>

          {/* Guests can show their camera switch */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              {t.relayAllowGuestCamera || 'Guests can show their camera'}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={allowGuestCamera}
              aria-label={t.relayAllowGuestCamera || 'Guests can show their camera'}
              data-testid="relay-allow-guest-cam-switch"
              onClick={() => { void handleToggleGuestCamera() }}
              style={{
                width: 52,
                height: 32,
                minHeight: 44,
                border: 0,
                background: 'transparent',
                padding: '6px 0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  width: 48,
                  height: 28,
                  borderRadius: 14,
                  background: allowGuestCamera ? '#214D47' : '#C9C5BC',
                  padding: 3,
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'background 180ms ease',
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: '#fff',
                    transform: allowGuestCamera ? 'translateX(20px)' : 'translateX(0)',
                    transition: 'transform 180ms ease',
                  }}
                />
              </span>
            </button>
          </div>

          {/* In the room list */}
          <div style={{ borderTop: '1px solid #D9D6CF', paddingTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#575B58', marginBottom: 6, textTransform: 'uppercase' }}>
              {t.relayInTheRoom || 'In the room'}
            </div>
            <div data-testid="relay-room-members" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {members.map((m) => (
                <span
                  key={m.identity}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 10px',
                    borderRadius: 999,
                    background: m.role === 'host' ? '#D3E5E0' : '#EAE7E0',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#1B1B1B',
                  }}
                >
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: m.role === 'host' ? '#214D47' : '#C96846',
                      color: '#F5F4F2',
                      fontSize: 11,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {(m.name || 'G').slice(0, 1).toUpperCase()}
                  </span>
                  {m.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
})

export default RoomHost
