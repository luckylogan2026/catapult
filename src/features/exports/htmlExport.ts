import { zipSync, strToU8 } from 'fflate';
import { db } from '../../db/db';
import { getPreset } from '../../theme/presets';
import { fontStack } from '../../theme/fontChoices';
import { CANVAS_H, CANVAS_W, type Asset, type Block, type Board, type Page } from '../../domain/types';
import { pagesForTarget } from '../../db/boardRepo';
import { getPageTypeDef, getTemplate } from '../../pageTypes/registry';
import playfairUrl from '../../assets/fonts/playfair-display.woff2?url';
import dmSansUrl from '../../assets/fonts/dm-sans.woff2?url';

// The HTML export: a self-contained standalone viewer with swipe, arrow
// keys, video, page audio, Ken Burns, and teleprompter rolls intact. No
// app, no build step, no server; it opens correctly from file://. The
// zip holds index.html, assets/fonts, and media/<hash>. The single-file
// variant inlines media as data URIs and is offered only under 25 MB of
// total media.

const SINGLE_FILE_CAP = 25 * 1024 * 1024;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function extFor(mime: string): string {
  const map: Record<string, string> = {
    'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
    'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/webm': 'weba', 'audio/ogg': 'ogg',
  };
  return map[mime] ?? 'bin';
}

// Line-based formatting, mirroring FormattedText: bullets, numbers,
// paragraphs.
function formatText(text: string): string {
  const out: string[] = [];
  let list: { kind: 'ul' | 'ol'; items: string[]; start: number } | null = null;
  const flush = () => {
    if (!list) return;
    const items = list.items.map((i) => `<li>${esc(i)}</li>`).join('');
    out.push(list.kind === 'ul' ? `<ul>${items}</ul>` : `<ol start="${list.start}">${items}</ol>`);
    list = null;
  };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (bullet) {
      if (list?.kind !== 'ul') { flush(); list = { kind: 'ul', items: [], start: 1 }; }
      list.items.push(bullet[1]);
    } else if (numbered) {
      if (list?.kind !== 'ol') { flush(); list = { kind: 'ol', items: [], start: Number(numbered[1]) }; }
      list.items.push(numbered[2]);
    } else if (line.trim()) {
      flush();
      out.push(`<p>${esc(line)}</p>`);
    } else {
      flush();
    }
  }
  flush();
  return out.join('');
}

type MediaRef = { src: (id: string) => string };

function blockStyleCss(b: Block): string {
  const s = b.style ?? {};
  const color = s.color === 'muted' ? 'var(--muted)' : s.color && s.color !== 'text' ? s.color : 'var(--text)';
  const family = s.fontFamily === 'heading' ? 'var(--heading)' : 'var(--body)';
  const shadow = s.shadow ? 'text-shadow:0 2px 14px rgba(0,0,0,.65);' : '';
  return `font-family:${family};font-size:${s.fontSize ?? 34}px;font-weight:${s.weight ?? 400};text-align:${s.align ?? 'left'};line-height:${s.lineHeight ?? 1.35};color:${color};${shadow}`;
}

function mediaHtml(b: Block, asset: Asset | undefined, m: MediaRef, kb: boolean): string {
  if (!b.assetId || !asset) return '';
  const fit = b.fit === 'contain' ? 'contain' : 'cover';
  const focal = b.focal ?? { x: 0.5, y: 0.5 };
  const pos = `${focal.x * 100}% ${focal.y * 100}%`;
  if (asset.kind === 'video') {
    return `<video data-vid muted loop playsinline preload="metadata" src="${m.src(b.assetId)}" style="width:100%;height:100%;object-fit:${fit};object-position:${pos}"></video>`;
  }
  const kbc = kb && b.kenBurns?.enabled !== false ? ' class="kb"' : '';
  return `<img${kbc} src="${m.src(b.assetId)}" style="width:100%;height:100%;object-fit:${fit};object-position:${pos}">`;
}

