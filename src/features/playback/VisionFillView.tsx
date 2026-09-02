import type { Block, Page } from '../../domain/types';
import { MediaContent } from '../authoring/MediaContent';

// Vision pages in playback fill the whole viewport with their pictures
// instead of letterboxing the Letter canvas: an image mosaic gains
// nothing from page proportions on a phone. Cells re-flow into rows
// sized to the screen; the title floats over the top when present.

function rowsFor(cells: Block[]): Block[][] {
  const n = cells.length;
  if (n <= 2) return cells.map((c) => [c]);
  if (n === 3) return [[cells[0]], [cells[1], cells[2]]];
  if (n === 4) return [
    [cells[0], cells[1]],
    [cells[2], cells[3]],
  ];
  if (n === 5) return [
    [cells[0], cells[1]],
    [cells[2], cells[3], cells[4]],
  ];
  return [
    [cells[0], cells[1]],
    [cells[2], cells[3]],
    [cells[4], cells[5]],
  ];
}

export function VisionFillView({ page, cells }: { page: Page; cells: Block[] }) {
  const titleBlock = page.blocks.find((b) => b.slotId === 'title');
  const title = titleBlock?.text?.trim();
  // Canvas font sizes are in 1275-wide canvas units; scale them to the
  // viewport so the configured size actually shows on a phone, with the
  // old clamp as the fallback when no size was set.
  const ts = titleBlock?.style;
  const titleStyle: React.CSSProperties = {
    textShadow: '0 2px 14px rgba(0,0,0,0.75)',
    fontSize: ts?.fontSize ? `calc(${ts.fontSize} * 100vw / 1275)` : undefined,
    color: ts?.color,
    fontWeight: ts?.weight,
    fontStyle: ts?.italic ? 'italic' : undefined,
  };
  return (
    <div className="relative h-full w-full bg-black">
      <div className="flex h-full w-full flex-col gap-0.5">
        {rowsFor(cells).map((row, i) => (
          <div key={i} className="flex min-h-0 flex-1 gap-0.5">
            {row.map((cell) => (
              <div key={cell.id} className="relative min-w-0 flex-1 overflow-hidden">
                <MediaContent
                  block={cell}
                  variant="canvas"
                  kenBurns={cell.kind === 'image' && (cell.kenBurns?.enabled ?? true)}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
      {title && (
        <p
          className="pointer-events-none absolute inset-x-0 top-8 text-center font-heading text-[clamp(22px,5vw,36px)] font-semibold text-white"
          style={titleStyle}
        >
          {title}
        </p>
      )}
    </div>
  );
}
