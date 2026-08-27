/**
 * Catalog of webfonts bundled with the app (SIL OFL, served as static assets
 * from /fonts/*.ttf — see public/fonts/ and backend/app/fonts/, which hold
 * identical copies for the client and server paths respectively).
 *
 * Beyond the 14 universal PDF Base-14 fonts (Helvetica/Times/Courier), a PDF
 * can only render text in a font it actually embeds — there's no equivalent
 * of a browser downloading a webfont on demand. These 8 families are shipped
 * with the app itself so "pick a nicer font" doesn't depend on what's already
 * embedded in the PDF being edited.
 */

export type BundledFontFamily =
  | 'roboto'
  | 'open-sans'
  | 'lato'
  | 'source-serif-4'
  | 'merriweather'
  | 'pt-serif'
  | 'jetbrains-mono'
  | 'ibm-plex-mono';

export type FontStyleKey = 'Regular' | 'Bold' | 'Italic' | 'BoldItalic';

interface BundledFontDef {
  label: string;
  category: 'sans' | 'serif' | 'mono';
  /** File-name stem, e.g. "Roboto" -> Roboto-Regular.ttf, Roboto-Bold.ttf, ... */
  stem: string;
}

export const BUNDLED_FONTS: Record<BundledFontFamily, BundledFontDef> = {
  roboto: { label: 'Roboto', category: 'sans', stem: 'Roboto' },
  'open-sans': { label: 'Open Sans', category: 'sans', stem: 'OpenSans' },
  lato: { label: 'Lato', category: 'sans', stem: 'Lato' },
  'source-serif-4': { label: 'Source Serif', category: 'serif', stem: 'SourceSerif4' },
  merriweather: { label: 'Merriweather', category: 'serif', stem: 'Merriweather' },
  'pt-serif': { label: 'PT Serif', category: 'serif', stem: 'PTSerif' },
  'jetbrains-mono': { label: 'JetBrains Mono', category: 'mono', stem: 'JetBrainsMono' },
  'ibm-plex-mono': { label: 'IBM Plex Mono', category: 'mono', stem: 'IBMPlexMono' },
};

export function bundledFontFileName(
  family: BundledFontFamily,
  bold: boolean,
  italic: boolean,
): string {
  const style: FontStyleKey =
    bold && italic ? 'BoldItalic' : bold ? 'Bold' : italic ? 'Italic' : 'Regular';
  return `${BUNDLED_FONTS[family].stem}-${style}.ttf`;
}

export function isBundledFontFamily(value: string): value is BundledFontFamily {
  return value in BUNDLED_FONTS;
}