function fixedPageHtml(page: Page, assets: Map<string, Asset>, m: MediaRef): string {
  const def = getPageTypeDef(page.type);
  const template = getTemplate(def, page.templateId);
  const parts: string[] = [];
  const blocks = [...page.blocks].sort((a, b) => a.z - b.z);
  for (const b of blocks) {
    const slot = template.slots.find((s) => s.id === b.slotId);
    const rect = page.layout === 'canvas' ? b.rect : (slot?.rect ?? b.rect);
    const style = `position:absolute;left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px;transform:rotate(${rect.rot}deg);overflow:hidden;`;
    if (b.kind === 'text') {
      if (!(b.text ?? '').trim()) continue;
      parts.push(`<div style="${style}${blockStyleCss(b)}">${formatText(b.text ?? '')}</div>`);
    } else if (b.assetId) {
      const caption = b.caption
        ? `<span style="position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.55);color:#fff;padding:4px 8px;font-family:var(--body);font-size:22px">${esc(b.caption)}</span>`
        : '';
      parts.push(`<div style="${style}">${mediaHtml(b, assets.get(b.assetId), m, true)}${caption}</div>`);
    } else if (b.caption?.trim()) {
      parts.push(`<div style="${style}display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.2);font-family:var(--body);font-size:26px;color:var(--text);padding:12px">${formatText(b.caption)}</div>`);
    }
  }
  return `<div class="fit"><div class="canvas">${parts.join('')}</div></div>`;
}

function flowPageHtml(page: Page, assets: Map<string, Asset>, m: MediaRef, roll: boolean): string {
  const def = getPageTypeDef(page.type);
  const template = getTemplate(def, page.templateId);
  const order = new Map(template.slots.map((s, i) => [s.id, i]));
  const bg = page.blocks.find((b) => b.slotId === 'background' && b.assetId);
  const texts = page.blocks
    .filter((b) => b.kind === 'text' && (b.text ?? '').trim())
    .sort((a, b) => (order.get(a.slotId ?? '') ?? 99) - (order.get(b.slotId ?? '') ?? 99))
    .map((b) => {
      const isTitle = b.slotId === 'title';
      const family = isTitle || b.style?.fontFamily === 'heading' ? 'var(--heading)' : 'var(--body)';
      const size = isTitle ? 34 : b.style?.fontFamily === 'heading' ? 24 : 19;
      return `<div style="font-family:${family};font-size:${size}px;line-height:${isTitle ? 1.2 : 1.65};font-weight:${b.style?.weight ?? (isTitle ? 600 : 400)};${bg ? 'text-shadow:0 1px 8px rgba(0,0,0,.6);' : ''}">${formatText(b.text ?? '')}</div>`;
    })
    .join('');
  const bgHtml = bg
    ? `<div style="position:absolute;inset:0">${mediaHtml(bg, assets.get(bg.assetId!), m, false)}</div><div style="position:absolute;inset:0;background:rgba(0,0,0,.45)"></div>`
    : '';
  const inner = `<div class="col">${texts || `<p style="font-family:var(--heading);font-size:34px;font-weight:600">${esc(page.title)}</p>`}</div>`;
  const body = roll
    ? `<div class="roll" data-roll data-speed="${page.rollSpeed ?? 'normal'}">${inner}</div>`
    : `<div class="scroll">${inner}</div>`;
  return `<div style="position:absolute;inset:0">${bgHtml}${body}</div>`;
}

function audioAttrs(page: Page): string {
  if (!page.narrationAssetId) return '';
  return ` data-audio="${page.narrationAssetId}" data-audio-loop="${page.audioLoop ? 1 : 0}"`;
}

