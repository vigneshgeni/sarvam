export function isPhotoFile(file) {
  const type = String(file?.type || '')
  const name = String(file?.name || '')
  return type.startsWith('image/') || /\.(jpe?g|png|heic|webp)$/i.test(name)
}

/** True only when every file in the set is a photo. A PDF set is documents. */
export function isPhotoUpload(files) {
  return Array.isArray(files) && files.length > 0 && files.every(isPhotoFile)
}

export function readingCountCopy(files, t = {}) {
  const photos = isPhotoUpload(files)
  const count = Array.isArray(files) ? files.length : 0
  const n = String(count)
  const fill = (template, fallback) => String(template || fallback).replaceAll('{count}', n)
  const heading =
    count > 1
      ? fill(
          photos ? t.readingPhotosHeading : t.readingDocumentsHeading,
          photos ? `${n} photos` : `${n} documents`,
        )
      : files?.[0]?.name || t.readingTitle || 'Reading your document'
  const subtitleKey = photos
    ? count > 1
      ? 'readingPhotosPlural'
      : 'readingPhotos'
    : count > 1
      ? 'readingSubtitlePlural'
      : 'readingSubtitle'
  const subtitleFallback = photos
    ? count > 1
      ? `${n} photos · Processing securely`
      : `${n} photo · Processing securely`
    : count > 1
      ? `${n} documents · Processing securely`
      : `${n} document · Processing securely`
  return {
    photos,
    heading,
    subtitle: fill(t[subtitleKey], subtitleFallback),
    subtitleKey,
    progressKey: photos ? 'readingPhotosProgress' : 'reportsProgress',
  }
}
