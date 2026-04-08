import { NextRequest, NextResponse } from 'next/server';
import chromium from '@sparticuz/chromium-min';
import puppeteer, { type Browser } from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

// ── Vercel serverless config ───────────────────────────────────────────────────
export const maxDuration = 60; // seconds — PDF generation can take up to ~15s
export const runtime = 'nodejs';

// ── Page size map ─────────────────────────────────────────────────────────────
const PAGE_SIZES: Record<string, { widthIn: number; heightIn: number }> = {
  letter:  { widthIn: 8.5,    heightIn: 11 },
  a4:      { widthIn: 8.268,  heightIn: 11.693 },
  legal:   { widthIn: 8.5,    heightIn: 14 },
  tabloid: { widthIn: 11,     heightIn: 17 },
};

// ── Tinos font (Times New Roman substitute) ────────────────────────────────────
// Embedded as base64 @font-face named 'Times New Roman' — overrides system font
// transparently on all OSes. Tinos is metrically identical to Times New Roman
// (SIL Open Font License). Files live in vrite/public/fonts/tinos/.
function loadFontBase64(filename: string): string {
  try {
    const fontPath = path.join(process.cwd(), 'public', 'fonts', 'tinos', filename);
    return fs.readFileSync(fontPath).toString('base64');
  } catch {
    return ''; // Graceful fallback: system Times New Roman or Georgia
  }
}

// Load at module scope so they're cached between invocations on warm Lambdas.
const fonts = {
  regular:    loadFontBase64('Tinos-Regular.ttf'),
  bold:       loadFontBase64('Tinos-Bold.ttf'),
  italic:     loadFontBase64('Tinos-Italic.ttf'),
  boldItalic: loadFontBase64('Tinos-BoldItalic.ttf'),
};

function buildFontFaces(): string {
  const decl = (b64: string, weight: string, style: string) =>
    b64
      ? `@font-face {
           font-family: 'Times New Roman';
           src: url(data:font/truetype;base64,${b64}) format('truetype');
           font-weight: ${weight}; font-style: ${style};
         }`
      : '';
  return [
    decl(fonts.regular,    'normal', 'normal'),
    decl(fonts.bold,       'bold',   'normal'),
    decl(fonts.italic,     'normal', 'italic'),
    decl(fonts.boldItalic, 'bold',   'italic'),
  ].join('\n');
}

// ── Font substitution (proprietary → open-source Google Fonts) ────────────────
// The Sparticuz Chromium ships with almost no system fonts. Proprietary fonts
// (Arial, Calibri, Georgia, etc.) are not available. We substitute font names
// in the HTML content BEFORE rendering so Chromium uses the Google Fonts
// equivalents loaded via <link> in the HTML template.
// Times New Roman is handled separately via embedded Tinos @font-face — no substitution needed.
const FONT_SUBSTITUTES: Record<string, string> = {
  'Arial':          'Arimo',           // Metrically identical (Ascender Corp / Google)
  'Calibri':        'Carlito',         // Metrically identical
  'Cambria':        'Caladea',         // Metrically identical
  'Georgia':        'Merriweather',    // Close serif approximation
  'Verdana':        'PT Sans',         // Humanist sans approximation
  'Trebuchet MS':   'Source Sans 3',   // Humanist sans approximation
  'Comic Sans MS':  'Patrick Hand',    // Similar informal rounded style
  'Impact':         'Anton',           // Similar condensed bold display
  'Lucida Console': 'Source Code Pro', // Excellent monospace substitute
};

// Google Fonts URL for all CDN-loaded substitutes
const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Arimo:ital,wght@0,400;0,700;1,400;1,700' +
  '&family=Carlito:ital,wght@0,400;0,700;1,400;1,700' +
  '&family=Caladea:ital,wght@0,400;0,700;1,400;1,700' +
  '&family=Merriweather:ital,wght@0,300;0,400;0,700;1,300;1,400;1,700' +
  '&family=PT+Sans:ital,wght@0,400;0,700;1,400;1,700' +
  '&family=Source+Sans+3:ital,wght@0,400;0,700;1,400;1,700' +
  '&family=Patrick+Hand' +
  '&family=Anton' +
  '&family=Source+Code+Pro:ital,wght@0,400;0,700;1,400;1,700' +
  '&display=swap';

