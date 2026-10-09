import { getDemoToken, setDemoToken } from './auth'

const API_BASE = (import.meta.env.VITE_LF_API_URL || 'http://127.0.0.1:43123').replace(/\/+$/, '')

export class LfApiError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

async function parse(res: Response): Promise<unknown> {
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string; detail?: unknown }
  if (!res.ok) {
    const code = data.error || 'http_error'
    const message = data.message || (typeof data.detail === 'string' ? data.detail : 'Something went wrong.')
    throw new LfApiError(code, message, res.status)
  }
  return data
}

function headers(extra?: HeadersInit): Headers {
  const h = new Headers(extra)
  const token = getDemoToken()
  if (token) h.set('Authorization', `Bearer ${token}`)
  return h
}

export async function lfFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: headers(init.headers),
    cache: 'no-store',
  })
  return parse(res)
}

export async function health(): Promise<{ status: string; demoMode: boolean; aadhaarLite: boolean }> {
  return lfFetch('/lf/health') as Promise<{ status: string; demoMode: boolean; aadhaarLite: boolean }>
}

export async function continueAsGuest(): Promise<{ token: string; uid: string }> {
  const data = (await lfFetch('/lf/demo/guest', { method: 'POST' })) as { token: string; uid: string }
  setDemoToken(data.token)
  return data
}

export async function getMe() {
  return lfFetch('/lf/me') as Promise<{
    uid: string
    guest: boolean
    demo: boolean
    displayName?: string
    karma: { returned: number }
    hasPhone: boolean
    consentAt?: string
    ageConfirmed: boolean
  }>
}

export async function putMe(body: Record<string, unknown>) {
  return lfFetch('/lf/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

export async function deleteMe() {
  return lfFetch('/lf/me', { method: 'DELETE' })
}

export async function getFeed(params: { city?: string; category?: string; days?: number } = {}) {
  const q = new URLSearchParams()
  if (params.city) q.set('city', params.city)
  if (params.category) q.set('category', params.category)
  if (params.days) q.set('days', String(params.days))
  return lfFetch(`/lf/feed?${q.toString()}`) as Promise<{ posts: PublicCard[] }>
}

export async function getCities() {
  return lfFetch('/lf/cities') as Promise<{ cities: { key: string; name: string; state: string }[] }>
}

export async function createPost(data: Record<string, unknown>, photos: File[] = []) {
  const form = new FormData()
  form.append('data', JSON.stringify(data))
  photos.forEach((p) => form.append('photos', p))
  return lfFetch('/lf/posts', { method: 'POST', body: form }) as Promise<{
    post: OwnerPost
    matches: MatchView[]
    warning?: string
  }>
}

export async function getMine() {
  return lfFetch('/lf/posts/mine') as Promise<{ posts: OwnerPost[] }>
}

export async function getMatches() {
  return lfFetch('/lf/matches') as Promise<{ matches: MatchView[] }>
}

export async function getQuestions(postId: string) {
  return lfFetch(`/lf/found/${postId}/questions`) as Promise<{ questions: string[]; postId: string }>
}

export async function createClaim(body: { matchId?: string; postId?: string; answers: string[]; message?: string }) {
  return lfFetch('/lf/claims', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as Promise<ClaimView>
}

export async function getClaim(id: string) {
  return lfFetch(`/lf/claims/${id}`) as Promise<ClaimView>
}

export async function shareContact(claimId: string, channels: string[]) {
  return lfFetch(`/lf/claims/${claimId}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channels }),
  })
}

export async function decideClaim(claimId: string, decision: 'approve' | 'decline') {
  return lfFetch(`/lf/claims/${claimId}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision }),
  })
}

export async function markReturned(matchId: string) {
  return lfFetch(`/lf/matches/${matchId}/returned`, { method: 'POST' })
}

export async function confirmReturned(matchId: string) {
  return lfFetch(`/lf/matches/${matchId}/returned/confirm`, { method: 'POST' })
}

export async function getThanks(matchId: string) {
  return lfFetch(`/lf/thanks/${matchId}`) as Promise<{
    finderFirstName: string | null
    anonymous: boolean
    upiVpa: string | null
    demo: boolean
  }>
}

export async function unreadCount() {
  return lfFetch('/lf/notifications/count') as Promise<{ unread: number }>
}

export async function reportPost(targetId: string, reason: string) {
  return lfFetch('/lf/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetType: 'post', targetId, reason }),
  })
}

export interface PublicCard {
  id: string
  type: string
  category: string
  title: string
  publicDescription?: string
  city: string
  area?: string
  foundAt?: string
  heldAt?: string
  status: string
  demo?: boolean
  publicPhotoUrl?: string | null
}

export interface MatchView {
  matchId: string
  kind: 'strong' | 'possible'
  scoreBand: string
  score: number
  reasons: { code: string; text: string }[]
  state: string
  otherPost: PublicCard
}

export interface OwnerPost {
  id: string
  type: string
  status: string
  category: string
  title: string
  publicDescription: string
  city: string
  area?: string
  demo?: boolean
  createdAt: string
  verification?: { questions: string[] } | null
}

export interface ClaimView {
  id: string
  matchId: string
  state: string
  questions?: string[]
  answers?: string[]
  counterpart?: {
    displayName?: string
    channels?: Record<string, string | null>
    demo?: boolean
  }
}
