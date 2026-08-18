import { Fragment, type CSSProperties } from 'react';

// Simple word-processor formatting for displayed text, line based:
//   - or * starts a bullet line
//   1. / 2. / 3) starts a numbered line
//   blank lines separate paragraphs
// Everything else is a paragraph line. Editing always happens on the raw
// text, so nothing is lossy.

type Chunk =
  | { kind: 'p'; lines: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[]; start: number };

function parse(text: string): Chunk[] {
  const chunks: Chunk[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    const last = chunks[chunks.length - 1];
    if (bullet) {
      if (last?.kind === 'ul') last.items.push(bullet[1]);
      else chunks.push({ kind: 'ul', items: [bullet[1]] });
    } else if (numbered) {
      if (last?.kind === 'ol') last.items.push(numbered[2]);
      else chunks.push({ kind: 'ol', items: [numbered[2]], start: Number(numbered[1]) });
    } else if (line.trim() === '') {
      chunks.push({ kind: 'p', lines: [] });
    } else {
      if (last?.kind === 'p') last.lines.push(line);
      else chunks.push({ kind: 'p', lines: [line] });
    }
  }
  return chunks.filter((c) => c.kind !== 'p' || c.lines.length > 0);
}

export function FormattedText({ text, style }: { text: string; style: CSSProperties }) {
  const chunks = parse(text);
  return (
    <div style={style} className="h-full w-full">
      {chunks.map((c, i) => (
        <Fragment key={i}>
          {c.kind === 'p' && (
            <p style={{ margin: 0, marginBottom: '0.55em' }}>
              {c.lines.map((l, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  {l}
                </Fragment>
              ))}
            </p>
          )}
          {c.kind === 'ul' && (
            <ul style={{ margin: 0, marginBottom: '0.55em', paddingLeft: '1.2em', listStyle: 'disc' }}>
              {c.items.map((it, j) => (
                <li key={j}>{it}</li>
              ))}
            </ul>
          )}
          {c.kind === 'ol' && (
            <ol
              start={c.start}
              style={{ margin: 0, marginBottom: '0.55em', paddingLeft: '1.4em', listStyle: 'decimal' }}
            >
              {c.items.map((it, j) => (
                <li key={j}>{it}</li>
              ))}
            </ol>
          )}
        </Fragment>
      ))}
    </div>
  );
}
