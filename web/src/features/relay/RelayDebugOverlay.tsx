/**
 * RelayDebugOverlay — Dev-only diagnostics HUD enabled strictly via ?debug=1.
 * Displays turn state, gate open/closed, current RMS and noise floor, playback level,
 * time since last server message, reconnect count, and the last 5 events.
 */

import type { ConversationGateMetrics } from './audio/ConversationGate.js'
import type { RelayTurnSnapshot } from './relayTurnState.js'

interface RelayDebugOverlayProps {
  turn: RelayTurnSnapshot
  gate: ConversationGateMetrics
}

export function isRelayDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return new URLSearchParams(window.location.search).get('debug') === '1'
  } catch {
    return false
  }
}

export default function RelayDebugOverlay({ turn, gate }: RelayDebugOverlayProps) {
  const sinceMsgSec = ((Date.now() - turn.lastServerMessageAt) / 1000).toFixed(1)

  return (
    <div
      data-testid="relay-debug-overlay"
      style={{
        position: 'absolute',
        left: 8,
        top: 66,
        zIndex: 75,
        maxWidth: 240,
        padding: '8px 10px',
        borderRadius: 12,
        background: 'rgba(10, 14, 14, 0.86)',
        border: '1px solid rgba(227, 182, 96, 0.45)',
        color: '#F5F4F2',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 10.5,
        lineHeight: 1.4,
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontWeight: 700, color: '#E3B660', marginBottom: 3 }}>RELAY DEBUG (?debug=1)</div>
      <div>turn: <b>{turn.state}</b>{turn.stillThinking ? ' (still…)' : ''}</div>
      <div>gate: <b>{gate.isOpen ? 'OPEN' : 'closed'}</b> ({gate.mode})</div>
      <div>rms: {gate.rms.toFixed(4)} / thr: {gate.threshold.toFixed(4)}</div>
      <div>floor: {gate.noiseFloor.toFixed(4)} | play: {gate.playbackRms.toFixed(4)}</div>
      <div>last msg: {sinceMsgSec}s | reconn: {turn.reconnectCount}</div>
      {turn.recentEvents.length > 0 && (
        <div style={{ marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 3 }}>
          {turn.recentEvents.map((ev, i) => (
            <div key={`${ev.ts}-${i}`} style={{ opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              • {ev.event} → {ev.state}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
