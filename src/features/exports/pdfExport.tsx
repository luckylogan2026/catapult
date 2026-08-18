import { createRoot } from 'react-dom/client';
import { toPng } from 'html-to-image';
import { PDFDocument } from 'pdf-lib';
import { CANVAS_H, CANVAS_W, type Board, type Page } from '../../domain/types';
import { pagesForTarget } from '../../db/boardRepo';
import { getPageTypeDef } from '../../pageTypes/registry';
import { PageView } from '../authoring/PageView';
import { BoardProvider } from '../board/BoardContext';
import { ImportProvider } from '../authoring/ImportContext';
import { slotsOfPage } from '../authoring/boardOps';
import { TextFlowContent } from '../playback/TextFlowView';
import { PdfModeContext } from './pdfMode';
import { brand } from '../../config';

// PDF export: each included page rasterizes at 2x through html-to-image
// and lands on a US Letter portrait page. The 1275 x 1650 canvas maps
// onto Letter exactly at 150 DPI, so there are no scaling artifacts.
// Text pages that overflow the canvas render at their natural height
// and slice into continuation pages rather than shrinking the type.

const PAGE_PT_W = 612;
const PAGE_PT_H = 792;

function pdfLayout(page: Page): 'fixed' | 'flow' {
  const def = getPageTypeDef(page.type);
  return def.textFlow ? 'flow' : 'fixed';
}

// The print rendering of a text page: canvas-width column, print-sized
// type, natural height.
function PdfFlowPage({ page }: { page: Page }) {
  const title = page.blocks.find((b) => b.slotId === 'title')?.text?.trim() || page.title;
  return (
    <div
      style={{
        width: CANVAS_W,
        minHeight: CANVAS_H,
        background: 'var(--tc-background)',
        color: 'var(--tc-text)',
        padding: 96,
      }}
    >
      <p style={{ fontFamily: 'var(--tc-font-heading)', fontSize: 84, fontWeight: 600, margin: 0 }}>
        {title}
      </p>
      <div style={{ marginTop: 48, fontSize: 38 }}>
        <div style={{ transform: 'none' }}>
          <PdfFlowBody page={page} />
        </div>
      </div>
    </div>
  );
}

function PdfFlowBody({ page }: { page: Page }) {
  // Reuse the playback text flow content but strip the title block,
  // which the header above already shows.
  const clone: Page = { ...page, blocks: page.blocks.filter((b) => b.slotId !== 'title') };
  return (
    <div style={{ fontSize: 38, lineHeight: 1.6 }} className="pdf-flow">
      <TextFlowContent page={clone} />
    </div>
  );
}

async function waitForMedia(node: HTMLElement): Promise<void> {
  await document.fonts.ready;
  const deadline = performance.now() + 10000;
  for (;;) {
    const imgs = [...node.querySelectorAll('img')];
    const pending = imgs.filter((i) => !i.complete || i.naturalWidth === 0);
    if (!pending.length || performance.now() > deadline) return;
    await new Promise((r) => setTimeout(r, 120));
  }
}

async function renderPagePngs(
  board: Board,
  page: Page,
  onStatus: (label: string) => void,
): Promise<string[]> {
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-30000px;top:0;width:${CANVAS_W}px;background:var(--tc-background);z-index:-1;`;
  document.body.appendChild(host);
  const root = createRoot(host);
  const layout = pdfLayout(page);

  root.render(
    <BoardProvider>
      <ImportProvider slotsOf={slotsOfPage}>
        <PdfModeContext.Provider value={true}>
          {layout === 'fixed' ? (
            <div style={{ width: CANVAS_W, height: CANVAS_H, overflow: 'hidden' }}>
              <PageView board={board} page={page} variant="play" />
            </div>
          ) : (
            <PdfFlowPage page={page} />
          )}
        </PdfModeContext.Provider>
      </ImportProvider>
    </BoardProvider>,
  );

  try {
    await new Promise((r) => setTimeout(r, 80));
    await waitForMedia(host);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const node = host.firstElementChild as HTMLElement;
    const fullH = Math.max(CANVAS_H, node.scrollHeight);
    const png = await toPng(node, {
      pixelRatio: 2,
      width: CANVAS_W,
      height: fullH,
      style: { margin: '0' },
    });
    if (fullH <= CANVAS_H + 8) return [png];

    // Slice the tall capture into Letter-height continuation pages.
    onStatus('slicing');
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = png;
    });
    const out: string[] = [];
    const chunkPx = CANVAS_H * 2;
    for (let y = 0; y < img.height; y += chunkPx) {
      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_W * 2;
      canvas.height = chunkPx;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--tc-background') || brand.palette.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, -y);
      out.push(canvas.toDataURL('image/png'));
    }
    return out;
  } finally {
    root.unmount();
    host.remove();
  }
}

export async function exportPdf(
  board: Board,
  onProgress: (done: number, total: number) => void,
): Promise<Blob> {
  const pages = pagesForTarget(board, 'pdf');
  const doc = await PDFDocument.create();

  for (let i = 0; i < pages.length; i++) {
    onProgress(i, pages.length);
    const pngs = await renderPagePngs(board, pages[i], () => {});
    for (const dataUri of pngs) {
      const bytes = Uint8Array.from(atob(dataUri.split(',')[1]), (c) => c.charCodeAt(0));
      const embedded = await doc.embedPng(bytes);
      const p = doc.addPage([PAGE_PT_W, PAGE_PT_H]);
      p.drawImage(embedded, { x: 0, y: 0, width: PAGE_PT_W, height: PAGE_PT_H });
    }
  }
  onProgress(pages.length, pages.length);

  const bytes = await doc.save();
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: 'application/pdf' });
}

export function pdfFilename(board: Board): string {
  const date = new Date().toISOString().slice(0, 10);
  const owner = board.meta.ownerName.trim().replace(/\s+/g, '-') || 'board';
  return `${owner}-vision-${date}.pdf`;
}
