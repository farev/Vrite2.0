/**
 * Parse markdown formatting from text and extract plain text + formatting info
 */

export interface ParsedText {
  text: string;           // Plain text without markdown syntax
  isBold: boolean;
  isItalic: boolean;
  headingLevel?: number;  // 1-3 for h1-h3
}

/**
 * Parse a single piece of text for inline markdown formatting
 * Handles: **bold**, *italic*, and combinations
 */
export function parseInlineMarkdown(text: string): ParsedText {
  let isBold = false;
  let isItalic = false;
  let plainText = text;

  // Check for bold + italic FIRST (***text*** or ___text___)
  // Must check this before bold/italic alone to avoid partial matches
  const boldItalicPattern = /^\*\*\*(.+?)\*\*\*$|^___(.+?)___$/;
  const boldItalicMatch = text.match(boldItalicPattern);
  if (boldItalicMatch) {
    isBold = true;
    isItalic = true;
    plainText = boldItalicMatch[1] || boldItalicMatch[2];
    return { text: plainText, isBold, isItalic };
  }

  // Check for bold (**text** or __text__)
  const boldPattern = /^\*\*(.+?)\*\*$|^__(.+?)__$/;
  const boldMatch = text.match(boldPattern);
  if (boldMatch) {
    isBold = true;
    plainText = boldMatch[1] || boldMatch[2];
    return { text: plainText, isBold, isItalic };
  }

  // Check for italic (*text* or _text_)
  const italicPattern = /^\*(.+?)\*$|^_(.+?)_$/;
  const italicMatch = text.match(italicPattern);
  if (italicMatch) {
    isItalic = true;
    plainText = italicMatch[1] || italicMatch[2];
    return { text: plainText, isBold, isItalic };
  }

  return {
    text: plainText,
    isBold,
    isItalic,
  };
}

/**
 * Parse heading markdown
 * Handles: # Heading 1, ## Heading 2, ### Heading 3
 */
export function parseHeading(text: string): ParsedText | null {
  const headingPattern = /^(#{1,3})\s+(.+)$/;
  const match = text.match(headingPattern);

  if (match) {
    const level = match[1].length as 1 | 2 | 3;
    const plainText = match[2];

    return {
      text: plainText,
      isBold: false,
      isItalic: false,
      headingLevel: level,
    };
  }

  return null;
}

/**
 * Parse markdown text and extract formatting
 * This is the main function to use for parsing diff text
 */
export function parseMarkdown(text: string): ParsedText {
  // First check if it's a heading
  const heading = parseHeading(text);
  if (heading) {
    return heading;
  }

  // Otherwise parse inline formatting
  return parseInlineMarkdown(text);
}

/**
 * Check if text contains markdown syntax
 */
export function hasMarkdownSyntax(text: string): boolean {
  return (
    /^\*\*.*\*\*$/.test(text) ||     // **bold**
    /^__.*__$/.test(text) ||         // __bold__
    /^\*[^*]+\*$/.test(text) ||      // *italic*
    /^_[^_]+_$/.test(text) ||        // _italic_
    /^\*\*\*.*\*\*\*$/.test(text) || // ***bold italic***
    /^___.*___$/.test(text) ||       // ___bold italic___
    /^#{1,3}\s+/.test(text)          // # headings
  );
}
