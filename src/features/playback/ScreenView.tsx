import { useEffect, useRef, useState } from 'react';

function useIsPortrait(): boolean {
  const [portrait, setPortrait] = useState(() => window.matchMedia('(orientation: portrait)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)');
    const onChange = () => setPortrait(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return portrait;
}
import { CANVAS_H, CANVAS_W, type Block, type Board } from '../../domain/types';
import type { Screen } from './screens';
import { PageView } from '../authoring/PageView';
import { MediaContent } from '../authoring/MediaContent';
import { TextFlowView, TextFlowContent } from './TextFlowView';
import { Teleprompter } from './Teleprompter';
import { VisionFillView } from './VisionFillView';
import { getPageTypeDef, getTemplate } from '../../pageTypes/registry';
import { appearanceVars } from '../../theme/pageAppearance';
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

export function ScreenView({
  board,
  screen,
  active = true,
  paused = false,
  onRollEnd,
}: {
  board: Board;
  screen: Screen;
  active?: boolean;
  paused?: boolean;
  onRollEnd?: () => void;
}) {
  const portrait = useIsPortrait();
  if (screen.kind === 'page') {
    if (screen.textFlow) {
      const bg = screen.page.blocks.find((b) => b.slotId === 'background' && b.assetId);
      if (screen.page.textRoll) {
        return (
          <div className="relative h-full w-full overflow-hidden" style={appearanceVars(screen.page)}>
            <Backdrop screen={screen} />
            {bg && <FullBleedMedia block={bg} />}
            {bg && (
              <div
                className={
                  screen.page.appearance === 'light'
                    ? 'absolute inset-0 bg-white/70'
                    : 'absolute inset-0 bg-black/45'
                }
              />
            )}
            <Teleprompter speed={screen.page.rollSpeed} active={active} paused={paused} onEnd={onRollEnd}>
              <TextFlowContent page={screen.page} />
            </Teleprompter>
          </div>
        );
      }
      return (
        <div className="relative h-full w-full" style={appearanceVars(screen.page)}>
          <Backdrop screen={screen} />
          <TextFlowView page={screen.page} />
        </div>
      );
    }
    // Vision pages fill the viewport with their pictures instead of
    // letterboxing the canvas.
    const def = getPageTypeDef(screen.page.type);
    const template = getTemplate(def, screen.page.templateId);
    const bgSlot = template.slots.find((s) => s.id === 'background' && s.kind === 'media');
    const bgBlock = bgSlot
      ? screen.page.blocks.find((b) => b.slotId === 'background' && b.assetId)
      : undefined;
    if (bgBlock && portrait) {
      const slotOrder = new Map(template.slots.map((s, i) => [s.id, i]));
      const texts = screen.page.blocks
        .filter((b) => b.kind === 'text' && (b.text ?? '').trim())
        .sort((a, b) => (slotOrder.get(a.slotId ?? '') ?? 99) - (slotOrder.get(b.slotId ?? '') ?? 99));
      return (
        <div className="relative h-full w-full bg-black">
          <FullBleedMedia block={bgBlock} />
          <div className="absolute inset-0 bg-black/25" />
          <div className="relative flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center">
            {texts.map((b) => {
              const isTitle = b.slotId === 'title';
              return (
                <p
                  key={b.id}
                  className={isTitle ? 'font-heading font-bold text-white' : 'font-body text-white/90'}
                  style={{
                    fontSize: isTitle ? 'clamp(30px, 9vw, 76px)' : 'clamp(15px, 4vw, 28px)',
                    lineHeight: 1.2,
                    textShadow: '0 2px 16px rgba(0,0,0,0.7)',
                  }}
                >
                  {b.text}
                </p>
              );
            })}
          </div>
        </div>
      );
    }
    if (def.cellExpansion && portrait) {
      const cells = screen.page.blocks
        .filter((b) => b.slotId?.startsWith('cell-') && b.assetId)
        .sort((a, b) => (a.slotId ?? '').localeCompare(b.slotId ?? '', undefined, { numeric: true }));
      if (cells.length) return <VisionFillView page={screen.page} cells={cells.slice(0, 6)} />;
    }
    return (
      <div className="relative h-full w-full">
        <Backdrop screen={screen} />
        <FittedPage board={board} screen={screen} />
      </div>
    );
  }

  if (screen.kind === 'cell') {
    // On wide screens the whole picture shows against the ambient
    // backdrop instead of cropping into the frame; an explicit Fill
    // choice on the block still wins.
    const cellBlock =
      !portrait && !screen.block.fit ? { ...screen.block, fit: 'contain' as const } : screen.block;
    return (
      <div className="relative h-full w-full bg-black">
        <Backdrop screen={screen} />
        <FullBleedMedia block={cellBlock} />
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
        </div>
      </div>
    );
  }

  if (screen.kind === 'affirmation-roll') {
    const introBg = screen.introPage?.blocks.find((b) => b.slotId === 'background' && b.assetId);
    return (
      <div className="relative h-full w-full overflow-hidden">
        <Backdrop screen={screen} />
        {introBg && <FullBleedMedia block={introBg} />}
        {introBg && <div className="absolute inset-0 bg-black/40" />}
        <Teleprompter speed={screen.page.rollSpeed} active={active} paused={paused} onEnd={onRollEnd}>
          <div className="flex flex-col items-center gap-14">
          {screen.list.map((a) => (
            <div key={a.id} className="flex flex-col items-center gap-2">
              <p
                className="max-w-xl font-heading text-[clamp(24px,5.5vw,40px)] font-semibold leading-snug text-white"
                style={{ textShadow: '0 2px 16px rgba(0,0,0,0.7)' }}
              >
                {a.text}
              </p>
            </div>
          ))}
          </div>
        </Teleprompter>
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
