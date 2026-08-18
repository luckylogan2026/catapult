import { useEffect, useRef, useState } from 'react';
import { strings } from '../../config';
import { textStyleCss } from './blockStyle';
import { FormattedText } from './FormattedText';
import type { Block } from '../../domain/types';

// Text display with in-place editing. Single click selects the block,
// a second click (or Enter) opens the editor, blur or Escape commits.
export function TextBlockView({
  block,
  placeholder,
  editing,
  onCommit,
  onStartEdit,
  selected,
}: {
  block: Block;
  placeholder?: string;
  editing: boolean;
  selected: boolean;
  onStartEdit: () => void;
  onCommit: (text: string) => void;
}) {
  const [draft, setDraft] = useState(block.text ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(block.text ?? '');
      requestAnimationFrame(() => {
        ref.current?.focus();
        ref.current?.select();
      });
    }
  }, [editing, block.text]);

  const css = textStyleCss(block.style);

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCommit(draft);
          }
          e.stopPropagation();
        }}
        className="h-full w-full resize-none bg-transparent outline-none"
        style={css}
      />
    );
  }

  const empty = !(block.text ?? '').trim();
  if (empty) {
    return (
      <div
        className="h-full w-full whitespace-pre-wrap"
        style={{ ...css, opacity: 0.35, cursor: 'text' }}
        onClick={(e) => {
          if (selected) {
            e.stopPropagation();
            onStartEdit();
          }
        }}
      >
        {placeholder ?? strings.editor.textPlaceholder}
      </div>
    );
  }
  return (
    <div
      className="h-full w-full"
      style={{ cursor: 'text' }}
      onClick={(e) => {
        if (selected) {
          e.stopPropagation();
          onStartEdit();
        }
      }}
    >
      <FormattedText text={block.text ?? ''} style={css} />
    </div>
  );
}
