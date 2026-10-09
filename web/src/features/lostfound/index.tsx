import { useCallback, useEffect, useRef, useState } from 'react'
import './lf.css'
import {
  continueAsGuest,
  createClaim,
  createPost,
  deleteMe,
  getClaim,
  getFeed,
  getMatches,
  getMe,
  getMine,
  getQuestions,
  getThanks,
  health,
  markReturned,
  putMe,
  confirmReturned,
  reportPost,
  shareContact,
  unreadCount,
  type ClaimView,
  type MatchView,
  type OwnerPost,
  type PublicCard,
} from './api'
import { clearDemoToken, getAppLanguage, getDemoToken } from './auth'
import { Icon } from './components/Icon'
import Sheet from './components/Sheet'
import { SafetyTips } from './components/SafetyTips'
import { ThankYouCard } from './components/ThankYouCard'
import { getFirebaseAuth } from './firebase'
import { pushLf, readLf, rewindLfHistoryOnLoad } from './utils/lfHistory'
import { CATEGORIES, DEMO_QUESTIONS, TEST_IDS, TONE_CLASS, catOf, type CategoryId } from './utils/categories'
import { CHENNAI_AREAS, CITIES } from './utils/cities'
import { looksLikeCard } from './utils/mask'
import { daysAgoIso, agoFromIso, todayIso } from './utils/time'
import { buildUpiLink } from './utils/upi'
import { shareOrDownload, thanksCaption } from './utils/shareCard'
import { lfString, type LfKey } from './i18n/useLfT'
import passportGuide from './guide/passport.json'
import aadhaarGuide from './guide/aadhaar.json'
import panGuide from './guide/pan.json'
import licenceGuide from './guide/licence.json'
import phoneGuide from './guide/phone.json'
import voterGuide from './guide/voter.json'
import walletGuide from './guide/wallet.json'
import rcGuide from './guide/rc.json'
import certGuide from './guide/certificate.json'

const GUIDES = [passportGuide, aadhaarGuide, panGuide, licenceGuide, voterGuide, phoneGuide, walletGuide, rcGuide, certGuide]

type Tab = 'home' | 'me' | 'guide'
type Sheet = null | { kind: 'wiz' } | { kind: 'thanks' } | { kind: 'pub'; post: PublicCard }
type Layer = null | 'claim' | 'privacy' | 'report' | 'share' | 'safety'

interface Wiz {
  kind: 'lost' | 'found'
  step: number
  cat: CategoryId | ''
  desc: string
  idnum: string
  area: string
  city: string
  days: number | null
  radiusKm: number | null
  heldAt: string
  q1: string
  q2: string
  consent: boolean
}

const emptyWiz = (kind: 'lost' | 'found'): Wiz => ({
  kind,
  step: 1,
  cat: '',
  desc: '',
  idnum: '',
  area: '',
  city: 'chennai',
  days: null,
  radiusKm: 5,
  heldAt: 'with_me',
  q1: '',
  q2: '',
  consent: false,
})

