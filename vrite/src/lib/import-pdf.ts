/**
 * Client-side PDF → HTML conversion using pdfjs-dist
 * Extracts text with font metadata, links, lists, tables, and images.
 */

export interface ImportResult {
  html: string;
  title: string;
  warnings: string[];
}

type TextItem = { str: string; fontSize: number; fontName: string; x: number; y: number; width: number };

interface TextLine {
  y: number;
  items: TextItem[];
}

interface LinkAnnotation {
  subtype: string;
  url?: string;
  rect: [number, number, number, number];
}

function statisticalMode(values: number[]): number {
  const freq: Record<number, number> = {};
  let maxCount = 0;
  let mode = values[0] ?? 12;
  for (const v of values) {
    const rounded = Math.round(v * 2) / 2; // round to nearest 0.5
    freq[rounded] = (freq[rounded] ?? 0) + 1;
    if (freq[rounded] > maxCount) {
      maxCount = freq[rounded];
      mode = rounded;
    }
  }
  return mode;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const BULLET_RE = /^[\u2022\u00b7\u2013\u2014\-\u25e6]\s+/;
const ORDERED_RE = /^\s*(?:\d+|[a-z])[.)]\s/i;

type ListType = 'ul' | 'ol';

function wrapLists(lines: string[]): string {
  const out: string[] = [];
  let currentListType: ListType | null = null;
  const listBuffer: string[] = [];

  function flushList() {
    if (listBuffer.length === 0) return;
    out.push(`<${currentListType!}>`);
    for (const item of listBuffer) {
      out.push(`<li>${item}</li>`);
    }
    out.push(`</${currentListType!}>`);
    listBuffer.length = 0;
    currentListType = null;
  }

  for (const line of lines) {
    if (BULLET_RE.test(line)) {
      const text = line.replace(BULLET_RE, '');
      if (currentListType !== 'ul') {
        flushList();
        currentListType = 'ul';
      }
      listBuffer.push(text);
    } else if (ORDERED_RE.test(line)) {
      const text = line.replace(ORDERED_RE, '');
      if (currentListType !== 'ol') {
        flushList();
        currentListType = 'ol';
      }
      listBuffer.push(text);
    } else {
      flushList();
      out.push(line);
    }
  }
  flushList();
  return out.join('\n');
}

