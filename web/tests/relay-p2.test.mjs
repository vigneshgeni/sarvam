import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

async function loadRelayApi() {
  const ts = (await import('typescript')).default
  const absPath = fs.existsSync('src/features/relay/room/relayApi.ts')
    ? path.resolve('src/features/relay/room/relayApi.ts')
    : path.resolve('web/src/features/relay/room/relayApi.ts')
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'relay-p2-')))
  const transpiled = ts.transpileModule(fs.readFileSync(absPath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const entry = path.join(dir, 'relayApi.mjs')
  fs.writeFileSync(entry, transpiled)
  return await import(entry)
}

test('P2: room code validation and normalization rejects ambiguous chars and bad lengths', async () => {
  const { isValidRoomCode, normalizeRoomCode, extractGuestCodeFromPath } = await loadRelayApi()

  assert.equal(normalizeRoomCode('k7qm'), 'K7QM')
  assert.equal(normalizeRoomCode(' k7-qm! '), 'K7QM')
  assert.equal(isValidRoomCode('K7QM'), true)
  assert.equal(isValidRoomCode('k7qm'), true)
  // Ambiguous characters (0, O, 1, I, L) rejected
  assert.equal(isValidRoomCode('O01I'), false)
  assert.equal(isValidRoomCode('K7QL'), false)
  // Too short
  assert.equal(isValidRoomCode('K7Q'), false)

  // Path extraction for /r/:code
  assert.equal(extractGuestCodeFromPath('/r/K7QM'), 'K7QM')
  assert.equal(extractGuestCodeFromPath('/r/k7qm/'), 'K7QM')
  assert.equal(extractGuestCodeFromPath('/'), null)
  assert.equal(extractGuestCodeFromPath('/relay-spike'), null)
})

test('P2: invite link builder and WhatsApp share URL builder', async () => {
  const { buildRoomJoinUrl, buildWhatsAppShareUrl } = await loadRelayApi()

  const joinUrl = buildRoomJoinUrl('k7qm', 'https://sarvam-510715--relay.web.app/')
  assert.equal(joinUrl, 'https://sarvam-510715--relay.web.app/r/K7QM')

  const waUrl = buildWhatsAppShareUrl('K7QM', joinUrl, 'Vignesh')
  assert.ok(waUrl.startsWith('https://wa.me/?text='))
  const decoded = decodeURIComponent(waUrl.split('text=')[1])
  assert.ok(decoded.includes('Vignesh'))
  assert.ok(decoded.includes(joinUrl))
  assert.ok(decoded.includes('K7QM'))
})

test('P2: relayApi error mapping maps every backend error code and network failure cleanly', async () => {
  const { mapRelayApiError } = await loadRelayApi()

  assert.equal(mapRelayApiError(404, 'not_found').i18nKey, 'relayRoomErrNotFound')
  assert.equal(mapRelayApiError(410, 'expired').i18nKey, 'relayRoomErrExpired')
  assert.equal(mapRelayApiError(410, 'ended').i18nKey, 'relayRoomErrEnded')
  assert.equal(mapRelayApiError(409, 'full').i18nKey, 'relayRoomErrFull')
  assert.equal(mapRelayApiError(429, 'rate_limited').code, 'rate_limited')
  assert.equal(mapRelayApiError(503, 'livekit_not_configured').code, 'livekit_not_configured')
  assert.equal(mapRelayApiError(401).code, 'unauthorized')
  assert.equal(mapRelayApiError(0).code, 'network')
})
