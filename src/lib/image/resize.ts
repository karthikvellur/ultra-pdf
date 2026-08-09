/** Client-side helpers for inspecting and resizing raster images (JPG/PNG). */

export interface ImageDimensions {
  width: number;
  height: number;
}

/** Decode an image file and read its natural pixel dimensions. */
export function readImageDimensions(file: File): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read "${file.name}" — it may not be a valid image.`));
    };
    img.src = url;
  });
}

/** Resize an image to an exact target width/height, returning encoded bytes. */
export function resizeImage(
  file: File,
  target: ImageDimensions,
  mimeType = 'image/jpeg',
  quality = 0.92,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = target.width;
      canvas.height = target.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context is unavailable in this browser.'));
        return;
      }
      ctx.drawImage(img, 0, 0, target.width, target.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to encode the resized image.'));
            return;
          }
          blob
            .arrayBuffer()
            .then((buf) => resolve(new Uint8Array(buf)))
            .catch(reject);
        },
        mimeType,
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read "${file.name}" — it may not be a valid image.`));
    };
    img.src = url;
  });
}

/** Scale height to preserve aspect ratio given a new width (or vice versa). */
export function scaledDimension(
  original: ImageDimensions,
  changed: 'width' | 'height',
  newValue: number,
): ImageDimensions {
  const ratio = original.width / original.height;
  if (changed === 'width') {
    return { width: newValue, height: Math.round(newValue / ratio) };
  }
  return { width: Math.round(newValue * ratio), height: newValue };
}
