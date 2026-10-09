export function thanksCaption(finderFirstName: string | null, dateLabel: string): string {
  const who = finderFirstName ? finderFirstName : 'a kind finder'
  return `Returned with trust. Thank you, ${who}. ${dateLabel} · Sarvam Lost & Found`
}

export async function shareOrDownload(text: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share({ text, title: 'Thank you' })
      return 'shared'
    }
  } catch {
    /* fall through */
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}
