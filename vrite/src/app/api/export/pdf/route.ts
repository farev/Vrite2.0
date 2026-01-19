import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

export async function POST(request: NextRequest) {
  try {
    const { html, title, pageSize = 'letter' } = await request.json();

    if (!html) {
      return NextResponse.json({ error: 'HTML content is required' }, { status: 400 });
    }

    console.log('[PDF Export] Starting PDF generation for:', title);

    // Launch headless browser
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ],
    });

    const page = await browser.newPage();

    // Set page content with proper styling
    const styledHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${title || 'Document'}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              line-height: 1.6;
              color: #000;
              margin: 0;
              padding: 20px;
            }
            .document-content-editable {
              width: 100%;
              min-height: auto;
            }
            /* Hide any UI elements that might have been included */
            .toolbar, .ai-sidebar, .document-header, .menu-bar {
              display: none !important;
            }
            /* Ensure proper page breaks */
            .page-break {
              page-break-after: always;
            }
            /* Preserve formatting */
            b, strong { font-weight: bold; }
            i, em { font-style: italic; }
            u { text-decoration: underline; }
            h1 { font-size: 2em; font-weight: bold; margin: 0.67em 0; }
            h2 { font-size: 1.5em; font-weight: bold; margin: 0.83em 0; }
            h3 { font-size: 1.17em; font-weight: bold; margin: 1em 0; }
            p { margin: 1em 0; }
            ul, ol { margin: 1em 0; padding-left: 2em; }
            li { margin: 0.5em 0; }
            blockquote { margin: 1em 2em; padding-left: 1em; border-left: 4px solid #ccc; }
            code { font-family: monospace; background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
            pre { background: #f4f4f4; padding: 1em; border-radius: 3px; overflow-x: auto; }
            table { border-collapse: collapse; width: 100%; margin: 1em 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
          </style>
        </head>
        <body>
          ${html}
        </body>
      </html>
    `;

    await page.setContent(styledHtml, {
      waitUntil: 'networkidle0',
    });

    // Generate PDF
    const pdf = await page.pdf({
      format: pageSize === 'a4' ? 'A4' : 'Letter',
      printBackground: true,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in',
      },
      preferCSSPageSize: true,
    });

    await browser.close();

    console.log('[PDF Export] PDF generated successfully, size:', pdf.length, 'bytes');

    // Return PDF
    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${title || 'document'}.pdf"`,
      },
    });
  } catch (error) {
    console.error('[PDF Export] Error generating PDF:', error);
    return NextResponse.json(
      { error: 'Failed to export PDF' },
      { status: 500 }
    );
  }
}