export async function buildHtmlExport(board: Board): Promise<{
  zip: Blob;
  singleFile: Blob | null;
  totalMediaBytes: number;
}> {
  const pages = pagesForTarget(board, 'html');
  const theme = getPreset(board.theme.presetId);
  const colors = { ...theme.colors, ...board.theme.colors };
  const fonts = { ...theme.fonts, ...board.theme.fonts };

  // Collect referenced assets for these pages plus affirmation images.
  const ids = new Set<string>();
  for (const p of pages) {
    if (p.narrationAssetId) ids.add(p.narrationAssetId);
    for (const b of p.blocks) if (b.assetId) ids.add(b.assetId);
  }
  const activeAffirmations = board.affirmations.filter((a) => a.active && a.text.trim());
  for (const a of activeAffirmations) if (a.imageAssetId) ids.add(a.imageAssetId);
  for (const e of board.masterAffirmations ?? []) {
    if (e.active && e.audioAssetId) ids.add(e.audioAssetId);
  }

  const assets = new Map<string, Asset>();
  let totalMediaBytes = 0;
  for (const id of ids) {
    const a = await db.assets.get(id);
    if (a) {
      assets.set(id, a);
      totalMediaBytes += a.bytes;
    }
  }

  const filename = (id: string) => `media/${id}.${extFor(assets.get(id)?.mime ?? '')}`;
  const relRef: MediaRef = { src: (id) => filename(id) };

  // Build the screens, mirroring playback: sequential affirmations for a
  // deterministic document.
  const screens: string[] = [];
  const intro = board.pages.find((p) => p.type === 'affirmations-intro');
  const introBg = intro?.blocks.find((b) => b.slotId === 'background' && b.assetId);

  const affirmationScreen = (text: string, imageId?: string) => {
    const bgBlock = imageId
      ? `<div style="position:absolute;inset:0"><img class="kb" src="${relRef.src(imageId)}" style="width:100%;height:100%;object-fit:cover"></div>`
      : introBg
        ? `<div style="position:absolute;inset:0">${mediaHtml(introBg, assets.get(introBg.assetId!), relRef, false)}</div>`
        : '';
    return `<section class="screen"${intro ? audioAttrs(intro) : ''}>${bgBlock}<div style="position:absolute;inset:0;background:rgba(0,0,0,.35)"></div><div class="center"><p style="font-family:var(--heading);font-size:clamp(26px,6vw,44px);font-weight:600;color:#fff;text-shadow:0 2px 16px rgba(0,0,0,.7);max-width:36rem">${esc(text)}</p></div></section>`;
  };

  for (const page of pages) {
    const def = getPageTypeDef(page.type);
    if (def.authoring === 'affirmation-list') {
      if (page.affirmationDisplay === 'roll' && activeAffirmations.length) {
        const items = activeAffirmations
          .map((a) => `<p style="font-family:var(--heading);font-size:clamp(24px,5.5vw,40px);font-weight:600;color:#fff;text-shadow:0 2px 16px rgba(0,0,0,.7);max-width:36rem;margin:0 0 56px">${esc(a.text)}</p>`)
          .join('');
        const bg = introBg ? `<div style="position:absolute;inset:0">${mediaHtml(introBg, assets.get(introBg.assetId!), relRef, false)}</div><div style="position:absolute;inset:0;background:rgba(0,0,0,.4)"></div>` : '';
        screens.push(`<section class="screen"${intro ? audioAttrs(intro) : ''}>${bg}<div class="roll" data-roll data-speed="${page.rollSpeed ?? 'normal'}"><div class="col" style="align-items:center;text-align:center">${items}</div></div></section>`);
      } else {
        for (const a of activeAffirmations) screens.push(affirmationScreen(a.text, a.imageAssetId));
      }
      continue;
    }
    if (def.authoring === 'master-affirmation-list') {
      for (const e of board.masterAffirmations ?? []) {
        if (!e.active || !e.text.trim()) continue;
        const audio = e.audioAssetId ? ` data-audio="${e.audioAssetId}" data-audio-loop="0"` : '';
        screens.push(`<section class="screen"${audio}><div class="center"><div style="font-family:var(--heading);font-size:clamp(20px,4.5vw,30px);line-height:1.7;max-width:40rem;color:var(--text)">${formatText(e.text)}</div></div></section>`);
      }
      continue;
    }
    if (def.cellExpansion && page.expandCells) {
      const cells = page.blocks.filter((b) => b.slotId?.startsWith('cell-') && b.assetId);
      if (cells.length) {
        for (const c of cells) {
          screens.push(`<section class="screen" style="background:#000"><div style="position:absolute;inset:0">${mediaHtml(c, assets.get(c.assetId!), relRef, true)}</div></section>`);
        }
        continue;
      }
    }
    if (def.textFlow) {
      screens.push(`<section class="screen"${audioAttrs(page)}>${flowPageHtml(page, assets, relRef, !!page.textRoll)}</section>`);
      continue;
    }
    screens.push(`<section class="screen"${audioAttrs(page)}>${fixedPageHtml(page, assets, relRef)}</section>`);
  }

  const makeHtml = (fontSrc: (name: string) => string, mediaMap?: Map<string, string>) => {
    let html = htmlShell(board.meta.title, colors, fonts, screens.join('\n'), fontSrc);
    if (mediaMap) {
      for (const [id, dataUri] of mediaMap) {
        html = html.split(filename(id)).join(dataUri);
      }
    }
    return html;
  };

  // Zip variant: fonts and media as files.
  const files: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  const [playfairBytes, dmBytes] = await Promise.all([
    fetch(playfairUrl).then((r) => r.arrayBuffer()),
    fetch(dmSansUrl).then((r) => r.arrayBuffer()),
  ]);
  files['assets/fonts/playfair.woff2'] = [new Uint8Array(playfairBytes), { level: 0 }];
  files['assets/fonts/dmsans.woff2'] = [new Uint8Array(dmBytes), { level: 0 }];
  for (const [id, a] of assets) {
    files[filename(id)] = [new Uint8Array(await a.blob.arrayBuffer()), { level: 0 }];
  }
  files['index.html'] = [
    strToU8(makeHtml((n) => (n === 'Playfair Display' ? 'assets/fonts/playfair.woff2' : 'assets/fonts/dmsans.woff2'))),
    { level: 6 },
  ];
  const zipped = zipSync(files);
  const zipCopy = new Uint8Array(zipped.length);
  zipCopy.set(zipped);
  const zip = new Blob([zipCopy.buffer], { type: 'application/zip' });

  // Single-file variant under the cap: media and fonts inline.
  let singleFile: Blob | null = null;
  if (totalMediaBytes <= SINGLE_FILE_CAP) {
    const toDataUri = (buf: ArrayBuffer, mime: string) => {
      const b = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < b.length; i += 32768) bin += String.fromCharCode(...b.subarray(i, i + 32768));
      return `data:${mime};base64,${btoa(bin)}`;
    };
    const mediaMap = new Map<string, string>();
    for (const [id, a] of assets) mediaMap.set(id, toDataUri(await a.blob.arrayBuffer(), a.mime));
    const fontData = new Map<string, string>([
      ['Playfair Display', toDataUri(playfairBytes, 'font/woff2')],
      ['DM Sans', toDataUri(dmBytes, 'font/woff2')],
    ]);
    singleFile = new Blob([makeHtml((n) => fontData.get(n) ?? '', mediaMap)], { type: 'text/html' });
  }

  return { zip, singleFile, totalMediaBytes };
}

