export function buildUpiLink(opts: {
  vpa: string
  name?: string
  amount: number
  note?: string
}): string {
  const params = new URLSearchParams({
    pa: opts.vpa,
    pn: opts.name || 'Demo finder',
    am: String(opts.amount),
    cu: 'INR',
    tn: opts.note || 'Thanks from Sarvam',
  })
  return `upi://pay?${params.toString()}`
}

/** Clipboard write inside a click handler; falls back if the Clipboard API is refused. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  try {
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.top = '0'
    el.style.left = '-9999px'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}

export function encodeThanksTweet(text: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
}

export function facebookShare(url: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`
}
