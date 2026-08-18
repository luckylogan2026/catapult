import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { CANVAS_H, CANVAS_W, type Block, type BlockRect } from '../../domain/types';

// Free transform for canvas layout: drag to move, corner handles to
// resize, a stem handle to rotate, all in canvas units. Snap guides pull
// toward page edges, page center, and other block edges; holding Alt
// bypasses snapping. The parent applies the final rect through mutate().

const SNAP = 10;
const ROT_SNAP_DEG = 4;

export type SnapLines = { v?: number; h?: number };

type Mode =
  | { kind: 'move'; startX: number; startY: number; rect: BlockRect }
  | { kind: 'resize'; corner: string; startX: number; startY: number; rect: BlockRect }
  | { kind: 'rotate'; cx: number; cy: number; rect: BlockRect };

export function CanvasBlockFrame({
  block,
  siblings,
  scale,
  selected,
  onSelect,
  onChange,
  onSnapLines,
  children,
}: {
  block: Block;
  siblings: Block[];
  scale: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (rect: BlockRect) => void;
  onSnapLines: (lines: SnapLines | null) => void;
  children: ReactNode;
}) {
  const [live, setLive] = useState<BlockRect | null>(null);
  const mode = useRef<Mode | null>(null);
  const rect = live ?? block.rect;

  const snapCandidates = () => {
    const xs = [0, CANVAS_W / 2, CANVAS_W];
    const ys = [0, CANVAS_H / 2, CANVAS_H];
    for (const s of siblings) {
      if (s.id === block.id) continue;
      xs.push(s.rect.x, s.rect.x + s.rect.w, s.rect.x + s.rect.w / 2);
      ys.push(s.rect.y, s.rect.y + s.rect.h, s.rect.y + s.rect.h / 2);
    }
    return { xs, ys };
  };

  const applySnap = (r: BlockRect, bypass: boolean): { rect: BlockRect; lines: SnapLines } => {
    if (bypass) return { rect: r, lines: {} };
    const { xs, ys } = snapCandidates();
    const lines: SnapLines = {};
    let { x, y } = r;
    const edgesX = [
      { v: r.x, set: (t: number) => (x = t) },
      { v: r.x + r.w, set: (t: number) => (x = t - r.w) },
      { v: r.x + r.w / 2, set: (t: number) => (x = t - r.w / 2) },
    ];
    const edgesY = [
      { v: r.y, set: (t: number) => (y = t) },
      { v: r.y + r.h, set: (t: number) => (y = t - r.h) },
      { v: r.y + r.h / 2, set: (t: number) => (y = t - r.h / 2) },
    ];
    outerX: for (const e of edgesX)
      for (const c of xs)
        if (Math.abs(e.v - c) <= SNAP) {
          e.set(c);
          lines.v = c;
          break outerX;
        }
    outerY: for (const e of edgesY)
      for (const c of ys)
        if (Math.abs(e.v - c) <= SNAP) {
          e.set(c);
          lines.h = c;
          break outerY;
        }
    return { rect: { ...r, x, y }, lines };
  };

  const down = (e: PointerEvent, m: Mode) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    mode.current = m;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const move = (e: PointerEvent) => {
    const m = mode.current;
    if (!m) return;
    const dx = (e.clientX - ('startX' in m ? m.startX : 0)) / scale;
    const dy = (e.clientY - ('startY' in m ? m.startY : 0)) / scale;

    if (m.kind === 'move') {
      const raw = { ...m.rect, x: m.rect.x + dx, y: m.rect.y + dy };
      const { rect: snapped, lines } = applySnap(raw, e.altKey);
      setLive(snapped);
      onSnapLines(lines);
    } else if (m.kind === 'resize') {
      let { x, y, w, h } = m.rect;
      if (m.corner.includes('e')) w = Math.max(40, m.rect.w + dx);
      if (m.corner.includes('s')) h = Math.max(40, m.rect.h + dy);
      if (m.corner.includes('w')) {
        w = Math.max(40, m.rect.w - dx);
        x = m.rect.x + (m.rect.w - w);
      }
      if (m.corner.includes('n')) {
        h = Math.max(40, m.rect.h - dy);
        y = m.rect.y + (m.rect.h - h);
      }
      setLive({ ...m.rect, x, y, w, h });
      onSnapLines(null);
    } else {
      const angle = (Math.atan2(e.clientY - m.cy, e.clientX - m.cx) * 180) / Math.PI + 90;
      let rot = Math.round(angle);
      for (const s of [0, 90, 180, -90, -180]) if (Math.abs(rot - s) <= ROT_SNAP_DEG) rot = s;
      setLive({ ...m.rect, rot });
      onSnapLines(null);
    }
  };

  const up = (e: PointerEvent) => {
    if (!mode.current) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    mode.current = null;
    onSnapLines(null);
    setLive((r) => {
      if (r) onChange(r);
      return null;
    });
  };

  const corners = ['nw', 'ne', 'sw', 'se'] as const;

  return (
    <div
      className="absolute"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        transform: `rotate(${rect.rot}deg)`,
        zIndex: block.z,
        cursor: 'move',
        outline: selected ? '2px solid var(--tc-primary)' : undefined,
        outlineOffset: 2,
      }}
      onPointerDown={(e) =>
        down(e, { kind: 'move', startX: e.clientX, startY: e.clientY, rect: { ...rect } })
      }
      onPointerMove={move}
      onPointerUp={up}
    >
      <div className="pointer-events-none h-full w-full overflow-hidden">{children}</div>
      {selected && (
        <>
          {corners.map((c) => (
            <div
              key={c}
              className="absolute h-4 w-4 rounded-sm border border-background bg-primary"
              style={{
                left: c.includes('w') ? -8 : undefined,
                right: c.includes('e') ? -8 : undefined,
                top: c.includes('n') ? -8 : undefined,
                bottom: c.includes('s') ? -8 : undefined,
                cursor: `${c}-resize`,
              }}
              onPointerDown={(e) =>
                down(e, { kind: 'resize', corner: c, startX: e.clientX, startY: e.clientY, rect: { ...rect } })
              }
              onPointerMove={move}
              onPointerUp={up}
            />
          ))}
          <div
            className="absolute left-1/2 -top-9 h-4 w-4 -translate-x-1/2 cursor-grab rounded-full border border-background bg-primary"
            onPointerDown={(e) => {
              const el = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
              down(e, { kind: 'rotate', cx: el.left + el.width / 2, cy: el.top + el.height / 2, rect: { ...rect } });
            }}
            onPointerMove={move}
            onPointerUp={up}
          />
        </>
      )}
    </div>
  );
}
