import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function getPath(rel) {
  if (fs.existsSync(path.resolve(rel))) return path.resolve(rel)
  if (fs.existsSync(path.resolve('web', rel))) return path.resolve('web', rel)
  return path.resolve(rel)
}

test('PWA Audit - Web Manifest configuration', () => {
  const manifestPath = getPath('dist/manifest.webmanifest')
  assert.ok(fs.existsSync(manifestPath), 'manifest.webmanifest must exist in dist')

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  assert.equal(manifest.name, 'Sarvam')
  assert.equal(manifest.short_name, 'Sarvam')
  assert.equal(manifest.start_url, '/')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.theme_color, '#146B4E')
  assert.equal(manifest.background_color, '#F6F6F3')

  const iconSizes = manifest.icons.map((i) => i.sizes)
  assert.ok(iconSizes.includes('192x192'), 'Manifest must include 192x192 icon')
  assert.ok(iconSizes.includes('512x512'), 'Manifest must include 512x512 icon')
  assert.ok(
    manifest.icons.some((i) => i.purpose === 'maskable'),
    'Manifest must include maskable icon'
  )
})

test('PWA Audit - Service Worker app shell precache and NetworkOnly for /api', () => {
  const swPath = getPath('dist/sw.js')
  assert.ok(fs.existsSync(swPath), 'sw.js must be generated in dist')

  const swContent = fs.readFileSync(swPath, 'utf-8')

  // Verify /api is explicitly NetworkOnly and never cached
  assert.ok(
    swContent.includes('NetworkOnly'),
    'Service worker must register NetworkOnly strategy'
  )
  assert.ok(
    swContent.includes('/^\\/api\\/.*/i') || swContent.includes('/api/'),
    'Service worker must match /api routes for NetworkOnly'
  )
  assert.ok(
    swContent.includes('denylist') && (swContent.includes('/api/') || swContent.includes('\\/api\\/')),
    'NavigationRoute denylist must exclude /api routes'
  )

  // Verify precache entries never contain /api or sample documents
  assert.ok(!swContent.includes('/api/explain'), 'Precache must never include /api/explain')
  assert.ok(!swContent.includes('sample-insurance-letter.pdf'), 'Precache must never include sample documents')
})

test('PWA Audit - Apple Touch Icon exists and is 180px PNG', () => {
  const appleIconPath = getPath('public/apple-touch-icon.png')
  assert.ok(fs.existsSync(appleIconPath), 'apple-touch-icon.png must exist in public')

  const buf = fs.readFileSync(appleIconPath)
  // PNG signature check
  assert.equal(buf[0], 0x89)
  assert.equal(buf[1], 0x50)
  assert.equal(buf[2], 0x4e)
  assert.equal(buf[3], 0x47)

  // IHDR width and height (offset 16-23)
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  assert.equal(width, 180, 'apple-touch-icon width must be 180px')
  assert.equal(height, 180, 'apple-touch-icon height must be 180px')
})

