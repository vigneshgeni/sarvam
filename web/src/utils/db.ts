import type { RecentResult, ExplainResponse } from '../types'

const DB_NAME = 'sarvam_db'
const DB_VERSION = 1
const STORE_NAME = 'recent_results'
const MAX_ENTRIES = 20
const SETTING_KEY = 'sarvam.save_recent'

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

// Delete an individual recent item
export async function deleteRecentResult(id: string): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    // Non-fatal
  }
}

// Delete all recent results
export async function clearAllRecentResults(): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    // Non-fatal
  }
}
