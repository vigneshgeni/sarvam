import test from 'node:test'
import assert from 'node:assert/strict'

function createMockRequest(result) {
  let _onsuccess = null
  let _onerror = null
  const req = {
    result,
    set onsuccess(fn) {
      _onsuccess = fn
      if (fn) setTimeout(() => fn({ target: req }), 0)
    },
    get onsuccess() {
      return _onsuccess
    },
    set onerror(fn) {
      _onerror = fn
    },
    get onerror() {
      return _onerror
    },
  }
  return req
}

class MockIDBStore {
  constructor(name, keyPath) {
    this.name = name
    this.keyPath = keyPath
    this.data = new Map()
  }

  put(item) {
    const key = item[this.keyPath]
    this.data.set(key, item)
    return createMockRequest(key)
  }

  get(key) {
    const item = this.data.get(key)
    return createMockRequest(item)
  }

  getAll() {
    const all = Array.from(this.data.values())
    return createMockRequest(all)
  }

  delete(key) {
    this.data.delete(key)
    return createMockRequest(undefined)
  }

  clear() {
    this.data.clear()
    return createMockRequest(undefined)
  }
}

class MockIDBTransaction {
  constructor(stores) {
    this.stores = stores
    this._oncomplete = null
  }

  set oncomplete(fn) {
    this._oncomplete = fn
    if (fn) setTimeout(() => fn(), 5)
  }

  get oncomplete() {
    return this._oncomplete
  }

  objectStore(name) {
    return this.stores[name]
  }
}


class MockIDBDatabase {
  constructor() {
    this.objectStoreNames = {
      contains: (name) => name in this.stores,
    }
    this.stores = {
      recent_results: new MockIDBStore('recent_results', 'id'),
      original_files: new MockIDBStore('original_files', 'resultId'),
    }
  }

  transaction(storeNames, mode) {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames]
    const active = {}
    for (const n of names) {
      active[n] = this.stores[n]
    }
    return new MockIDBTransaction(active)
  }
}

// Logic implementations mirror web/src/utils/db.ts
const MAX_ORIGINALS_BYTES = 40 * 1024 * 1024 // 40 MB

async function mockSaveOriginalFiles(db, resultId, files, timestamp = Date.now()) {
  const items = files.map((f, i) => ({
    name: f.name || `page-${i + 1}.jpg`,
    type: f.type || 'image/jpeg',
    blob: f,
  }))

  const entryBytes = files.reduce((sum, f) => sum + (f.size || 0), 0)
  if (entryBytes > MAX_ORIGINALS_BYTES) {
    return false // Skip preview storage
  }

  const tx = db.transaction(['original_files'], 'readwrite')
  const store = tx.objectStore('original_files')

  const records = await new Promise((res) => {
    const req = store.getAll()
    req.onsuccess = () => res(req.result)
  })

  records.sort((a, b) => a.timestamp - b.timestamp)
  let totalStoredBytes = records.reduce((sum, r) => sum + (r.totalBytes || 0), 0)

  // Drop oldest until new entry fits within 40 MB
  while (totalStoredBytes + entryBytes > MAX_ORIGINALS_BYTES && records.length > 0) {
    const oldest = records.shift()
    store.delete(oldest.resultId)
    totalStoredBytes -= oldest.totalBytes || 0
  }

  store.put({
    resultId,
    timestamp,
    totalBytes: entryBytes,
    files: items,
  })

  await new Promise((res) => {
    tx.oncomplete = () => res()
  })
  return true
}

async function mockGetOriginalFiles(db, resultId) {
  const tx = db.transaction(['original_files'], 'readonly')
  const store = tx.objectStore('original_files')
  return new Promise((res) => {
    const req = store.get(resultId)
    req.onsuccess = () => res(req.result?.files || null)
    req.onerror = () => res(null)
  })
}

async function mockDeleteRecentResult(db, id) {
  const tx = db.transaction(['recent_results', 'original_files'], 'readwrite')
  tx.objectStore('recent_results').delete(id)
  tx.objectStore('original_files').delete(id)
  return new Promise((res) => {
    tx.oncomplete = () => res()
  })
}

