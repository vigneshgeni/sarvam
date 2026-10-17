export function isPhotoFile(file?: { type?: string; name?: string } | null): boolean
export function isPhotoUpload(files?: Array<{ type?: string; name?: string }> | null): boolean
export function readingCountCopy(
  files: Array<{ type?: string; name?: string }> | null | undefined,
  t?: Record<string, string>,
): {
  photos: boolean
  heading: string
  subtitle: string
  subtitleKey: string
  progressKey: string
}
