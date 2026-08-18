import { createContext } from 'react';

// True while rendering pages for PDF rasterization. Media components
// render video as its poster frame with a play glyph, because a video
// element cannot be rasterized.
export const PdfModeContext = createContext(false);
