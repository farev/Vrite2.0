import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { html, title, pageSize = 'letter' } = await request.json();

    if (!html) {
      return NextResponse.json({ error: 'HTML content is required' }, { status: 400 });
    }

    // For PDF generation, we'll use a simpler approach without puppeteer
    // since it requires Chrome/Chromium which may not be available in all environments.
    // Instead, we'll return instructions to use the browser's print-to-PDF feature.
    
    // In a production environment, you would:
    // 1. Use puppeteer or playwright to render HTML to PDF
    // 2. Or use a service like PDFKit, jsPDF, or a cloud service
    
    // For now, return a simple response indicating the user should use browser print
    return NextResponse.json({
      message: 'PDF export via browser print',
      instruction: 'Use Ctrl+P or Cmd+P to print to PDF',
      html: html,
    });

  } catch (error) {
    console.error('PDF export error:', error);
    return NextResponse.json(
      { error: 'Failed to export PDF' },
      { status: 500 }
    );
  }
}

// Alternative implementation with puppeteer (commented out for now)
/*
import puppeteer from 'puppeteer';

export async function POST(request: NextRequest) {
  try {
    const { html, title, pageSize = 'letter' } = await request.json();

    if (!html) {
      return NextResponse.json({ error: 'HTML content is required' }, { status: 400 });
    }

    // Launch headless browser
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    
    // Set page content
    await page.setContent(html, {
      waitUntil: 'networkidle0',
    });

    // Generate PDF
    const pdf = await page.pdf({
      format: pageSize === 'a4' ? 'A4' : 'Letter',
      printBackground: true,
      margin: {
        top: '1in',
        right: '1in',
        bottom: '1in',
        left: '1in',
      },
    });

    await browser.close();

    // Return PDF
    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${title || 'document'}.pdf"`,
      },
    });
  } catch (error) {
    console.error('PDF export error:', error);
    return NextResponse.json(
      { error: 'Failed to export PDF' },
      { status: 500 }
    );
  }
}
*/

