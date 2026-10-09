import { MODEL_INPUT_SIZE } from '@/config/labels'

/**
 * Crops the centre square of an image or video frame and shrinks it to the model's input size, as a
 * JPEG. These are the first steps of the model's own preprocessing, so the photo the user sees,
 * the photo the model reads and the photo that is stored are all the same 224 x 224 picture.
 */
export function squareJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
  size = MODEL_INPUT_SIZE,
): Promise<Blob> {
  const side = Math.min(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, (width - side) / 2, (height - side) / 2, side, side, 0, 0, size, size)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('The browser could not encode the photo'))),
      'image/jpeg',
      0.92,
    ),
  )
}

/** An uploaded or camera photo, made into the model-sized square. Rejects if it cannot be read. */
export async function toModelInput(file: File): Promise<File> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file) // applies the EXIF rotation
  } catch {
    throw new Error('This photo could not be read. Use a JPEG or PNG photo.')
  }
  try {
    const blob = await squareJpeg(bitmap, bitmap.width, bitmap.height)
    return new File([blob], 'photo.jpg', { type: 'image/jpeg' })
  } finally {
    bitmap.close()
  }
}
