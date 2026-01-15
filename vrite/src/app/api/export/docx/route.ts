import { NextRequest, NextResponse } from 'next/server';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';

export async function POST(request: NextRequest) {
  try {
    const { html, title } = await request.json();

    if (!html) {
      return NextResponse.json({ error: 'HTML content is required' }, { status: 400 });
    }

    // Parse HTML and convert to DOCX structure
    const paragraphs = htmlToDocxParagraphs(html);

    // Create document
    const doc = new Document({
      sections: [{
        properties: {},
        children: paragraphs,
      }],
    });

    // Generate DOCX buffer
    const buffer = await Packer.toBuffer(doc);

    // Return as downloadable file
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${title || 'document'}.docx"`,
      },
    });
  } catch (error) {
    console.error('DOCX export error:', error);
    return NextResponse.json(
      { error: 'Failed to export DOCX' },
      { status: 500 }
    );
  }
}

/**
 * Convert HTML to DOCX paragraphs
 * This is a simplified converter - a production version would need more sophisticated parsing
 */
function htmlToDocxParagraphs(html: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  
  // Simple HTML parsing (in production, use a proper HTML parser)
  const lines = html.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines
    if (!trimmed) continue;
    
    // Check for headings
    if (trimmed.startsWith('<h1>')) {
      const text = trimmed.replace(/<\/?h1>/g, '');
      paragraphs.push(
        new Paragraph({
          text: text,
          heading: HeadingLevel.HEADING_1,
        })
      );
      continue;
    }
    
    if (trimmed.startsWith('<h2>')) {
      const text = trimmed.replace(/<\/?h2>/g, '');
      paragraphs.push(
        new Paragraph({
          text: text,
          heading: HeadingLevel.HEADING_2,
        })
      );
      continue;
    }
    
    if (trimmed.startsWith('<h3>')) {
      const text = trimmed.replace(/<\/?h3>/g, '');
      paragraphs.push(
        new Paragraph({
          text: text,
          heading: HeadingLevel.HEADING_3,
        })
      );
      continue;
    }
    
    // Parse paragraph with inline formatting
    if (trimmed.startsWith('<p>')) {
      const content = trimmed.replace(/<\/?p>/g, '');
      const runs = parseInlineFormatting(content);
      paragraphs.push(new Paragraph({ children: runs }));
      continue;
    }
    
    // Default: plain text paragraph
    const cleanText = trimmed.replace(/<[^>]+>/g, '');
    if (cleanText) {
      paragraphs.push(new Paragraph({ text: cleanText }));
    }
  }
  
  return paragraphs;
}

/**
 * Parse inline formatting (bold, italic, underline, etc.)
 */
function parseInlineFormatting(html: string): TextRun[] {
  const runs: TextRun[] = [];
  
  // Simple regex-based parsing (production would use proper HTML parser)
  const segments = html.split(/(<[^>]+>)/);
  
  let currentBold = false;
  let currentItalic = false;
  let currentUnderline = false;
  
  for (const segment of segments) {
    if (segment === '<strong>' || segment === '<b>') {
      currentBold = true;
    } else if (segment === '</strong>' || segment === '</b>') {
      currentBold = false;
    } else if (segment === '<em>' || segment === '<i>') {
      currentItalic = true;
    } else if (segment === '</em>' || segment === '</i>') {
      currentItalic = false;
    } else if (segment === '<u>') {
      currentUnderline = true;
    } else if (segment === '</u>') {
      currentUnderline = false;
    } else if (segment && !segment.startsWith('<')) {
      // Text content
      runs.push(
        new TextRun({
          text: segment,
          bold: currentBold,
          italics: currentItalic,
          underline: currentUnderline ? {} : undefined,
        })
      );
    }
  }
  
  return runs.length > 0 ? runs : [new TextRun({ text: html.replace(/<[^>]+>/g, '') })];
}