export async function importPdf(file: File): Promise<ImportResult> {
  // Dynamic import to avoid SSR / bundle bloat
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const warnings: string[] = [];
  const pageHtmlParts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });

    // Run text and annotation extraction in parallel
    const [textContent, annotations] = await Promise.all([
      page.getTextContent(),
      page.getAnnotations(),
    ]);

    const linkAnnotations = (annotations as LinkAnnotation[]).filter(
      (a) => a.subtype === 'Link' && a.url
    );

    // Collect all text items with font metadata
    const allItems: TextItem[] = [];

    for (const item of textContent.items as Array<{
      str: string;
      transform: number[];
      fontName: string;
      width: number;
    }>) {
      if (!item.str.trim()) continue;
      const fontSize = Math.abs(item.transform[3]);
      const x = item.transform[4];
      // PDF y-axis is bottom-up; flip for top-down ordering
      const y = viewport.height - item.transform[5];
      allItems.push({ str: item.str, fontSize, fontName: item.fontName, x, y, width: item.width });
    }

    if (allItems.length === 0) continue;

    // Determine body font size as the statistical mode
    const bodyFontSize = statisticalMode(allItems.map((i) => i.fontSize));

    // Group items into lines by Y proximity (±3pt)
    const lineMap = new Map<number, typeof allItems>();
    for (const item of allItems) {
      let foundKey: number | null = null;
      for (const key of lineMap.keys()) {
        if (Math.abs(item.y - key) <= 3) {
          foundKey = key;
          break;
        }
      }
      if (foundKey !== null) {
        lineMap.get(foundKey)!.push(item);
      } else {
        lineMap.set(item.y, [item]);
      }
    }

    // Sort lines top→bottom
    const sortedLines: TextLine[] = Array.from(lineMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([y, items]) => ({
        y,
        items: items.sort((a, b) => a.x - b.x),
      }));

    // Detect table rows: lines with ≥3 items clustering in ≥2 consistent X columns
    const xColumnThreshold = 10;
    function detectColumns(items: TextItem[]): number[] | null {
      if (items.length < 2) return null;
      const xs = items.map((i) => i.x).sort((a, b) => a - b);
      const clusters: number[] = [xs[0]];
      for (let i = 1; i < xs.length; i++) {
        if (xs[i] - clusters[clusters.length - 1] > xColumnThreshold) {
          clusters.push(xs[i]);
        }
      }
      return clusters.length >= 2 ? clusters : null;
    }

    // Group consecutive lines into table candidates
    const lineHtmlParts: string[] = [];
    let tableBuffer: TextLine[] = [];
    let tableColumns: number[] | null = null;

    function flushTable() {
      if (tableBuffer.length === 0) return;
      lineHtmlParts.push('<table>');
      for (const tLine of tableBuffer) {
        lineHtmlParts.push('<tr>');
        // assign each item to the closest column
        const cols = tableColumns!;
        const cells: string[] = Array(cols.length).fill('');
        for (const item of tLine.items) {
          let bestCol = 0;
          let bestDist = Math.abs(item.x - cols[0]);
          for (let c = 1; c < cols.length; c++) {
            const dist = Math.abs(item.x - cols[c]);
            if (dist < bestDist) {
              bestDist = dist;
              bestCol = c;
            }
          }
          cells[bestCol] += escapeHtml(item.str);
        }
        for (const cell of cells) {
          lineHtmlParts.push(`<td>${cell}</td>`);
        }
        lineHtmlParts.push('</tr>');
      }
      lineHtmlParts.push('</table>');
      tableBuffer = [];
      tableColumns = null;
    }

    function applyLinkToText(text: string, itemX: number, itemY: number, itemWidth: number): string {
      const pageH = viewport.height;
      // PDF rect: [x1, y1, x2, y2] in PDF coords (y from bottom)
      for (const link of linkAnnotations) {
        const [lx1, ly1, lx2, ly2] = link.rect;
        const topY = pageH - ly2;
        const bottomY = pageH - ly1;
        const overlapX = itemX >= lx1 - 2 && itemX <= lx2 + 2;
        const overlapY = itemY >= topY - 3 && itemY <= bottomY + 3;
        if (overlapX && overlapY) {
          return `<a href="${escapeHtml(link.url!)}">${escapeHtml(text)}</a>`;
        }
      }
      return escapeHtml(text);
    }

    for (const line of sortedLines) {
      const cols = detectColumns(line.items);
      if (cols && line.items.length >= 2) {
        // Potential table row
        if (tableColumns === null) {
          tableColumns = cols;
          tableBuffer.push(line);
        } else {
          // Check if columns roughly align with existing table
          const colsMatch =
            cols.length === tableColumns.length &&
            cols.every((c, i) => Math.abs(c - tableColumns![i]) <= xColumnThreshold * 2);
          if (colsMatch) {
            tableBuffer.push(line);
          } else {
            flushTable();
            tableColumns = cols;
            tableBuffer.push(line);
          }
        }
        continue;
      }

      // Not a table row — flush any pending table
      flushTable();

      // Build text spans
      const lineText = line.items.map((item) => {
        const ratio = item.fontSize / bodyFontSize;
        const isBold = /bold/i.test(item.fontName);
        const isItalic = /italic|oblique/i.test(item.fontName);
        let text = applyLinkToText(item.str, item.x, item.y, item.width);
        if (isBold) text = `<strong>${text}</strong>`;
        if (isItalic) text = `<em>${text}</em>`;
        return { text, ratio };
      });

      const avgRatio =
        lineText.reduce((sum, t) => sum + t.ratio, 0) / lineText.length;
      const combinedText = lineText.map((t) => t.text).join(' ').trim();
      if (!combinedText) continue;

      let tag: string;
      if (avgRatio >= 1.8) tag = 'h1';
      else if (avgRatio >= 1.4) tag = 'h2';
      else if (avgRatio >= 1.15) tag = 'h3';
      else tag = 'p';

      lineHtmlParts.push(`<${tag}>${combinedText}</${tag}>`);
    }

    flushTable();

    // Handle images via canvas
    try {
      const opList = await page.getOperatorList();
      const OPS = pdfjsLib.OPS;
      const imageOps: Array<{ transform: number[] }> = [];

      for (let i = 0; i < opList.fnArray.length; i++) {
        if (opList.fnArray[i] === OPS.paintImageXObject) {
          // The args contain the image name; the transform is set by the current CTM
          // We look for save/transform/paintImage triplets
          // Collect transform from preceding setTransform op if available
          const args = opList.argsArray[i];
          if (args && args.length >= 1) {
            // Find the most recent cm (setTransform) before this op
            let transform: number[] | null = null;
            for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
              if (opList.fnArray[j] === OPS.transform) {
                transform = opList.argsArray[j] as number[];
                break;
              }
            }
            if (transform) {
              imageOps.push({ transform });
            }
          }
        }
      }

      if (imageOps.length > 0) {
        const scale = 1.5;
        const scaledViewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        const ctx = canvas.getContext('2d')!;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.render({ canvasContext: ctx, canvas, viewport: scaledViewport } as any).promise;

        for (const op of imageOps) {
          const [a, b, c, d, e, f] = op.transform;
          // Width and height in user space
          const w = Math.sqrt(a * a + b * b);
          const h = Math.sqrt(c * c + d * d);
          // Position (PDF y from bottom, flip for canvas)
          const imgX = Math.round(e * scale);
          const imgY = Math.round((viewport.height - f) * scale);
          const imgW = Math.round(w * scale);
          const imgH = Math.round(h * scale);

          if (imgW < 10 || imgH < 10) continue; // skip tiny decorative images

          const subCanvas = document.createElement('canvas');
          subCanvas.width = imgW;
          subCanvas.height = imgH;
          const subCtx = subCanvas.getContext('2d')!;
          subCtx.drawImage(canvas, imgX, imgY, imgW, imgH, 0, 0, imgW, imgH);
          const dataUrl = subCanvas.toDataURL('image/jpeg', 0.8);
          lineHtmlParts.push(`<p><img src="${dataUrl}" style="max-width:100%;" /></p>`);
        }
      }
    } catch {
      // Image extraction is best-effort; skip on error
      warnings.push(`Page ${pageNum}: could not extract images`);
    }

    pageHtmlParts.push(wrapLists(lineHtmlParts));
  }

  const html = pageHtmlParts.join('\n');

  // Extract title from first heading or paragraph
  const parser = new DOMParser();
  const domDoc = parser.parseFromString(html, 'text/html');
  const titleEl = domDoc.querySelector('h1, h2, h3, p');
  const rawTitle = titleEl?.textContent?.trim() || '';
  const title = rawTitle.slice(0, 100) || file.name.replace(/\.pdf$/i, '');

  return { html, title, warnings };
}
