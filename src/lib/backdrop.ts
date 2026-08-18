import { db } from '../db/db';
import type { Board, Page } from '../domain/types';

// The letterbox bands are never plain black. Each page gets a dominant
// color and a heavily blurred, darkened copy of its primary image as an
// ambient fill behind the page. Computed once and cached on the page
// record as a small data URI.

export async function computeBackdrop(
  page: Page,
): Promise<{ color: string; blurDataUri: string } | null> {
  const media = page.blocks.find(
    (b) => (b.kind === 'image' || b.kind === 'video') && b.assetId,
  );
  if (!media?.assetId) return null;
  const asset = await db.assets.get(media.assetId);
  if (!asset) return null;
  const blob = asset.thumbBlob ?? asset.posterBlob ?? (asset.kind === 'image' ? asset.blob : null);
  if (!blob) return null;

  const bitmap = await createImageBitmap(blob);
  try {
    const w = 32;
    const h = Math.max(1, Math.round((bitmap.height / bitmap.width) * w));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.filter = 'blur(3px) brightness(0.45)';
    ctx.drawImage(bitmap, 0, 0, w, h);

    const data = ctx.getImageData(0, 0, w, h).data;
    let r = 0;
    let g = 0;
    let bl = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      bl += data[i + 2];
    }
    const color = `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(bl / n)})`;

    const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.5 });
    const blurDataUri = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(out);
    });
    return { color, blurDataUri };
  } finally {
    bitmap.close();
  }
}

// Fills in missing backdrops for the given pages, returning an updated
// board when anything changed. Called on playback entry; persisting is
// the caller's job so it can go through the normal mutate path.
export async function ensureBackdrops(board: Board, pageIds: string[]): Promise<Board | null> {
  let changed = false;
  const pages = [...board.pages];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (!pageIds.includes(page.id) || page.backdrop) continue;
    const backdrop = await computeBackdrop(page);
    if (backdrop) {
      pages[i] = { ...page, backdrop };
      changed = true;
    }
  }
  return changed ? { ...board, pages } : null;
}
