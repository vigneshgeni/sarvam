import type { RecentResult, ExplainResponse } from '../types'
import { downscaleImageForStorage } from './image'

const DB_NAME = 'sarvam_db'
const DB_VERSION = 2
const STORE_NAME = 'recent_results'
const ORIGINALS_STORE = 'original_files'
const MAX_ENTRIES = 20
export const MAX_ORIGINALS_BYTES = 40 * 1024 * 1024 // 40 MB
const SETTING_KEY = 'sarvam.save_recent'

export interface StoredOriginalItem {
  name: string
  type: string
  blob: Blob
}

export interface StoredOriginalRecord {
  resultId: string
  timestamp: number
  totalBytes: number
  files: StoredOriginalItem[]
}

// Setting: "Save results on this phone", default ON
export function isSaveRecentEnabled(): boolean {
  try {
    const val = localStorage.getItem(SETTING_KEY)
    return val === null ? true : val === 'true'
  } catch {
    return true
  }
}

export function setSaveRecentEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SETTING_KEY, enabled ? 'true' : 'false')
  } catch {
    // Ignore localStorage errors
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
      if (!db.objectStoreNames.contains(ORIGINALS_STORE)) {
        const origStore = db.createObjectStore(ORIGINALS_STORE, { keyPath: 'resultId' })
        origStore.createIndex('timestamp', 'timestamp', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}


// Get all recent results (sorted by newest first, max 20)
export async function getRecentResults(): Promise<RecentResult[]> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const index = store.index('timestamp')
      const request = index.openCursor(null, 'prev')
      const results: RecentResult[] = []

      request.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor && results.length < MAX_ENTRIES) {
          results.push(cursor.value)
          cursor.continue()
        } else {
          resolve(results)
        }
      }

      request.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}

// Save a result JSON only (never files, never audio)
export async function saveRecentResult(
  entry: Omit<RecentResult, 'id' | 'timestamp'> & { id?: string; timestamp?: number }
): Promise<void> {
  if (!isSaveRecentEnabled()) return

  try {
    const db = await openDB()
    const item: RecentResult = {
      id: entry.id || `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: entry.timestamp || Date.now(),
      title: entry.title,
      fileCount: entry.fileCount,
      fileNames: entry.fileNames || [],
      lang: entry.lang,
      result: entry.result, // Result JSON only
      translations: entry.translations || {},
      multiReports: entry.multiReports,
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.put(item)

      // Enforce max 20 entries: delete oldest if count exceeds 20
      const index = store.index('timestamp')
      const allKeysReq = index.getAllKeys()
      allKeysReq.onsuccess = () => {
        const keys = allKeysReq.result
        if (keys.length > MAX_ENTRIES) {
          const keysToDelete = keys.slice(0, keys.length - MAX_ENTRIES)
          for (const key of keysToDelete) {
            store.delete(key)
          }
        }
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Non-fatal if IndexedDB write fails
  }
}

// Save a translated result into that Recent entry (keyed by language)
export async function saveRecentTranslation(
  id: string,
  lang: string,
  translatedResult: ExplainResponse
): Promise<void> {
  if (!isSaveRecentEnabled()) return

  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const getReq = store.get(id)

      getReq.onsuccess = () => {
        const item = getReq.result as RecentResult | undefined
        if (item) {
          if (!item.translations) {
            item.translations = {}
          }
          item.translations[lang] = translatedResult
          store.put(item)
        }
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Non-fatal
  }
}

// Save original uploaded files/photos locally in IndexedDB (max 40 MB total cap)
export async function saveOriginalFiles(
  resultId: string,
  files: (File | Blob)[],
  fileNames?: string[]
): Promise<void> {
  if (!isSaveRecentEnabled()) return
  if (typeof indexedDB === 'undefined') return

  try {
    const items: StoredOriginalItem[] = []
    let entryBytes = 0

    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      const name = (f instanceof File ? f.name : fileNames?.[i]) || `page-${i + 1}.jpg`
      const type = f.type || (name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg')

      let storedBlob: Blob = f
      if (type.startsWith('image/')) {
        try {
          storedBlob = await downscaleImageForStorage(f, name)
        } catch {
          storedBlob = f
        }
      }

      entryBytes += storedBlob.size
      items.push({
        name,
        type,
        blob: storedBlob,
      })
    }

    // If entry alone exceeds 40MB limit, skip preview storage
    if (entryBytes > MAX_ORIGINALS_BYTES) {
      console.warn(`[Originals] Entry size ${entryBytes} exceeds 40MB limit, skipping preview storage`)
      return
    }

    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ORIGINALS_STORE, 'readwrite')
      const store = tx.objectStore(ORIGINALS_STORE)

      const allReq = store.getAll()
      allReq.onsuccess = () => {
        const records = (allReq.result as StoredOriginalRecord[]) || []
        // Sort ascending by timestamp (oldest first)
        records.sort((a, b) => a.timestamp - b.timestamp)

        let totalStoredBytes = records.reduce((sum, r) => sum + (r.totalBytes || 0), 0)

        // Drop oldest entries until new entry fits within 40 MB
        while (totalStoredBytes + entryBytes > MAX_ORIGINALS_BYTES && records.length > 0) {
          const oldest = records.shift()!
          store.delete(oldest.resultId)
          totalStoredBytes -= (oldest.totalBytes || 0)
        }

        const record: StoredOriginalRecord = {
          resultId,
          timestamp: Date.now(),
          totalBytes: entryBytes,
          files: items,
        }
        store.put(record)
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[Originals] Failed to save original files to IndexedDB', err)
  }
}

// Get original uploaded files for a result ID
export async function getOriginalFiles(resultId: string): Promise<StoredOriginalItem[] | null> {
  if (typeof indexedDB === 'undefined') return null
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(ORIGINALS_STORE, 'readonly')
      const store = tx.objectStore(ORIGINALS_STORE)
      const req = store.get(resultId)
      req.onsuccess = () => {
        const record = req.result as StoredOriginalRecord | undefined
        resolve(record?.files || null)
      }
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

// Delete an individual recent item and its original preview files
export async function deleteRecentResult(id: string): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const stores = [STORE_NAME]
      if (db.objectStoreNames.contains(ORIGINALS_STORE)) {
        stores.push(ORIGINALS_STORE)
      }
      const tx = db.transaction(stores, 'readwrite')
      tx.objectStore(STORE_NAME).delete(id)
      if (db.objectStoreNames.contains(ORIGINALS_STORE)) {
        tx.objectStore(ORIGINALS_STORE).delete(id)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    // Non-fatal
  }
}

// Delete all recent results and all original preview files
export async function clearAllRecentResults(): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const stores = [STORE_NAME]
      if (db.objectStoreNames.contains(ORIGINALS_STORE)) {
        stores.push(ORIGINALS_STORE)
      }
      const tx = db.transaction(stores, 'readwrite')
      tx.objectStore(STORE_NAME).clear()
      if (db.objectStoreNames.contains(ORIGINALS_STORE)) {
        tx.objectStore(ORIGINALS_STORE).clear()
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    // Non-fatal
  }
}