function substituteFonts(html: string): string {
  let result = html;
  for (const [original, substitute] of Object.entries(FONT_SUBSTITUTES)) {
    // Matches: font-family: "Arial", font-family: Arial, font-family: 'Arial'
    result = result.replace(
      new RegExp(`font-family:\\s*["']?${original.replace(/\s+/g, '\\s+')}["']?`, 'gi'),
      `font-family: "${substitute}"`
    );
  }
  return result;
}

// ── KaTeX CSS ─────────────────────────────────────────────────────────────────
let katexCss = '';
try {
  katexCss = fs.readFileSync(
    path.join(process.cwd(), 'node_modules', 'katex', 'dist', 'katex.min.css'),
    'utf-8'
  );
} catch { /* Falls back to CDN link */ }

// ── Types ─────────────────────────────────────────────────────────────────────
interface HFItem {
  // Full rendered innerHTML from the Lexical hf-content-editable element.
  // Includes all inline styles (font-family, font-size, text-align, color, etc.)
  // so Puppeteer can render it pixel-for-pixel as it appears in the editor.
  html: string;
}

interface ExportPayload {
  html: string;
  title: string;
  pageSize: string;
  margins: { top: number; right: number; bottom: number; left: number };
  // Per-page header/footer items. headerItems[i] / footerItems[i] = page i+1.
  // Page numbers (if enabled) are already baked into each footerItem's HTML by the client.
  headerItems?: HFItem[];
  footerItems?: HFItem[];
}

type Margins = ExportPayload['margins'];

