import type { Page } from '../../domain/types';
import { FormattedText } from '../authoring/FormattedText';
import { MediaContent } from '../authoring/MediaContent';
import { getPageTypeDef, getTemplate } from '../../pageTypes/registry';

// Deviation a: text pages render mobile-native during playback instead
// of scaling the canvas down to unreadable sizes. Blocks stack in slot
// order at comfortable reading sizes and the page scrolls vertically,
// which pan-y in the deck leaves free.
export function TextFlowView({ page }: { page: Page }) {
  const def = getPageTypeDef(page.type);
  const template = getTemplate(def, page.templateId);
  const bg = page.blocks.find((b) => b.slotId === 'background' && b.assetId);
  const slotOrder = new Map(template.slots.map((s, i) => [s.id, i]));
  const textBlocks = page.blocks
    .filter((b) => b.kind === 'text' && b.slotId !== undefined && (b.text ?? '').trim())
    .sort((a, b) => (slotOrder.get(a.slotId!) ?? 99) - (slotOrder.get(b.slotId!) ?? 99));

  return (
    <div className="relative h-full w-full">
      {bg && (
        <div className="absolute inset-0">
          <MediaContent block={bg} variant="canvas" />
          <div className="absolute inset-0 bg-black/45" />
        </div>
      )}
      <div
        className="relative h-full w-full overflow-y-auto px-6 py-10"
        style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
      >
        <div className="mx-auto flex max-w-xl flex-col gap-4 pb-16">
          {textBlocks.length === 0 && (
            <p className="font-heading text-[34px] font-semibold text-text">{page.title}</p>
          )}
          {textBlocks.map((b) => {
            const isTitle = b.slotId === 'title';
            const heading = b.style?.fontFamily === 'heading';
            return (
              <FormattedText
                key={b.id}
                text={b.text ?? ''}
                style={{
                  fontFamily: heading || isTitle ? 'var(--tc-font-heading)' : 'var(--tc-font-body)',
                  fontSize: isTitle ? 34 : heading ? 24 : 19,
                  fontWeight: b.style?.weight ?? (isTitle ? 600 : 400),
                  lineHeight: isTitle ? 1.2 : 1.65,
                  textAlign: (b.style?.align ?? 'left') as React.CSSProperties['textAlign'],
                  color:
                    b.style?.color === 'muted'
                      ? 'var(--tc-text-muted)'
                      : b.style?.color && b.style.color !== 'text'
                        ? b.style.color
                        : 'var(--tc-text)',
                  textShadow: bg ? '0 1px 8px rgba(0,0,0,0.6)' : undefined,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
