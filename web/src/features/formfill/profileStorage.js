/**
 * IndexedDB helpers for Form Fill profile ("profile" store) and saved drafts ("drafts" store).
 * Uses the shared sarvam_db (version 4) with additive, non-destructive upgrades.
 */
import { sanitizeProfileForStorage } from './formMath.js'

export const SARVAM_DB_NAME = 'sarvam_db'
export const SARVAM_DB_VERSION = 4
export const PROFILE_STORE = 'profile'
export const DRAFTS_STORE = 'drafts'
const MAX_DRAFTS = 20

function openFormFillDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'))
      return
    }
    const request = indexedDB.open(SARVAM_DB_NAME, SARVAM_DB_VERSION)
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains('recent_results')) {
        const store = db.createObjectStore('recent_results', { keyPath: 'id' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
      if (!db.objectStoreNames.contains('original_files')) {
        const origStore = db.createObjectStore('original_files', { keyPath: 'resultId' })
        origStore.createIndex('timestamp', 'timestamp', { unique: false })
      }
      if (!db.objectStoreNames.contains('read_cache')) {
        db.createObjectStore('read_cache', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(PROFILE_STORE)) {
        db.createObjectStore(PROFILE_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(DRAFTS_STORE)) {
        const drafts = db.createObjectStore(DRAFTS_STORE, { keyPath: 'id' })
        drafts.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function getUserProfile(id = 'me') {
  try {
    const db = await openFormFillDB()
    if (!db.objectStoreNames.contains(PROFILE_STORE)) return null
    return await new Promise((resolve) => {
      const tx = db.transaction(PROFILE_STORE, 'readonly')
      const req = tx.objectStore(PROFILE_STORE).get(id)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function saveUserProfile(profile) {
  const clean = sanitizeProfileForStorage({ ...profile, id: profile?.id || 'me', updatedAt: Date.now() })
  try {
    const db = await openFormFillDB()
    if (!db.objectStoreNames.contains(PROFILE_STORE)) return clean
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PROFILE_STORE, 'readwrite')
      tx.objectStore(PROFILE_STORE).put(clean)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Non-fatal
  }
  return clean
}

export async function getFormDrafts() {
  try {
    const db = await openFormFillDB()
    if (!db.objectStoreNames.contains(DRAFTS_STORE)) return []
    return await new Promise((resolve) => {
      const tx = db.transaction(DRAFTS_STORE, 'readonly')
      const req = tx.objectStore(DRAFTS_STORE).getAll()
      req.onsuccess = () => {
        const rows = Array.isArray(req.result) ? req.result : []
        rows.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
        resolve(rows.slice(0, MAX_DRAFTS))
      }
      req.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}

export async function getFormDraft(id) {
  if (!id) return null
  try {
    const db = await openFormFillDB()
    if (!db.objectStoreNames.contains(DRAFTS_STORE)) return null
    return await new Promise((resolve) => {
      const tx = db.transaction(DRAFTS_STORE, 'readonly')
      const req = tx.objectStore(DRAFTS_STORE).get(id)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function saveFormDraft(draft) {
  const now = Date.now()
  const record = {
    id: draft?.id || `draft-${now}-${Math.random().toString(36).slice(2, 7)}`,
    title: String(draft?.title || 'Form').trim() || 'Form',
    pageImages: Array.isArray(draft?.pageImages) ? draft.pageImages : [],
    fields: Array.isArray(draft?.fields) ? draft.fields : [],
    values: draft?.values && typeof draft.values === 'object' ? { ...draft.values } : {},
    pdfBlob: draft?.pdfBlob || null,
    createdAt: Number(draft?.createdAt) || now,
    updatedAt: now,
    status: draft?.status === 'ready' ? 'ready' : 'draft',
  }
  try {
    const db = await openFormFillDB()
    if (!db.objectStoreNames.contains(DRAFTS_STORE)) return record
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFTS_STORE, 'readwrite')
      const store = tx.objectStore(DRAFTS_STORE)
      store.put(record)
      const allReq = store.getAll()
      allReq.onsuccess = () => {
        const rows = Array.isArray(allReq.result) ? allReq.result : []
        if (rows.length > MAX_DRAFTS) {
          rows.sort((a, b) => (a.updatedAt || a.createdAt || 0) - (b.updatedAt || b.createdAt || 0))
          for (const extra of rows.slice(0, rows.length - MAX_DRAFTS)) {
            store.delete(extra.id)
          }
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Non-fatal
  }
  return record
}

export async function deleteFormDraft(id) {
  if (!id) return
  try {
    const db = await openFormFillDB()
    if (!db.objectStoreNames.contains(DRAFTS_STORE)) return
    await new Promise((resolve) => {
      const tx = db.transaction(DRAFTS_STORE, 'readwrite')
      tx.objectStore(DRAFTS_STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    // Non-fatal
  }
}
