import { MAX_IMAGE_EDGE, THUMB_EDGE } from './constants';

async function decode(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

function scaled(bitmap: ImageBitmap, maxEdge: number): { w: number; h: number } {
  const edge = Math.max(bitmap.width, bitmap.height);
  const f = edge > maxEdge ? maxEdge / edge : 1;
  return { w: Math.round(bitmap.width * f), h: Math.round(bitmap.height * f) };
}

async function rasterize(bitmap: ImageBitmap, w: number, h: number, quality: number): Promise<Blob> {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.convertToBlob({ type: 'image/webp', quality });
}

export type ProcessedImage = {
  blob: Blob;
  thumbBlob: Blob;
  width: number;
  height: number;
  downscaled: boolean;
};

// Downscales above MAX_IMAGE_EDGE and produces the 320px thumbnail. The
// caller decides whether to archive the original, per settings.
export async function processImage(original: Blob): Promise<ProcessedImage> {
  const bitmap = await decode(original);
  try {
    const full = scaled(bitmap, MAX_IMAGE_EDGE);
    const downscaled = full.w !== bitmap.width || full.h !== bitmap.height;
    const blob = downscaled ? await rasterize(bitmap, full.w, full.h, 0.92) : original;
    const t = scaled(bitmap, THUMB_EDGE);
    const thumbBlob = await rasterize(bitmap, t.w, t.h, 0.8);
    return { blob, thumbBlob, width: full.w, height: full.h, downscaled };
  } finally {
    bitmap.close();
  }
}
