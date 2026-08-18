import { useAssetUrl } from './useAssetUrl';
import type { Block } from '../../domain/types';

// Renders the media of a block, cover-fit with its focal point unless
// the block asks to fit whole. Thumbs everywhere except the working
// canvas and playback. Video previews muted and looping.

const KB_NAMES = ['kb-a', 'kb-b', 'kb-c', 'kb-d'];

function kbStyle(block: Block): React.CSSProperties {
  // Stable per block, so a page does not change motion mid-session, but
  // varied across blocks so repeated viewing does not feel mechanical.
  let h = 0;
  for (const c of block.id) h = (h * 31 + c.charCodeAt(0)) % 997;
  return {
    animationName: KB_NAMES[h % KB_NAMES.length],
    animationDuration: `${block.kenBurns?.durationMs ?? 8000}ms`,
  };
}

export function MediaContent({
  block,
  variant,
  kenBurns = false,
}: {
  block: Block;
  variant: 'canvas' | 'thumb';
  kenBurns?: boolean;
}) {
  const { url, asset } = useAssetUrl(block.assetId, variant === 'canvas' ? 'full' : 'thumb');
  const poster = useAssetUrl(block.assetId, 'poster');
  if (!url || !asset) return null;
  const focal = block.focal ?? { x: 0.5, y: 0.5 };
  const objectPosition = `${focal.x * 100}% ${focal.y * 100}%`;
  const fitClass = block.fit === 'contain' ? 'h-full w-full object-contain' : 'h-full w-full object-cover';

  if (asset.kind === 'video' && variant === 'canvas') {
    return (
      <video
        src={url}
        poster={poster.url}
        muted
        loop
        autoPlay
        playsInline
        className={fitClass}
        style={{ objectPosition }}
      />
    );
  }
  const src = asset.kind === 'video' ? (poster.url ?? url) : url;
  const img = (
    <img
      src={src}
      alt=""
      draggable={false}
      className={`${fitClass}${kenBurns ? ' kb' : ''}`}
      style={{ objectPosition, ...(kenBurns ? kbStyle(block) : null) }}
    />
  );
  return kenBurns ? <div className="h-full w-full overflow-hidden">{img}</div> : img;
}