export default function LostFoundHome({ lang: langFromApp }: { lang?: string } = {}) {
  const [lang, setLang] = useState(() => langFromApp || getAppLanguage())
  useEffect(() => {
    if (langFromApp) setLang(langFromApp)
  }, [langFromApp])
  const t = useCallback((k: LfKey) => lfString(lang, k), [lang])
  const [tab, setTab] = useState<Tab>('home')
  const [token, setToken] = useState<string | null>(() => getDemoToken())
  const [feed, setFeed] = useState<PublicCard[]>([])
  const [mine, setMine] = useState<OwnerPost[]>([])
  const [matches, setMatches] = useState<MatchView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(!navigator.onLine)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [layer, setLayer] = useState<Layer>(null)
  const [wiz, setWiz] = useState<Wiz | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [city, setCity] = useState('chennai')
  const [category, setCategory] = useState<string>('')
  const [claim, setClaim] = useState<ClaimView | null>(null)
  const [answers, setAnswers] = useState<string[]>(['', ''])
  const [activeMatch, setActiveMatch] = useState<MatchView | null>(null)
  const [questions, setQuestions] = useState<string[]>([])
  const [phone, setPhone] = useState('')
  const [sharePhone, setSharePhone] = useState(false)
  const [amt, setAmt] = useState(100)
  const [upi, setUpi] = useState<string | null>(null)
  const [thanksDemo, setThanksDemo] = useState(true)
  const [unread, setUnread] = useState(0)
  const [live, setLive] = useState('')
  const [apiUp, setApiUp] = useState(true)
  const [demoMode, setDemoMode] = useState<boolean | null>(null)
  const [reportPostId, setReportPostId] = useState<string | null>(null)
  const [shareCaption, setShareCaption] = useState('')
  const depthRef = useRef(0)
  const applyingPop = useRef(false)
  const ignorePops = useRef(0)
  const feedPostRef = useRef<PublicCard | null>(null)

  const ping = (msg: string) => {
    setToast(msg)
    setLive(msg)
    window.setTimeout(() => setToast(null), 2600)
  }

  const closeOverlays = useCallback(() => {
    setSheet(null)
    setLayer(null)
    setWiz(null)
  }, [])

  const pushScreen = useCallback((screenId: string) => {
    if (applyingPop.current) return
    const next = depthRef.current + 1
    depthRef.current = next
    pushLf({ depth: next, screenId })
  }, [])

  const closeToRootHistory = useCallback(() => {
    const d = depthRef.current
    if (d <= 0) {
      closeOverlays()
      return
    }
    applyingPop.current = true
    ignorePops.current = 1
    depthRef.current = 0
    closeOverlays()
    window.history.go(-d)
    window.setTimeout(() => {
      applyingPop.current = false
    }, 0)
  }, [closeOverlays])

  const applyLf = useCallback(
    (lf: { depth: number; screenId: string } | null) => {
      if (!lf || lf.depth <= 0) {
        closeOverlays()
        return
      }
      const id = lf.screenId
      const wizMatch = /^post-(lost|found)-(\d+)$/.exec(id)
      if (wizMatch) {
        const kind = wizMatch[1] as 'lost' | 'found'
        const step = Math.max(1, Number(wizMatch[2]))
        setLayer(null)
        setWiz((w) => {
          const base = w && w.kind === kind ? w : emptyWiz(kind)
          return { ...base, step }
        })
        setSheet({ kind: 'wiz' })
        return
      }
      if (id === 'feed') {
        setLayer(null)
        setWiz(null)
        const p = feedPostRef.current
        setSheet(p ? { kind: 'pub', post: p } : null)
        return
      }
      if (id === 'thanks') {
        setLayer(null)
        setWiz(null)
        setSheet({ kind: 'thanks' })
        return
      }
      if (id === 'claim' || id === 'privacy' || id === 'report' || id === 'share' || id === 'safety') {
        setLayer(id)
        return
      }
      closeOverlays()
    },
    [closeOverlays],
  )

  useEffect(() => {
    ignorePops.current = rewindLfHistoryOnLoad()
    depthRef.current = 0
    const onPop = (e: PopStateEvent) => {
      if (ignorePops.current > 0) {
        ignorePops.current -= 1
        const landed = readLf(e.state)
        depthRef.current = landed?.depth ?? 0
        applyLf(landed)
        applyingPop.current = false
        return
      }
      const lf = readLf(e.state)
      if (!lf) {
        depthRef.current = 0
        closeOverlays()
        return
      }
      applyingPop.current = true
      depthRef.current = lf.depth
      applyLf(lf)
      applyingPop.current = false
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [applyLf, closeOverlays])

  const refresh = useCallback(async () => {
    try {
      const h = await health()
      setApiUp(h.status === 'ok')
      setDemoMode(h.demoMode)
      const feedRes = await getFeed({ city, category: category || undefined, days: 90 })
      setFeed(feedRes.posts)
      if (getDemoToken()) {
        const [m, ms, n] = await Promise.all([getMine(), getMatches(), unreadCount()])
        setMine(m.posts)
        setMatches(ms.matches)
        setUnread(n.unread)
        await getMe()
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorRetry'))
    } finally {
      setLoading(false)
    }
  }, [city, category, t])

  useEffect(() => {
    void refresh()
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    const iv = window.setInterval(() => {
      if (document.visibilityState === 'visible' && getDemoToken()) {
        void unreadCount().then((n) => setUnread(n.unread)).catch(() => undefined)
      }
    }, 30000)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      window.clearInterval(iv)
    }
  }, [refresh])

  useEffect(() => {
    if (!claim || claim.state !== 'pending') return
    const id = window.setInterval(() => {
      void getClaim(claim.id)
        .then((c) => {
          setClaim(c)
          if (c.state === 'approved') ping(t('approved'))
          if (c.state === 'declined') ping('Demo finder declined — try the expected keywords.')
        })
        .catch(() => undefined)
    }, 2000)
    return () => window.clearInterval(id)
  }, [claim, t])

  const guest = async () => {
    const g = await continueAsGuest()
    setToken(g.token)
    ping('Signed in as demo guest')
    await refresh()
  }

  const startWiz = (kind: 'lost' | 'found') => {
    if (!token) {
      ping(t('needGuest'))
      return
    }
    const w = emptyWiz(kind)
    setWiz(w)
    setSheet({ kind: 'wiz' })
    pushScreen(`post-${kind}-1`)
  }

  const fillDemoStory = () => {
    if (!token) {
      void guest().then(() => fillDemoStory())
      return
    }
    const w = emptyWiz('lost')
    w.step = 4
    w.cat = 'passport'
    w.desc = 'Maroon passport booklet in a clear plastic cover'
    w.idnum = 'Z1234567'
    w.city = 'chennai'
    w.area = 'Adyar'
    w.days = 1
    w.radiusKm = 5
    w.consent = true
    setWiz(w)
    setSheet({ kind: 'wiz' })
    pushScreen('post-lost-4')
  }

  const wizGate = (w: Wiz) => {
    if (w.step === 1) return !!w.cat
    if (w.step === 2) return w.desc.trim().length >= 3 && !looksLikeCard(w.desc)
    if (w.step === 3) return !!w.city && w.days !== null
    return w.consent
  }

  const submitWiz = async () => {
    if (!wiz) return
    const cat = wiz.cat as CategoryId
    const dateFrom = wiz.days === null ? daysAgoIso(14) : daysAgoIso(wiz.days)
    const payload: Record<string, unknown> = {
      type: wiz.kind,
      category: cat,
      title: wiz.desc.slice(0, 80) || catOf(cat).label,
      publicDescription: wiz.desc,
      privateDescription: '',
      city: wiz.city,
      area: wiz.area,
      radiusKm: wiz.radiusKm,
      dateFrom,
      dateTo: todayIso(),
      foundAt: wiz.kind === 'found' ? daysAgoIso(wiz.days || 0) : undefined,
      heldAt: wiz.kind === 'found' ? wiz.heldAt : undefined,
      identifiers: wiz.idnum && !catOf(cat).noNumber ? [{ idType: cat === 'driving_licence' ? 'driving_licence' : cat === 'passport' ? 'passport' : 'other_id', idNumber: wiz.idnum }] : [],
      questions: wiz.kind === 'found' ? [wiz.q1, wiz.q2].filter(Boolean) : [],
      consent: true,
      ageConfirmed: true,
      autoMatchIds: true,
      lang,
    }
    setLive(t('checking'))
    try {
      const res = await createPost(payload)
      setWiz(null)
      setMine((m) => [res.post, ...m])
      setMatches(res.matches)
      if (res.matches[0]) {
        setActiveMatch(res.matches[0])
        const q = await getQuestions(res.matches[0].otherPost.id)
        setQuestions(q.questions)
        setAnswers(q.questions.map(() => ''))
        setWiz(null)
        setSheet(null)
        setLayer('claim')
        pushScreen('claim')
        ping(res.matches[0].kind === 'strong' ? t('strongMatch') : t('possibleMatch'))
      } else {
        closeToRootHistory()
        ping(t('noMatch'))
      }
      await refresh()
    } catch (err) {
      ping(err instanceof Error ? err.message : t('errorRetry'))
    }
  }

  const sendClaim = async () => {
    if (!activeMatch) return
    try {
      const c = await createClaim({ matchId: activeMatch.matchId, answers })
      setClaim(c)
      ping(t('waitingFinder'))
    } catch (err) {
      ping(err instanceof Error ? err.message : t('errorRetry'))
    }
  }

  const doShare = async () => {
    if (!claim) return
    if (sharePhone && phone) await putMe({ phone, consent: true, ageConfirmed: true })
    await shareContact(claim.id, sharePhone ? ['phone'] : [])
    ping('Shared')
    await refresh()
  }

  const doReturned = async () => {
    if (!activeMatch) return
    await markReturned(activeMatch.matchId)
    await confirmReturned(activeMatch.matchId)
    const th = await getThanks(activeMatch.matchId)
    setUpi(th.upiVpa)
    setThanksDemo(Boolean(th.demo) || demoMode === true)
    setLayer(null)
    setSheet({ kind: 'thanks' })
    pushScreen('thanks')
    ping(t('thanksTitle'))
  }

  const openFeed = (post: PublicCard) => {
    feedPostRef.current = post
    setSheet({ kind: 'pub', post })
    pushScreen('feed')
  }

  const openClaimForPost = async (post: PublicCard) => {
    if (!token) {
      ping(t('needGuest'))
      return
    }
    try {
      const existing = matches.find((m) => m.otherPost.id === post.id)
      if (existing) setActiveMatch(existing)
      else {
        setActiveMatch({
          matchId: '',
          kind: 'possible',
          scoreBand: 'medium',
          score: 0,
          reasons: [],
          state: 'suggested',
          otherPost: post,
        })
      }
      const q = await getQuestions(post.id)
      setQuestions(q.questions)
      setAnswers(q.questions.map(() => ''))
      setClaim(null)
      setLayer('claim')
      pushScreen('claim')
    } catch (err) {
      ping(err instanceof Error ? err.message : t('errorRetry'))
    }
  }

  const openLayer = (next: Exclude<Layer, null>) => {
    setLayer(next)
    pushScreen(next)
  }

  const cityLabel = (key: string) => CITIES.find((c) => c.key === key)?.name || key

  const home = (
    <div className="lf-view">
      {offline ? <div className="lf-offline">{t('offline')}</div> : null}
      <div className="lf-stack" style={{ gap: 6 }}>
        <div className="lf-h1-row">
          <h1 className="lf-h1">{t('title')}</h1>
          {demoMode ? <span className="lf-badge lf-b-violet">{t('demoChip')}</span> : null}
        </div>
        <p className="lf-sub">{t('sub')}</p>
      </div>
      {!token ? (
        <div className="lf-stack">
          {demoMode === true ? (
            <button className="lf-btn primary block" onClick={() => void guest()}>
              {t('guest')}
            </button>
          ) : demoMode === false && getFirebaseAuth() ? (
            <button className="lf-btn line block">{t('google')}</button>
          ) : demoMode === false ? (
            <p className="lf-hint">{t('signInUnavailable')}</p>
          ) : (
            <div className="lf-skel" style={{ height: 48, borderRadius: 999 }} />
          )}
        </div>
      ) : (
        <button className="lf-chip on" onClick={fillDemoStory}>
          {t('demoStory')}
        </button>
      )}
      <div className="lf-hero">
        <button className="lf-herobtn lf-hb-lost" onClick={() => startWiz('lost')}>
          <span className="lf-ico">
            <Icon name="search" />
          </span>
          <span>
            <b>{t('lost')}</b>
          </span>
          <small>{t('lostHint')}</small>
        </button>
        <button className="lf-herobtn lf-hb-found" onClick={() => startWiz('found')}>
          <span className="lf-ico">
            <Icon name="heart" />
          </span>
          <span>
            <b>{t('found')}</b>
          </span>
          <small>{t('foundHint')}</small>
        </button>
      </div>
      <div className="lf-callout priv">
        <Icon name="lock" />
        <span>
          <b>{t('privacy')}</b>
        </span>
      </div>
      {unread > 0 ? (
        <button className="lf-card" onClick={() => setTab('me')} style={{ textAlign: 'left' }}>
          <div className="lf-row">
            <span className="lf-badge lf-b-coral">{unread}</span>
            <b className="lf-grow">{t('matches')}</b>
            <Icon name="chevR" />
          </div>
        </button>
      ) : null}
      {mine.length ? (
        <>
          <div className="lf-eyebrow">{t('yourPosts')}</div>
          <div className="lf-stack">
            {mine.map((p) => (
              <div className="lf-post" key={p.id}>
                <span className={`lf-ico ${TONE_CLASS[catOf(p.category).tone]}`}>
                  <Icon name={catOf(p.category).ico} />
                </span>
                <span className="lf-grow">
                  <b style={{ display: 'block' }}>
                    {p.type === 'lost' ? 'Lost' : 'Found'}: {catOf(p.category).label}
                  </b>
                  <span className="lf-meta">
                    {p.area} · {cityLabel(p.city)}
                  </span>
                </span>
                {p.demo ? <span className="lf-badge lf-b-violet">{t('demoChip')}</span> : null}
              </div>
            ))}
          </div>
        </>
      ) : null}
      <button className="lf-btn soft block" onClick={() => setTab('guide')}>
        {t('guide')}
      </button>
      <div className="lf-row wrap">
        {CITIES.slice(0, 6).map((c) => (
          <button key={c.key} className={`lf-chip ${city === c.key ? 'on' : ''}`} onClick={() => setCity(c.key)}>
            {c.name}
          </button>
        ))}
      </div>
      <div className="lf-row wrap">
        <button className={`lf-chip ${category === '' ? 'on' : ''}`} onClick={() => setCategory('')}>
          All
        </button>
        {CATEGORIES.slice(0, 6).map((c) => (
          <button key={c.id} className={`lf-chip ${category === c.id ? 'on' : ''}`} onClick={() => setCategory(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="lf-eyebrow">{t('feedFound')}</div>
      {loading ? (
        <div className="lf-stack">
          <div className="lf-skel" />
          <div className="lf-skel" style={{ width: '80%' }} />
        </div>
      ) : error ? (
        <div className="lf-empty">
          <p>{error}</p>
          <button className="lf-btn line" onClick={() => void refresh()} style={{ marginTop: 8 }}>
            {t('retry')}
          </button>
        </div>
      ) : feed.length === 0 ? (
        <div className="lf-empty">{t('emptyFeed')}</div>
      ) : (
        <div className="lf-stack">
          {feed.map((p) => (
            <button key={p.id} className="lf-post" onClick={() => openFeed(p)}>
              <span className={`lf-ico ${TONE_CLASS[catOf(p.category).tone]}`}>
                <Icon name={catOf(p.category).ico} />
              </span>
              <span className="lf-grow">
                <b style={{ display: 'block' }}>
                  Found: {catOf(p.category).label}
                </b>
                <span className="lf-meta">
                  <Icon name="pin" />
                  {p.area || cityLabel(p.city)} · {agoFromIso(p.foundAt)}
                </span>
                <span className="lf-sub" style={{ display: 'block', fontSize: '0.8em', marginTop: 2 }}>
                  {catOf(p.category).idCat ? 'Details hidden for safety' : p.publicDescription}
                </span>
              </span>
              {p.demo ? <span className="lf-badge lf-b-violet">{t('demoChip')}</span> : <Icon name="chevR" />}
            </button>
          ))}
        </div>
      )}
      <p className="lf-hint">{t('notLegal')}</p>
    </div>
  )

  const me = (
    <div className="lf-view">
      <h1 className="lf-h1">{t('profile')}</h1>
      <p className="lf-sub">{token ? 'Demo guest on this phone.' : t('signedOut')}</p>
      <div className="lf-card">
        <h2 className="lf-h2" style={{ marginBottom: 8 }}>
          {t('matches')}
        </h2>
        {matches.length === 0 ? (
          <div className="lf-empty">{t('noMatch')}</div>
        ) : (
          <div className="lf-stack">
            {matches.map((m) => (
              <button
                key={m.matchId}
                className={`lf-matchcard ${m.kind === 'strong' ? 'strong' : ''}`}
                onClick={async () => {
                  setActiveMatch(m)
                  const q = await getQuestions(m.otherPost.id)
                  setQuestions(q.questions)
                  setAnswers(q.questions.map(() => ''))
                  setLayer('claim')
                  pushScreen('claim')
                }}
              >
                <div className="lf-row">
                  <span className={`lf-badge ${m.kind === 'strong' ? 'lf-b-matched' : 'lf-b-gold'}`}>
                    {m.kind === 'strong' ? t('strongMatch') : t('possibleMatch')}
                  </span>
                </div>
                <b>
                  {catOf(m.otherPost.category).label} · {m.otherPost.area}
                </b>
                <div className="lf-reasons">
                  {m.reasons.map((r) => (
                    <span className="lf-badge lf-b-muted" key={r.code + r.text}>
                      {r.text}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="lf-card">
        <h2 className="lf-h2" style={{ marginBottom: 8 }}>
          {t('privacyNotice')}
        </h2>
        <div className="lf-stack" style={{ fontSize: '0.9em' }}>
          <div className="lf-row" style={{ alignItems: 'flex-start' }}>
            <Icon name="check" />
            <span>{t('privacy')}</span>
          </div>
          <div className="lf-row" style={{ alignItems: 'flex-start' }}>
            <Icon name="check" />
            <span>{t('handToPolice')}</span>
          </div>
          <div className="lf-row" style={{ alignItems: 'flex-start' }}>
            <Icon name="check" />
            <span>{t('notLegal')}</span>
          </div>
        </div>
        <button className="lf-btn line block" style={{ marginTop: 12 }} onClick={() => openLayer('privacy')}>
          Privacy notice
        </button>
        {token ? (
          <button
            className="lf-btn danger block"
            style={{ marginTop: 10 }}
            onClick={async () => {
              await deleteMe()
              clearDemoToken()
              setToken(null)
              setMine([])
              setMatches([])
              ping('All your data was deleted')
            }}
          >
            {t('deleteData')}
          </button>
        ) : null}
        {token ? (
          <button
            className="lf-btn ghost block"
            onClick={() => {
              clearDemoToken()
              setToken(null)
            }}
          >
            {t('signOut')}
          </button>
        ) : null}
      </div>
      <div className="lf-seg" role="group" aria-label="Language">
        {([['en', 'English'], ['ta', 'தமிழ்'], ['hi', 'हिन्दी']] as const).map(([id, label]) => (
          <button key={id} aria-pressed={lang === id} onClick={() => setLang(id)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )

  const guide = (
    <div className="lf-view">
      <h1 className="lf-h1">{t('guide')}</h1>
      {GUIDES.map((g) => (
        <article className="lf-card" key={g.id}>
          <h2 className="lf-h2">{g.title}</h2>
          <ol className="lf-sub" style={{ paddingLeft: '1.2em', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {g.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <div className="lf-stack" style={{ marginTop: 10 }}>
            {g.links.map((l) => (
              <a key={l.href} className="lf-btn line" href={l.href} target="_blank" rel="noopener noreferrer">
                {l.label}
                {'unverified' in l && l.unverified ? ' (check)' : ''}
              </a>
            ))}
          </div>
          <p className="lf-hint" style={{ marginTop: 8 }}>
            {t('guideFoot')} · verifiedOn {g.verifiedOn}
          </p>
        </article>
      ))}
    </div>
  )

  const popLayer = () => window.history.back()

  let overlay = null
  if (sheet?.kind === 'wiz' && wiz) {
    const c = wiz.cat ? catOf(wiz.cat) : null
    overlay = (
      <WizSheet
        t={t}
        wiz={wiz}
        setWiz={setWiz}
        onClose={() => {
          const n = wiz.step
          ignorePops.current = 1
          applyingPop.current = true
          depthRef.current = Math.max(0, depthRef.current - n)
          window.history.go(-n)
        }}
        onBack={() => window.history.back()}
        onNext={() => {
          if (!wizGate(wiz)) return
          if (wiz.step === 4) void submitWiz()
          else {
            const step = wiz.step + 1
            setWiz({ ...wiz, step })
            pushScreen(`post-${wiz.kind}-${step}`)
          }
        }}
        gate={wizGate(wiz)}
        cat={c}
      />
    )
  } else if (sheet?.kind === 'pub') {
    const p = sheet.post
    overlay = (
      <>
        <div className="lf-scrim" onClick={popLayer} />
        <section className="lf-sheet" role="dialog" aria-modal="true" aria-label={p.title}>
          <div className="lf-grab" />
          <div className="lf-sheet-head">
            <h2 className="lf-h2 lf-grow">Found: {catOf(p.category).label}</h2>
            <button className="lf-iconbtn" aria-label={t('close')} onClick={popLayer}>
              <Icon name="x" />
            </button>
          </div>
          <div className="lf-sheet-body">
            <div className="lf-card flat">
              <div className="lf-row">
                <span className={`lf-ico ${TONE_CLASS[catOf(p.category).tone]}`}>
                  <Icon name={catOf(p.category).ico} />
                </span>
                <div className="lf-grow">
                  <b>{catOf(p.category).idCat ? 'Details hidden for safety' : p.publicDescription}</b>
                  <div className="lf-sub">
                    {p.area} · {agoFromIso(p.foundAt)}
                  </div>
                </div>
              </div>
            </div>
            <div className="lf-callout priv" style={{ marginTop: 12 }}>
              <Icon name="lock" />
              <span>{t('hiddenId')}</span>
            </div>
            <p className="lf-hint" style={{ marginTop: 12 }}>
              {t('safety')}
            </p>
            <button
              className="lf-btn quiet block"
              style={{ marginTop: 8 }}
              onClick={() => {
                setReportPostId(p.id)
                openLayer('report')
              }}
            >
              {t('report')}
            </button>
          </div>
          <div className="lf-sheet-foot">
            <button className="lf-btn primary grow" onClick={() => void openClaimForPost(p)}>
              {t('thisMightBeMine')}
            </button>
          </div>
        </section>
      </>
    )
  } else if (sheet?.kind === 'thanks') {
    const caption = thanksCaption(null, todayIso())
    const upiUrl = upi ? buildUpiLink({ vpa: upi, amount: amt, name: t('demoFinder') }) : null
    overlay = (
      <>
        <div className="lf-scrim" onClick={popLayer} />
        <section className="lf-sheet full" role="dialog" aria-modal="true" aria-label={t('thanksTitle')}>
          <div className="lf-grab" />
          <div className="lf-sheet-head">
            <h2 className="lf-h2 lf-grow">{t('thanksTitle')}</h2>
            <button className="lf-iconbtn" aria-label={t('close')} onClick={popLayer}>
              <Icon name="x" />
            </button>
          </div>
          <div className="lf-sheet-body">
            <ThankYouCard
              t={t}
              upiUrl={upiUrl}
              amount={amt}
              onAmount={setAmt}
              demoFinder={thanksDemo}
              onShare={() => {
                setShareCaption(caption)
                openLayer('share')
              }}
            />
          </div>
        </section>
      </>
    )
  }

  const claimSheet =
    layer === 'claim' && activeMatch ? (
      <>
        <div className="lf-scrim" onClick={popLayer} />
        <section className="lf-sheet full" role="dialog" aria-modal="true" aria-label={t('thisMightBeMine')}>
          <div className="lf-grab" />
          <div className="lf-sheet-head">
            <h2 className="lf-h2 lf-grow">{catOf(activeMatch.otherPost.category).label}</h2>
            <button className="lf-iconbtn" aria-label={t('close')} onClick={popLayer}>
              <Icon name="x" />
            </button>
          </div>
          <div className="lf-sheet-body lf-stack" style={{ gap: 14 }}>
            <div className={`lf-matchcard ${activeMatch.kind === 'strong' ? 'strong' : ''}`}>
              <span className={`lf-badge ${activeMatch.kind === 'strong' ? 'lf-b-matched' : 'lf-b-gold'}`}>
                {activeMatch.kind === 'strong' ? t('strongMatch') : t('possibleMatch')}
              </span>
              <div className="lf-reasons">
                {activeMatch.reasons.map((r) => (
                  <span className="lf-badge lf-b-muted" key={r.code + r.text}>
                    {r.text}
                  </span>
                ))}
              </div>
            </div>
            {!claim ? (
              <>
                {questions.map((q, i) => (
                  <div className="lf-field" key={q}>
                    <label htmlFor={`ans${i}`}>{q}</label>
                    <input
                      id={`ans${i}`}
                      className="lf-input"
                      value={answers[i] || ''}
                      onChange={(e) => {
                        const next = answers.slice()
                        next[i] = e.target.value
                        setAnswers(next)
                      }}
                    />
                  </div>
                ))}
                <p className="lf-hint">For the passport demo: “maroon plastic cover” and “Chennai”.</p>
                <button className="lf-btn primary block" disabled={answers.some((a) => a.trim().length < 2)} onClick={() => void sendClaim()}>
                  {t('claimSend')}
                </button>
              </>
            ) : claim.state === 'pending' ? (
              <div className="lf-center">
                <div className="lf-spin" />
                <b>{t('waitingFinder')}</b>
                <span className="lf-sub">{t('demoFinderWait')}</span>
              </div>
            ) : claim.state === 'approved' ? (
              <>
                <div className="lf-callout ok">
                  <Icon name="check" />
                  <span>{t('approved')}</span>
                </div>
                <button type="button" className="lf-callout warn" onClick={() => openLayer('safety')} style={{ width: '100%', textAlign: 'left' }}>
                  <Icon name="info" />
                  <span>{t('safety')}</span>
                </button>
                <div className="lf-field">
                  <label htmlFor="lf-phone">{t('phone')} (demo)</label>
                  <input id="lf-phone" className="lf-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 00000 11111" />
                </div>
                <button className="lf-toggle" onClick={() => setSharePhone(!sharePhone)}>
                  <span className="lf-grow">{t('phone')}</span>
                  <span className={`lf-sw ${sharePhone ? 'on' : ''}`} />
                </button>
                <button className="lf-btn primary block" onClick={() => void doShare()}>
                  {t('shareHow')}
                </button>
                <button className="lf-btn green block" onClick={() => void doReturned()}>
                  {t('returned')}
                </button>
                {claim.counterpart?.channels?.phone ? (
                  <p className="lf-hint">Demo finder: {claim.counterpart.channels.phone}</p>
                ) : null}
              </>
            ) : (
              <div className="lf-empty">Declined. Try answers that mention maroon / Chennai.</div>
            )}
          </div>
        </section>
      </>
    ) : null

  return (
    <div className={langFromApp ? 'lf-root lf-embedded' : 'lf-root'}>
      <div className="lf-phone">
        <header className="lf-appbar">
          <div className="lf-brand">
            <span className="lf-mark">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" strokeWidth="2.2">
                <path d="M16.500 7.500C15 5.500 9 5.500 8.500 9c-.5 3.500 7 2.500 7 6.500 0 3.500-6 3.500-8 1" />
              </svg>
            </span>
            Sarvam
          </div>
          <span className="lf-badge lf-b-violet">{t('demoChip')}</span>
        </header>
        <main className="lf-body">
          {tab === 'home' ? home : tab === 'me' ? me : guide}
        </main>
        <nav className="lf-tabbar" role="tablist" aria-label="Lost and Found">
          <button className="lf-tab" role="tab" aria-selected={tab === 'home'} onClick={() => setTab('home')}>
            <Icon name="search" />
            {t('title')}
          </button>
          <button className="lf-tab" role="tab" aria-selected={tab === 'guide'} onClick={() => setTab('guide')}>
            <Icon name="file" />
            Guide
          </button>
          <button className="lf-tab" role="tab" aria-selected={tab === 'me'} onClick={() => setTab('me')}>
            <Icon name="user" />
            {t('profile')}
            {unread > 0 ? <span className="lf-badge lf-b-coral">{unread}</span> : null}
          </button>
        </nav>
        {overlay}
        {claimSheet}
        {layer === 'privacy' ? (
          <Sheet isOpen onClose={popLayer} title={t('privacyNotice')} ariaLabel={t('privacyNotice')}>
            <div className="lf-sheet-head">
              <h2 className="lf-h2 lf-grow">{t('privacyNotice')}</h2>
              <button className="lf-iconbtn" aria-label={t('close')} onClick={popLayer}>
                <Icon name="x" />
              </button>
            </div>
            <div className="lf-sheet-body lf-stack">
              <p>{t('privacyLong')}</p>
              <p>{t('ageLine')}</p>
              <p>Grievance: privacy@example.com (placeholder).</p>
              <p>{t('notLegal')}</p>
            </div>
          </Sheet>
        ) : null}
        {layer === 'report' ? (
          <Sheet isOpen onClose={popLayer} title={t('report')} ariaLabel={t('report')}>
            <div className="lf-sheet-head">
              <h2 className="lf-h2 lf-grow">{t('report')}</h2>
              <button className="lf-iconbtn" aria-label={t('close')} onClick={popLayer}>
                <Icon name="x" />
              </button>
            </div>
            <div className="lf-sheet-body lf-stack">
              <p className="lf-sub">{t('notLegal')}</p>
              <button
                className="lf-btn primary block"
                onClick={async () => {
                  if (reportPostId) await reportPost(reportPostId, 'spam')
                  ping(t('report'))
                  popLayer()
                }}
              >
                {t('report')}
              </button>
            </div>
          </Sheet>
        ) : null}
        {layer === 'share' ? (
          <Sheet isOpen onClose={popLayer} title={t('shareThanks')} ariaLabel={t('shareThanks')}>
            <div className="lf-sheet-head">
              <h2 className="lf-h2 lf-grow">{t('shareThanks')}</h2>
              <button className="lf-iconbtn" aria-label={t('close')} onClick={popLayer}>
                <Icon name="x" />
              </button>
            </div>
            <div className="lf-sheet-body lf-stack">
              <p>{shareCaption}</p>
              <button
                className="lf-btn primary block"
                onClick={async () => {
                  const r = await shareOrDownload(shareCaption)
                  ping(r === 'failed' ? t('copyFailed') : t('copied'))
                  popLayer()
                }}
              >
                {t('shareThanks')}
              </button>
            </div>
          </Sheet>
        ) : null}
        {layer === 'safety' ? (
          <Sheet isOpen onClose={popLayer} title={t('safetyTitle')} ariaLabel={t('safetyTitle')}>
            <div className="lf-sheet-head">
              <h2 className="lf-h2 lf-grow">{t('safetyTitle')}</h2>
              <button className="lf-iconbtn" aria-label={t('close')} onClick={popLayer}>
                <Icon name="x" />
              </button>
            </div>
            <div className="lf-sheet-body">
              <SafetyTips text={t('safety')} />
            </div>
          </Sheet>
        ) : null}
        {toast ? (
          <div className="lf-toast" role="status">
            {toast}
          </div>
        ) : null}
        <div className="lf-live" aria-live="polite">
          {live}
          {apiUp ? '' : ''}
        </div>
      </div>
    </div>
  )
}

function WizSheet({
  t,
  wiz,
  setWiz,
  onClose,
  onBack,
  onNext,
  gate,
  cat,
}: {
  t: (k: LfKey) => string
  wiz: Wiz
  setWiz: (w: Wiz) => void
  onClose: () => void
  onBack: () => void
  onNext: () => void
  gate: boolean
  cat: ReturnType<typeof catOf> | null
}) {
  const lost = wiz.kind === 'lost'
  const test = wiz.cat ? TEST_IDS[wiz.cat as CategoryId] : undefined
  let body
  if (wiz.step === 1) {
    body = (
      <>
        <h3 className="lf-h2" style={{ marginBottom: 10 }}>
          {lost ? t('whatLost') : t('whatFound')}
        </h3>
        <div className="lf-cats">
          {CATEGORIES.map((k) => (
            <button
              key={k.id}
              className="lf-cat"
              aria-pressed={wiz.cat === k.id}
              onClick={() => {
                const qs = DEMO_QUESTIONS[k.id]
                setWiz({ ...wiz, cat: k.id, q1: qs ? qs[0] : '', q2: qs ? qs[1] : '' })
              }}
            >
              <span className={`lf-ico ${TONE_CLASS[k.tone]}`}>
                <Icon name={k.ico} />
              </span>
              <b>{k.label}</b>
              <small>{k.note}</small>
            </button>
          ))}
        </div>
      </>
    )
  } else if (wiz.step === 2 && cat) {
    body = (
      <div className="lf-stack" style={{ gap: 14 }}>
        <div className="lf-field">
          <label htmlFor="w-desc">{t('describe')}</label>
          <textarea id="w-desc" className="lf-textarea" value={wiz.desc} onChange={(e) => setWiz({ ...wiz, desc: e.target.value })} />
        </div>
        {cat.idCat && !cat.noNumber ? (
          <div className="lf-field">
            <label htmlFor="w-id">{t('idOptional')}</label>
            <input id="w-id" className="lf-input" value={wiz.idnum} onChange={(e) => setWiz({ ...wiz, idnum: e.target.value })} />
            {test ? (
              <button className="lf-chip" onClick={() => setWiz({ ...wiz, idnum: lost ? test.lost : test.found })}>
                {t('useTest')} {lost ? test.lost : test.found}
              </button>
            ) : null}
            <div className="lf-callout priv">
              <Icon name="lock" />
              <span>{t('idHint')}</span>
            </div>
          </div>
        ) : cat.noNumber ? (
          <div className="lf-callout priv">
            <Icon name="lock" />
            <span>{t('aadhaarNever')}</span>
          </div>
        ) : null}
        {!lost ? (
          <div className="lf-field">
            <label>{t('questions')}</label>
            <input className="lf-input" value={wiz.q1} onChange={(e) => setWiz({ ...wiz, q1: e.target.value })} aria-label="Question 1" />
            <input className="lf-input" value={wiz.q2} onChange={(e) => setWiz({ ...wiz, q2: e.target.value })} aria-label="Question 2" />
            <span className="lf-hint">{t('questionsHint')}</span>
          </div>
        ) : null}
      </div>
    )
  } else if (wiz.step === 3) {
    body = (
      <div className="lf-stack" style={{ gap: 16 }}>
        <div className="lf-field">
          <label>{lost ? t('whereLost') : t('whereFound')}</label>
          <div className="lf-choice">
            {CITIES.map((c) => (
              <button key={c.key} className={`lf-chip ${wiz.city === c.key ? 'on' : ''}`} onClick={() => setWiz({ ...wiz, city: c.key })}>
                {c.name}
              </button>
            ))}
          </div>
          {wiz.city === 'chennai' ? (
            <div className="lf-choice" style={{ marginTop: 8 }}>
              {CHENNAI_AREAS.map((a) => (
                <button key={a} className={`lf-chip ${wiz.area === a ? 'on' : ''}`} onClick={() => setWiz({ ...wiz, area: a })}>
                  {a}
                </button>
              ))}
            </div>
          ) : null}
          <button className={`lf-chip ${wiz.radiusKm === null ? 'on' : ''}`} onClick={() => setWiz({ ...wiz, radiusKm: null })}>
            {t('cityWide')}
          </button>
        </div>
        <div className="lf-field">
          <label>{t('when')}</label>
          <div className="lf-choice">
            {[[0, t('today')], [1, t('yesterday')], [2, '2 days ago'], [3, '3 days ago']].map(([d, l]) => (
              <button key={String(d)} className={`lf-chip ${wiz.days === d ? 'on' : ''}`} onClick={() => setWiz({ ...wiz, days: d as number })}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {!lost ? (
          <div className="lf-field">
            <label>{t('heldAt')}</label>
            <div className="lf-choice">
              {[
                ['with_me', t('withMe')],
                ['shop_or_office', t('shop')],
                ['police_station', t('police')],
              ].map(([k, l]) => (
                <button key={k} className={`lf-chip ${wiz.heldAt === k ? 'on' : ''}`} onClick={() => setWiz({ ...wiz, heldAt: k })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    )
  } else {
    body = (
      <div className="lf-stack" style={{ gap: 14 }}>
        <div className="lf-card flat">
          <b>
            {lost ? 'Lost' : 'Found'}: {cat?.label}
          </b>
          <div className="lf-sub">
            {wiz.area} · {wiz.city}
          </div>
          <p style={{ marginTop: 10 }}>{wiz.desc}</p>
        </div>
        <button className="lf-toggle" onClick={() => setWiz({ ...wiz, consent: !wiz.consent })}>
          <span className="lf-grow" style={{ fontSize: '0.88em' }}>
            {t('consent')}
          </span>
          <span className={`lf-sw ${wiz.consent ? 'on' : ''}`} />
        </button>
        {lost ? (
          <div className="lf-callout warn">
            <Icon name="info" />
            <span>{t('noMoney')}</span>
          </div>
        ) : null}
      </div>
    )
  }
  return (
    <>
      <div className="lf-scrim" onClick={onClose} />
      <section className="lf-sheet full" role="dialog" aria-modal="true" aria-label={lost ? t('lost') : t('found')}>
        <div className="lf-grab" />
        <div className="lf-sheet-head">
          <h2 className="lf-h2 lf-grow">{lost ? t('lost') : t('found')}</h2>
          <button className="lf-iconbtn" aria-label={t('close')} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="lf-steps" aria-hidden="true">
          {[1, 2, 3, 4].map((i) => (
            <i key={i} className={i <= wiz.step ? 'on' : ''} />
          ))}
        </div>
        <div className="lf-sheet-body">{body}</div>
        <div className="lf-sheet-foot">
          {wiz.step > 1 ? (
            <button className="lf-btn line" onClick={onBack}>
              {t('back')}
            </button>
          ) : null}
          <button className="lf-btn primary grow" disabled={!gate} onClick={onNext}>
            {wiz.step === 4 ? (lost ? t('postLost') : t('postFound')) : t('continue')}
          </button>
        </div>
      </section>
    </>
  )
}
