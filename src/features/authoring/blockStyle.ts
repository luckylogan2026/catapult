import type { Block } from '../../domain/types';

// Resolves a block text style to CSS. Font sizes are canvas units, which
// equal CSS pixels inside the scaled page, so no conversion happens here.
export function textStyleCss(style: Block['style']): React.CSSProperties {
  const s = style ?? {};
  return {
    fontFamily: s.fontFamily === 'heading' ? 'var(--tc-font-heading)' : 'var(--tc-font-body)',
    fontSize: `${s.fontSize ?? 34}px`,
    fontWeight: s.weight ?? 400,
    fontStyle: s.italic ? 'italic' : 'normal',
    textAlign: (s.align ?? 'left') as React.CSSProperties['textAlign'],
    lineHeight: s.lineHeight ?? 1.35,
    textShadow: s.shadow ? '0 2px 14px rgba(0,0,0,0.65), 0 1px 3px rgba(0,0,0,0.5)' : undefined,
    color:
      s.color === 'muted'
        ? 'var(--tc-text-muted)'
        : s.color && s.color !== 'text'
          ? s.color
          : 'var(--tc-text)',
  };
}
