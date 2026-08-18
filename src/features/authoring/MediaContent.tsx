import { useAssetUrl } from './useAssetUrl';
import type { Block } from '../../domain/types';

// Renders the media of a block, cover-fit with its focal point. Thumbs
// everywhere except the working canvas. Video shows a muted looping
// preview on the canvas and its poster elsewhere.
export function MediaContent({
  block,
  variant,
}: {
  block: Block;
  variant: 'canvas' | 'thumb';
}) {
  const { url, asset } = useAssetUrl(block.assetId, variant === 'canvas' ? 'full' : 'thumb');
  const poster = useAssetUrl(block.assetId, 'poster');
  if (!url || !asset) return null;
  const focal = block.focal ?? { x: 0.5, y: 0.5 };
  const objectPosition = `${focal.x * 100}% ${focal.y * 100}%`;

  if (asset.kind === 'video' && variant === 'canvas') {
    return (
      <video
        src={url}
        poster={poster.url}
        muted
        loop
        autoPlay
        playsInline
        className="h-full w-full object-cover"
        style={{ objectPosition }}
      />
    );
  }
  const src = asset.kind === 'video' ? (poster.url ?? url) : url;
  return (
    <img src={src} alt="" draggable={false} className="h-full w-full object-cover" style={{ objectPosition }} />
  );
}