function htmlShell(
  title: string,
  colors: Record<string, string>,
  fonts: { heading: string; body: string },
  screensHtml: string,
  fontSrc: (name: string) => string,
): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<style>
@font-face{font-family:'Playfair Display';font-weight:400 900;src:url('${fontSrc('Playfair Display')}') format('woff2')}
@font-face{font-family:'DM Sans';font-weight:100 1000;src:url('${fontSrc('DM Sans')}') format('woff2')}
:root{--bg:${colors.background};--surface:${colors.surface};--accent:${colors.primary};--text:${colors.text};--muted:${colors.textMuted};--heading:${fontStack(fonts.heading)};--body:${fontStack(fonts.body)}}
*{margin:0;box-sizing:border-box}
html,body{height:100%;overflow:hidden;background:var(--bg)}
#deck{position:fixed;inset:0;touch-action:pan-y}
.screen{position:absolute;inset:0;overflow:hidden;background:var(--bg);transition:transform .32s cubic-bezier(.22,.9,.3,1)}
.fit{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.canvas{position:relative;width:${CANVAS_W}px;height:${CANVAS_H}px;background:var(--bg);transform-origin:center;flex:none}
.center{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:32px}
.scroll{position:absolute;inset:0;overflow-y:auto;padding:40px 24px;touch-action:pan-y}
.col{max-width:36rem;margin:0 auto;display:flex;flex-direction:column;gap:16px;color:var(--text)}
.col p,.col ul,.col ol{margin:0 0 .55em}
.col ul{padding-left:1.2em}.col ol{padding-left:1.4em}
.roll{position:absolute;left:0;right:0;display:flex;flex-direction:column;align-items:center;padding:0 32px;animation:rollup linear infinite;animation-play-state:paused}
@keyframes rollup{from{transform:translateY(50vh)}to{transform:translateY(-100%)}}
.kb{animation:kb 9s ease-in-out both alternate infinite}
@keyframes kb{from{transform:scale(1)}to{transform:scale(1.09) translate(-1.2%,-1%)}}
@media (prefers-reduced-motion:reduce){.kb,.roll{animation:none}}
#hint{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);color:rgba(255,255,255,.4);font-family:var(--body);font-size:12px;pointer-events:none}
</style>
</head>
<body>
<div id="deck">
${screensHtml}
</div>
<div id="hint"></div>
<script>
(function(){
var deck=document.getElementById('deck');
var screens=[].slice.call(deck.querySelectorAll('.screen'));
var i=0,dragX=0,drag=null,audio=new Audio(),audioOwner=null;
var SPEEDS={slow:35,normal:55,fast:90};
function layout(anim){
  screens.forEach(function(s,k){
    var off=(k-i)*100;
    s.style.transition=anim?'':'none';
    s.style.transform='translateX(calc('+off+'% + '+dragX+'px))';
    s.style.visibility=Math.abs(k-i)>1?'hidden':'visible';
  });
  fitCanvases();
}
function fitCanvases(){
  screens.forEach(function(s){
    var c=s.querySelector('.canvas');
    if(!c)return;
    var sc=Math.min(innerWidth/${CANVAS_W},innerHeight/${CANVAS_H});
    c.style.transform='scale('+sc+')';
  });
}
function activate(){
  screens.forEach(function(s,k){
    var active=k===i;
    [].slice.call(s.querySelectorAll('video[data-vid]')).forEach(function(v){
      if(active){v.play().catch(function(){});}else{v.pause();}
    });
    var r=s.querySelector('[data-roll]');
    if(r){
      if(active){
        var clone=r.cloneNode(true);
        r.parentNode.replaceChild(clone,r);
        var d=(clone.scrollHeight+innerHeight*.5)/SPEEDS[clone.getAttribute('data-speed')||'normal'];
        clone.style.animationDuration=d+'s';
        clone.style.animationPlayState='running';
      } else {
        r.style.animationPlayState='paused';
      }
    }
  });
  var s=screens[i];
  var aid=s.getAttribute('data-audio');
  if(aid){
    if(audioOwner!==aid){
      audio.pause();
      audio.src=s.getAttribute('data-audio-src')||mediaFor(aid);
      audio.loop=s.getAttribute('data-audio-loop')==='1';
      audioOwner=aid;
      audio.play().catch(function(){});
    }
  } else if(audioOwner){
    audio.pause();audioOwner=null;
  }
}
function mediaFor(id){
  var el=document.querySelector('[src*="'+id+'"]');
  if(el)return el.getAttribute('src');
  return 'media/'+id;
}
function go(n){
  i=Math.max(0,Math.min(screens.length-1,n));
  dragX=0;layout(true);activate();
}
addEventListener('keydown',function(e){
  if(e.key==='ArrowRight'||e.key===' '){e.preventDefault();go(i+1);}
  if(e.key==='ArrowLeft'){e.preventDefault();go(i-1);}
});
deck.addEventListener('pointerdown',function(e){
  if(e.clientX<24)return;
  drag={x:e.clientX,y:e.clientY,h:null};
  deck.setPointerCapture(e.pointerId);
});
deck.addEventListener('pointermove',function(e){
  if(!drag)return;
  var dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(drag.h===null){
    if(Math.abs(dx)<6&&Math.abs(dy)<6)return;
    drag.h=Math.abs(dx)>Math.abs(dy);
  }
  if(!drag.h)return;
  var end=(i===0&&dx>0)||(i===screens.length-1&&dx<0);
  dragX=end?dx*.3:dx;
  layout(false);
});
deck.addEventListener('pointerup',function(e){
  if(!drag)return;
  var dx=e.clientX-drag.x,h=drag.h;drag=null;
  if(!h){
    if(Math.abs(dx)<6){
      if(e.clientX>innerWidth*2/3)go(i+1);
      else if(e.clientX<innerWidth/6)go(i-1);
    }
    dragX=0;layout(true);return;
  }
  if(Math.abs(dx)>innerWidth*.2){go(dx<0?i+1:i-1);}
  else{dragX=0;layout(true);}
});
addEventListener('resize',function(){layout(false);});
layout(false);activate();
})();
</script>
</body>
</html>`;
}
