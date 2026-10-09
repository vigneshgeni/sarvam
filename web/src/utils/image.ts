/**
 * Checks if a file is an unsupported Apple HEIC/HEIF image.
 */
export function isHeicFile(file: File): boolean {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return (
    name.endsWith('.heic') ||
    name.endsWith('.heif') ||
    type === 'image/heic' ||
    type === 'image/heif' ||
    type === 'image/heic-sequence' ||
    type === 'image/heif-sequence'
  )
}

/**
 * Image processing pipeline per Section 4 & Item 9:
 * - Rejects HEIC/HEIF
 * - Applies EXIF orientation via createImageBitmap(imageOrientation: 'from-image')
 * - Downscales to max 2000px long edge
 * - Encodes to JPEG q0.85
 * - Console logs execution timing (no document content)
 */
export async function shrinkImage(file: File): Promise<File> {
  // Reject HEIC/HEIF
  if (isHeicFile(file)) {
    throw new Error('HEIC_NOT_SUPPORTED')
  }

  // If not an image, return original file untouched
  if (!file.type.startsWith('image/') && !file.name.match(/\.(png|jpe?g|webp|bmp|gif)$/i)) {
    return file
  }

  const startTime = performance.now()
  const maxDim = 2000

  // 1. Try modern createImageBitmap with EXIF orientation handling
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      let { width, height } = bitmap

      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width)
          width = maxDim
        } else {
          width = Math.round((width * maxDim) / height)
          height = maxDim
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')

      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, width, height)
        bitmap.close()

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', 0.85)
        )

        if (blob) {
          const duration = Math.round(performance.now() - startTime)
          console.log(`[PhotoPipeline] ${file.name} processed to ${width}x${height} in ${duration}ms`)
          const baseName = file.name.replace(/\.[^.]+$/, '')
          return new File([blob], `${baseName}.jpg`, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          })
        }
      } else {
        bitmap.close()
      }
    } catch {
      // Fallback to Image element if createImageBitmap with options fails
    }
  }

  // 2. Fallback using Image element
  return new Promise((resolve) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let { width, height } = img

      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width)
          width = maxDim
        } else {
          width = Math.round((width * maxDim) / height)
          height = maxDim
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        resolve(file)
        return
      }

      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file)
            return
          }
          const duration = Math.round(performance.now() - startTime)
          console.log(`[PhotoPipeline] ${file.name} processed to ${width}x${height} in ${duration}ms (fallback)`)
          const baseName = file.name.replace(/\.[^.]+$/, '')
          const shrunkFile = new File([blob], `${baseName}.jpg`, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          })
          resolve(shrunkFile)
        },
        'image/jpeg',
        0.85
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(file)
    }

    img.src = objectUrl
  })
}

/**
 * Sequentially processes an array of photo files with progress tracking.
 */
export async function processPhotosSequentially(
  files: File[],
  onProgress?: (current: number, total: number) => void
): Promise<File[]> {
  const results: File[] = []
  for (let i = 0; i < files.length; i++) {
    onProgress?.(i + 1, files.length)
    const processed = await shrinkImage(files[i])
    results.push(processed)
  }
  return results
}

/**
 * Shrinks an array of files concurrently (for backwards compatibility).
 */
export async function shrinkFiles(files: File[]): Promise<File[]> {
  return Promise.all(files.map(shrinkImage))
}
