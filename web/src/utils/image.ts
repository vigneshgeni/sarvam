/**
 * Shrinks images to max 1600 px on the long side, JPEG quality ~0.85.
 * Non-image files (e.g. PDFs) are returned untouched.
 */
export async function shrinkImage(file: File): Promise<File> {
  // If not an image, return original file
  if (!file.type.startsWith('image/')) {
    return file
  }

  return new Promise((resolve) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let { width, height } = img
      const maxDim = 1600

      // Only shrink if larger than maxDim on the long side
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
      // Fallback to original file on error
      resolve(file)
    }

    img.src = objectUrl
  })
}

/**
 * Shrinks an array of files concurrently.
 */
export async function shrinkFiles(files: File[]): Promise<File[]> {
  return Promise.all(files.map(shrinkImage))
}
