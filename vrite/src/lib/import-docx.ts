/**
 * Client-side DOCX → HTML conversion using mammoth.js
 */

export interface ImportResult {
  html: string;
  title: string;
  warnings: string[];
}

export async function importDocx(file: File): Promise<ImportResult> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();

  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    { convertImage: mammoth.images.dataUri }
  );

  const html = result.value;
  const warnings = result.messages.map((m: { message: string }) => m.message);

  // Extract title from first <h1> or first <p>
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const firstHeading = doc.querySelector('h1, h2, h3');
  const firstPara = doc.querySelector('p');
  const titleEl = firstHeading || firstPara;
  const rawTitle = titleEl?.textContent?.trim() || '';
  const title = rawTitle.slice(0, 100) || file.name.replace(/\.docx$/i, '');

  return { html, title, warnings };
}