async function mockClearAllRecentResults(db) {
  const tx = db.transaction(['recent_results', 'original_files'], 'readwrite')
  tx.objectStore('recent_results').clear()
  tx.objectStore('original_files').clear()
  return new Promise((res) => {
    tx.oncomplete = () => res()
  })
}

test('Document preview - saves originals locally in original_files store', async () => {
  const db = new MockIDBDatabase()
  const fakeFile = { name: 'bill.pdf', type: 'application/pdf', size: 1024 * 50 } // 50 KB

  const saved = await mockSaveOriginalFiles(db, 'res-101', [fakeFile])
  assert.equal(saved, true)

  const retrieved = await mockGetOriginalFiles(db, 'res-101')
  assert.ok(retrieved)
  assert.equal(retrieved.length, 1)
  assert.equal(retrieved[0].name, 'bill.pdf')
})

test('Document preview - 40MB cap evicts oldest originals while keeping results', async () => {
  const db = new MockIDBDatabase()

  // Put corresponding results in recent_results
  db.stores.recent_results.put({ id: 'res-old', title: 'Old Bill', timestamp: 1000 })
  db.stores.recent_results.put({ id: 'res-new', title: 'New Bill', timestamp: 2000 })

  // res-old has 25 MB file
  const file25MB = { name: 'old.pdf', type: 'application/pdf', size: 25 * 1024 * 1024 }
  await mockSaveOriginalFiles(db, 'res-old', [file25MB], 1000)

  // res-mid has 20 MB file (total would be 45 MB > 40 MB, so res-old must be evicted)
  const file20MB = { name: 'new.pdf', type: 'application/pdf', size: 20 * 1024 * 1024 }
  await mockSaveOriginalFiles(db, 'res-new', [file20MB], 2000)

  // Old original is dropped
  const oldOriginals = await mockGetOriginalFiles(db, 'res-old')
  assert.equal(oldOriginals, null, 'Old original files must be evicted when exceeding 40 MB')

  // New original is preserved
  const newOriginals = await mockGetOriginalFiles(db, 'res-new')
  assert.ok(newOriginals, 'New original files must be preserved')
  assert.equal(newOriginals.length, 1)

  // But the old result in recent_results is still intact!
  const oldResult = db.stores.recent_results.data.get('res-old')
  assert.ok(oldResult, 'Result record in recent_results must not be deleted when preview is evicted')
  assert.equal(oldResult.title, 'Old Bill')
})

test('Delete single recent item purges its original files from device', async () => {
  const db = new MockIDBDatabase()
  db.stores.recent_results.put({ id: 'res-target', title: 'Target Document' })
  await mockSaveOriginalFiles(db, 'res-target', [{ name: 'target.jpg', size: 500 }])

  assert.ok(db.stores.recent_results.data.has('res-target'))
  assert.ok(await mockGetOriginalFiles(db, 'res-target'))

  await mockDeleteRecentResult(db, 'res-target')

  assert.equal(db.stores.recent_results.data.has('res-target'), false)
  assert.equal(await mockGetOriginalFiles(db, 'res-target'), null)
})

test('Delete all recent results purges all original files from device', async () => {
  const db = new MockIDBDatabase()
  db.stores.recent_results.put({ id: 'res-1', title: 'Doc 1' })
  db.stores.recent_results.put({ id: 'res-2', title: 'Doc 2' })
  await mockSaveOriginalFiles(db, 'res-1', [{ name: 'doc1.pdf', size: 100 }])
  await mockSaveOriginalFiles(db, 'res-2', [{ name: 'doc2.pdf', size: 200 }])

  assert.equal(db.stores.recent_results.data.size, 2)
  assert.equal(db.stores.original_files.data.size, 2)

  await mockClearAllRecentResults(db)

  assert.equal(db.stores.recent_results.data.size, 0)
  assert.equal(db.stores.original_files.data.size, 0)
})

test('Missing preview fallback - when original is not stored, returns null gracefully', async () => {
  const db = new MockIDBDatabase()
  const result = await mockGetOriginalFiles(db, 'non-existent-id')
  assert.equal(result, null)
})
