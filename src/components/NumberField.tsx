import { useState } from 'react';

// A number input that can actually be edited: a controlled input that
// re-parses every keystroke snaps back the moment the field is cleared,
// so the draft lives locally. In-range values commit as you type;
// out-of-range or empty drafts commit clamped on blur.
export function NumberField({
  value,
  min,
  max,
  step,
  onCommit,
  className,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (n: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (raw: string) => {
    const n = Number(raw);
    if (raw !== '' && Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, n)));
  };
  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft ?? String(value)}
      onChange={(ev) => {
        setDraft(ev.target.value);
        const n = Number(ev.target.value);
        if (ev.target.value !== '' && Number.isFinite(n) && n >= min && n <= max) onCommit(n);
      }}
      onBlur={() => {
        if (draft !== null) commit(draft);
        setDraft(null);
      }}
      className={className}
    />
  );
}
