import { useEffect, useRef, useState } from 'react';
import { CANVAS_H, CANVAS_W, type Block, type Board } from '../../domain/types';
import type { Screen } from './screens';
import { PageView } from '../authoring/PageView';
import { MediaContent } from '../authoring/MediaContent';
import { TextFlowView } from './TextFlowView';
import { FormattedText } from '../authoring/FormattedText';

// One playback screen. Fixed-canvas pages scale to fit with the ambient
// backdrop filling the letterbox bands. Cell, affirmation, and master
// screens are full-bleed compositions of their own.

function Backdrop({ screen }: { screen: Screen }) {
  const page =
    screen.kind === 'affirmation' || screen.kind === 'affirmation-roll'
      ? (screen.introPage ?? screen.page)
      : screen.page;
  const b = page.backdrop;
  return (
    <div className="absolute inset-0" style={{ background: b?.color ?? 'var(--tc-background)' }}>
      {b?.blurDataUri && (
        <img
          src={b.blurDataUri}
          alt=""
          className="h-full w-full scale-110 object-cover opacity-70 blur-2xl"
          draggable={false}
        />
      )}
    </div>
  );
}

function FittedPage({ board, screen }: { board: Board; screen: Screen & { kind: 'page' } }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setScale(Math.min(el.clientWidth / CANVAS_W, el.clientHeight / CANVAS_H));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="relative flex h-full w-full items-center justify-center">
      {scale > 0 && (
        <div
          className="overflow-hidden shadow-2xl"
          style={{ width: CANVAS_W * scale, height: CANVAS_H * scale }}
        >
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <PageView board={board} page={screen.page} variant="play" />
          </div>
        </div>
      )}
    </div>
  );
}

function FullBleedMedia({ block }: { block: Block }) {
  return (
    <div className="absolute inset-0">
      <MediaContent
        block={block}
        variant="canvas"
        kenBurns={block.kind === 'image' && (block.kenBurns?.enabled ?? true)}
      />
    </div>
  );
}

export function ScreenView({ board, screen }: { board: Board; screen: Screen }) {
  if (screen.kind === 'page') {
    if (screen.textFlow) {
      return (
        <div className="relative h-full w-full">
          <Backdrop screen={screen} />
          <TextFlowView page={screen.page} />
        </div>
      );
    }
    return (
      <div className="relative h-full w-full">
        <Backdrop screen={screen} />
        <FittedPage board={board} screen={screen} />
      </div>
    );
  }

  if (screen.kind === 'cell') {
    return (
      <div className="relative h-full w-full bg-black">
        <FullBleedMedia block={screen.block} />
      </div>
    );
  }

  if (screen.kind === 'affirmation') {
    const a = screen.affirmation;
    const ownImage: Block | null = a.imageAssetId
      ? {
          id: `aff-${a.id}`,
          kind: 'image',
          assetId: a.imageAssetId,
          rect: { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H, rot: 0 },
          z: 0,
          kenBurns: { enabled: true, from: { x: 0, y: 0, w: 1, h: 1 }, to: { x: 0, y: 0, w: 1, h: 1 }, durationMs: 9000 },
        }
      : null;
    const introBg = !ownImage
      ? screen.introPage?.blocks.find((b) => b.slotId === 'background' && b.assetId)
      : null;
    return (
      <div className="relative h-full w-full">
        <Backdrop screen={screen} />
        {ownImage && <FullBleedMedia block={ownImage} />}
        {introBg && <FullBleedMedia block={introBg} />}
        {(ownImage || introBg) && <div className="absolute inset-0 bg-black/35" />}
        <div className="relative flex h-full w-full flex-col items-center justify-center gap-6 px-8 text-center">
          <p
            className="max-w-xl font-heading text-[clamp(26px,6vw,44px)] font-semibold leading-snug text-white"
            style={{ textShadow: '0 2px 16px rgba(0,0,0,0.7)' }}
          >
            {a.text}
          </p>
          {a.emotionTag?.trim() && (
            <p className="font-body text-sm uppercase tracking-[0.25em] text-white/70">{a.emotionTag}</p>
          )}
        </div>
      </div>
    );
  }

  if (screen.kind === 'affirmation-roll') {
    const introBg = screen.introPage?.blocks.find((b) => b.slotId === 'background' && b.assetId);
    // Roughly six seconds of screen time per affirmation.
    const durationMs = Math.max(20000, screen.list.length * 6000);
    return (
      <div className="relative h-full w-full overflow-hidden">
        <Backdrop screen={screen} />
        {introBg && <FullBleedMedia block={introBg} />}
        {introBg && <div className="absolute inset-0 bg-black/40" />}
        <div
          className="teleprompter absolute inset-x-0 flex flex-col items-center gap-14 px-8 text-center"
          style={{ animationDuration: `${durationMs}ms` }}
        >
          {screen.list.map((a) => (
            <div key={a.id} className="flex flex-col items-center gap-2">
              <p
                className="max-w-xl font-heading text-[clamp(24px,5.5vw,40px)] font-semibold leading-snug text-white"
                style={{ textShadow: '0 2px 16px rgba(0,0,0,0.7)' }}
              >
                {a.text}
              </p>
              {a.emotionTag?.trim() && (
                <p className="font-body text-xs uppercase tracking-[0.25em] text-white/60">{a.emotionTag}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Master affirmation: a longer declaration, given room to breathe.
  return (
    <div className="relative h-full w-full">
      <Backdrop screen={screen} />
      <div
        className="relative flex h-full w-full items-center justify-center overflow-y-auto px-8 py-12"
        style={{ touchAction: 'pan-y' }}
      >
        <FormattedText
          text={screen.entry.text}
          style={{
            fontFamily: 'var(--tc-font-heading)',
            fontSize: 'clamp(20px, 4.5vw, 30px)' as unknown as number,
            lineHeight: 1.7,
            color: 'var(--tc-text)',
            textAlign: 'center',
            maxWidth: '40rem',
          }}
        />
      </div>
    </div>
  );
}
