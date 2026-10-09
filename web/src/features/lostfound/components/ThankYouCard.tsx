import { useState } from 'react'
import { Icon } from './Icon'
import type { LfKey } from '../i18n/useLfT'
import { copyText } from '../utils/upi'

export function ThankYouCard({
  t,
  upiUrl,
  amount,
  onAmount,
  demoFinder,
  onShare,
}: {
  t: (k: LfKey) => string
  upiUrl: string | null
  amount: number
  onAmount: (n: number) => void
  demoFinder: boolean
  onShare: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [copyErr, setCopyErr] = useState(false)

  const onCopy = async () => {
    if (!upiUrl) return
    const ok = await copyText(upiUrl)
    setCopied(ok)
    setCopyErr(!ok)
    if (ok) window.setTimeout(() => setCopied(false), 2200)
  }

  return (
    <div className="lf-thanks">
      <span className="lf-seal">
        <Icon name="check" />
      </span>
      <h3 className="lf-h1" style={{ fontSize: '1.4em' }}>
        {t('thanksTitle')}
      </h3>
      {demoFinder ? <span className="lf-badge lf-b-violet">{t('demoFinder')}</span> : null}
      <p className="lf-sub">{t('thanksSub')}</p>
      <div className="lf-choice" style={{ justifyContent: 'center' }}>
        {[100, 200, 500].map((a) => (
          <button key={a} className={`lf-chip ${amount === a ? 'on' : ''}`} onClick={() => onAmount(a)}>
            ₹{a}
          </button>
        ))}
      </div>
      {upiUrl ? (
        <>
          <a className="lf-btn primary block" href={upiUrl}>
            {t('openUpi')}
          </a>
          <button className="lf-btn quiet block" type="button" onClick={() => void onCopy()}>
            {copied ? t('copied') : t('copyLink')}
          </button>
          {copyErr ? <p className="lf-hint">{t('copyFailed')}</p> : null}
          <p className="lf-hint">{t('upiHint')}</p>
        </>
      ) : null}
      <button className="lf-btn line block" type="button" onClick={onShare}>
        {t('shareThanks')}
      </button>
    </div>
  )
}
