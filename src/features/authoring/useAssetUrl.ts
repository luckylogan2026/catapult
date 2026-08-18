import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { assetObjectUrl } from '../../assetPipeline/importAssets';
import type { Asset } from '../../domain/types';

export function useAsset(assetId?: string): Asset | undefined {
  return useLiveQuery(() => (assetId ? db.assets.get(assetId) : undefined), [assetId]);
}

// Returns a stable object URL for an asset variant. Thumbs for rails and
// grids, full only on the working canvas, per the performance guardrails.
export function useAssetUrl(
  assetId: string | undefined,
  variant: 'full' | 'thumb' | 'poster',
): { url?: string; asset?: Asset } {
  const asset = useAsset(assetId);
  if (!asset) return {};
  const blob =
    variant === 'thumb'
      ? (asset.thumbBlob ?? asset.blob)
      : variant === 'poster'
        ? (asset.posterBlob ?? asset.thumbBlob ?? asset.blob)
        : asset.kind === 'video'
          ? asset.blob
          : asset.blob;
  return { url: assetObjectUrl(asset.id, blob, variant), asset };
}