// ── CSS for Lexical header/footer theme classes ────────────────────────────────
// Applied in each mini-page render so class names like .hf-paragraph resolve.
const LEXICAL_HF_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: transparent;
    font-family: 'Times New Roman', 'Liberation Serif', Georgia, serif;
    font-size: 12pt; color: #1f2937;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .hf-editor-root, .hf-paragraph { margin: 0; line-height: 1.4; }
  .document-text-bold        { font-weight: bold; }
  .document-text-italic      { font-style: italic; }
  .document-text-underline   { text-decoration: underline; }
  .document-text-strikethrough { text-decoration: line-through; }
  .document-h1 { font-size: 18pt; font-weight: bold; margin: 0; }
  .document-h2 { font-size: 14pt; font-weight: bold; margin: 0; }
  .document-h3 { font-size: 12pt; font-weight: bold; margin: 0; }
  .document-link { color: #0066cc; text-decoration: underline; }
  span[style] { white-space: pre-wrap; }
`;

// ── Mini-PDF renderer for a single header or footer ────────────────────────────
// Renders the Lexical innerHTML in a tiny Puppeteer page (pageWidth × marginHeight)
// with the same padding/positioning used by the editor. Returns a raw PDF buffer
// that pdf-lib can embed as a vector XObject — preserving all text styling exactly.
//
// Coordinate mapping (pdf-lib uses bottom-left origin):
//   Header mini-PDF: drawn at y = (pageHeight - margins.top), height = margins.top
//     → padding-top = margins.top/2 places text at margins.top/2 from page top ✓
//   Footer mini-PDF: drawn at y = 0,                           height = margins.bottom
//     → padding-bottom = margins.bottom/2 places text at margins.bottom/2 from page bottom ✓
async function renderHFMiniPdf(
  browser: Browser,
  html: string,
  widthPt: number,
  heightPt: number,
  isHeader: boolean,
  margins: Margins,
  fontFaceBlock: string,
  googleFontsHtml: string,
): Promise<Buffer> {
  const miniPage = await browser.newPage();
  try {
    // Match the editor's vertical positioning:
    // header → padding-top: margins.top/2; footer → padding-bottom: margins.bottom/2
    const padPt = isHeader ? (margins.top / 2) : (margins.bottom / 2);
    const vertStyle = isHeader
      ? `padding-top:${padPt.toFixed(2)}pt;`
      : `padding-bottom:${padPt.toFixed(2)}pt;`;

    const doc = `<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  ${googleFontsHtml}
  <style>
    ${fontFaceBlock}
    ${LEXICAL_HF_CSS}
    .hf-wrapper {
      width: ${widthPt}pt; height: ${heightPt}pt;
      box-sizing: border-box;
      padding-left: ${margins.left}pt; padding-right: ${margins.right}pt;
      ${vertStyle}
      display: flex; flex-direction: column;
      ${isHeader ? 'justify-content: flex-start;' : 'justify-content: flex-end;'}
    }
  </style>
</head><body><div class="hf-wrapper">${html}</div></body></html>`;

    // Viewport in CSS px (96 dpi) — must match the PDF dimensions exactly
    await miniPage.setViewport({
      width:  Math.round(widthPt  * 96 / 72),
      height: Math.round(heightPt * 96 / 72),
      deviceScaleFactor: 1,
    });
    await miniPage.setContent(doc, { waitUntil: 'networkidle0', timeout: 15000 });
    await miniPage.evaluateHandle('document.fonts.ready');

    const pdfBuf = await miniPage.pdf({
      width:  `${(widthPt  / 72).toFixed(4)}in`,
      height: `${(heightPt / 72).toFixed(4)}in`,
      printBackground: false,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      displayHeaderFooter: false,
      preferCSSPageSize: false,
    });
    return Buffer.from(pdfBuf);
  } finally {
    await miniPage.close();
  }
}

// ── HTML document builder ─────────────────────────────────────────────────────
function buildHtmlDocument(payload: ExportPayload, useServerFonts: boolean): string {
  const katexBlock = katexCss
    ? `<style>${katexCss}</style>`
    : `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">`;

  // On Vercel (Linux): embed Tinos + load Google Fonts substitutes — no system fonts available.
  // On local dev (macOS): system Chrome has the real fonts; skip overrides so PDF matches browser.
  const fontLinks = useServerFonts
    ? `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${GOOGLE_FONTS_URL}" rel="stylesheet">`
    : '';
  const fontFaceBlock = useServerFonts ? buildFontFaces() : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(payload.title || 'Document')}</title>
  ${fontLinks}
  ${katexBlock}
  <style>
    ${fontFaceBlock}

    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    html, body { margin: 0; padding: 0; background: white; }
    body {
      font-family: 'Times New Roman', 'Liberation Serif', Georgia, serif;
      font-size: 12pt;
      line-height: 1.4;
      color: #000;
    }

    /* Page break marker (replaces .page-break-container from the editor) */
    .pdf-page-break { break-after: page; height: 0; margin: 0; padding: 0; display: block; }

    /* ── Lexical theme classes — must match globals.css exactly ── */
    .document-paragraph { margin: 0 0 12pt 0; }
    .document-h1 { font-size: 18pt; font-weight: bold; margin: 18pt 0 12pt 0; }
    .document-h2 { font-size: 14pt; font-weight: bold; margin: 14pt 0 10pt 0; }
    .document-h3 { font-size: 12pt; font-weight: bold; margin: 12pt 0 8pt 0; }
    .document-text-bold        { font-weight: bold; }
    .document-text-italic      { font-style: italic; }
    .document-text-underline   { text-decoration: underline; }
    .document-text-strikethrough { text-decoration: line-through; }
    .document-text-code {
      font-family: 'Courier New', Courier, monospace;
      background: #f4f4f4; padding: 1px 3px; border-radius: 2px; font-size: 11pt;
    }
    .document-list-ul { list-style-type: disc;    margin: 0 0 12pt 0; padding-left: 24pt; }
    .document-list-ol { list-style-type: decimal; margin: 0 0 12pt 0; padding-left: 24pt; }
    .document-listitem { margin: 0 0 4pt 0; }
    .document-nested-listitem { list-style-type: circle; }
    .document-link { color: #0066cc; text-decoration: underline; }

    /* Tables */
    table { border-collapse: collapse; width: 100%; margin: 0 0 12pt 0; }
    th, td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; vertical-align: top; }
    th { background-color: #f9fafb; font-weight: 600; }
    td p, th p { margin: 0; }

    /* Code blocks */
    pre {
      font-family: 'Courier New', Courier, monospace; font-size: 10pt;
      background: #f4f4f4; padding: 8pt; border-radius: 4px;
      white-space: pre-wrap; word-break: break-word; margin: 0 0 12pt 0;
    }

    /* Blockquote */
    blockquote {
      margin: 0 0 12pt 0; padding-left: 16pt;
      border-left: 3px solid #d1d5db; color: #374151;
    }

    /* Images */
    img { max-width: 100%; break-inside: avoid; }
    .image-container { display: flex; flex-direction: column; align-items: center; margin: 0 0 12pt 0; }
    .image-container.align-left  { align-items: flex-start; }
    .image-container.align-right { align-items: flex-end; }
    .image-caption { font-size: 10pt; color: #6b7280; margin-top: 4pt; text-align: center; }

    /* HF editor classes — hidden in body content (rendered in header/footer templates instead) */
    .hf-editor-root { display: none; }
    .hf-paragraph { margin: 0; }

    /* Hide editor-only artifacts */
    .autocomplete-ghost-text { display: none !important; }
    .diff-word-actions, .diff-inline-actions { display: none !important; }
    .equation-edit-btn { display: none !important; }

    /* Remove top margin from first element */
    body > *:first-child { margin-top: 0 !important; }
  </style>
</head>
<body>${payload.html}</body>
</html>`;
}

// ── Route handler ──────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  let browser;
  try {
    const payload = (await request.json()) as ExportPayload;
    if (!payload.html) {
      return NextResponse.json({ error: 'HTML content is required' }, { status: 400 });
    }

    const size = PAGE_SIZES[payload.pageSize] ?? PAGE_SIZES.letter;
    const { margins } = payload;
    const toIn = (pt: number) => (pt / 72).toFixed(4) + 'in';

    // Local dev (macOS/Windows): use system Chrome — Sparticuz binary is Linux-only.
    // Production (Vercel/Lambda): use @sparticuz/chromium-min.
    const isVercel = !!process.env.VERCEL || process.env.NODE_ENV === 'production';

    // On Vercel (Linux): substitute proprietary font names with Google Fonts equivalents
    // (Sparticuz Chromium has no system fonts). On local dev macOS: system Chrome has the
    // real fonts — skip substitution so PDF fonts match the browser exactly.
    const subst = (s: string) => isVercel ? substituteFonts(s) : s;
    const rawHtml = subst(payload.html);
    const headerItems = (payload.headerItems ?? []).map((i) => ({ html: subst(i.html) }));
    const footerItems = (payload.footerItems ?? []).map((i) => ({ html: subst(i.html) }));

    const htmlDoc = buildHtmlDocument({ ...payload, html: rawHtml }, isVercel);

    // Font assets needed in mini-page renders (only on Vercel; local Chrome has system fonts).
    const fontFaceBlock   = isVercel ? buildFontFaces() : '';
    const googleFontsHtml = isVercel
      ? `<link rel="preconnect" href="https://fonts.googleapis.com">` +
        `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
        `<link href="${GOOGLE_FONTS_URL}" rel="stylesheet">`
      : '';

    const executablePath = isVercel
      ? await chromium.executablePath(
          'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar'
        )
      : process.env.CHROME_PATH ||
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

    browser = await puppeteer.launch({
      args: isVercel ? chromium.args : ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath,
      headless: true,
    });

    // ── 1. Render main content ────────────────────────────────────────────────
    const contentPage = await browser.newPage();
    // CRITICAL: Set viewport to exact page width in CSS pixels (96 dpi).
    // Without this, Chromium uses its default 800px viewport, causing different
    // line breaks and pagination than the editor.
    await contentPage.setViewport({
      width:  Math.round(size.widthIn * 96),
      height: Math.round(size.heightIn * 96),
      deviceScaleFactor: 1,
    });
    // waitUntil: 'networkidle0' ensures Google Fonts CDN CSS loads.
    await contentPage.setContent(htmlDoc, { waitUntil: 'networkidle0', timeout: 30000 });
    await contentPage.evaluateHandle('document.fonts.ready');
    const mainPdfBuf = Buffer.from(await contentPage.pdf({
      width:  `${size.widthIn}in`,
      height: `${size.heightIn}in`,
      printBackground: true,
      margin: {
        top:    toIn(margins.top),
        right:  toIn(margins.right),
        bottom: toIn(margins.bottom),
        left:   toIn(margins.left),
      },
      displayHeaderFooter: false,
      preferCSSPageSize: false,
    }));
    await contentPage.close();

    // ── 2. Render per-page header/footer mini PDFs (same browser, vector quality) ──
    // Each HFItem's HTML is the full Lexical innerHTML — all inline styles preserved.
    // Deduplicate by HTML string so identical pages only render once.
    const hasAnyHF = headerItems.some((i) => i.html) || footerItems.some((i) => i.html);
    let pdfBuffer = mainPdfBuf;

    if (hasAnyHF) {
      const widthPt  = size.widthIn  * 72;
      const hHgt     = margins.top;      // header mini-PDF height = top margin
      const fHgt     = margins.bottom;   // footer mini-PDF height = bottom margin

      // Cache: html string → mini PDF buffer (avoid redundant Puppeteer renders)
      const miniCache = new Map<string, Buffer>();
      const getMini = async (html: string, isHeader: boolean): Promise<Buffer | null> => {
        if (!html) return null;
        const key = `${isHeader ? 'h' : 'f'}:${html}`;
        if (!miniCache.has(key)) {
          miniCache.set(key, await renderHFMiniPdf(
            browser!,
            html,
            widthPt,
            isHeader ? hHgt : fHgt,
            isHeader,
            margins,
            fontFaceBlock,
            googleFontsHtml,
          ));
        }
        return miniCache.get(key)!;
      };

      // ── 3. Overlay mini PDFs onto the main PDF using pdf-lib ─────────────────
      // pdf-lib's embedPages() embeds a page from another PDF as a vector XObject,
      // preserving all text, fonts, and styling at any zoom level.
      //
      // Coordinate system (pdf-lib uses bottom-left origin, Y increases upward):
      //   Header: draw at x=0, y=(pageHeight - margins.top), w=pageWidth, h=margins.top
      //   Footer: draw at x=0, y=0,                          w=pageWidth, h=margins.bottom
      const pdfDoc = await PDFDocument.load(mainPdfBuf);
      const pdfPages = pdfDoc.getPages();

      for (let i = 0; i < pdfPages.length; i++) {
        const pdfPage = pdfPages[i];
        const { width: pgW, height: pgH } = pdfPage.getSize();

        const headerHtml = (headerItems[i] ?? headerItems[headerItems.length - 1])?.html ?? '';
        const footerHtml = (footerItems[i] ?? footerItems[footerItems.length - 1])?.html ?? '';

        const [hBuf, fBuf] = await Promise.all([
          getMini(headerHtml, true),
          getMini(footerHtml, false),
        ]);

        if (hBuf) {
          const hDoc = await PDFDocument.load(hBuf);
          const [hEmbed] = await pdfDoc.embedPages([hDoc.getPage(0)]);
          pdfPage.drawPage(hEmbed, { x: 0, y: pgH - hHgt, width: pgW, height: hHgt });
        }
        if (fBuf) {
          const fDoc = await PDFDocument.load(fBuf);
          const [fEmbed] = await pdfDoc.embedPages([fDoc.getPage(0)]);
          pdfPage.drawPage(fEmbed, { x: 0, y: 0, width: pgW, height: fHgt });
        }
      }

      pdfBuffer = Buffer.from(await pdfDoc.save());
    }

    await browser.close();
    browser = undefined;

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${sanitizeFilename(payload.title)}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[PDF Export] Error:', error);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

function sanitizeFilename(name: string): string {
  return (name || 'document')
    .replace(/[^\w\s\-_.]/g, '').trim().replace(/\s+/g, '_').slice(0, 100) || 'document';
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
