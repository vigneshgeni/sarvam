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

export function encodeThanksTweet(text: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
}

export function facebookShare(url: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`
}
