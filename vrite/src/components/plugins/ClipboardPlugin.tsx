'use client';

import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  PASTE_COMMAND,
  $createParagraphNode,
  $createTextNode,
} from 'lexical';
import { $generateNodesFromDOM } from '@lexical/html';
import {
  $createHeadingNode,
  $createQuoteNode,
  HeadingTagType,
} from '@lexical/rich-text';
import {
  $createListNode,
  $createListItemNode,
  ListType,
} from '@lexical/list';
import { $createLinkNode } from '@lexical/link';
import { INSERT_IMAGE_COMMAND } from './ImagePlugin';
import { compressImageToBase64 } from '../nodes/ImageNode';

/**
 * ClipboardPlugin - Handles paste events to preserve formatting
 * while sanitizing and normalizing content from external sources.
 */
export default function ClipboardPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        // Check for image data in clipboard (e.g., screenshot paste)
        const items = clipboardData.items;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) {
              compressImageToBase64(file)
                .then(({ src, width, height }) => {
                  editor.dispatchCommand(INSERT_IMAGE_COMMAND, { src, width, height });
                })
                .catch((err) => {
                  console.error('Failed to paste image:', err);
                });
            }
            return true;
          }
        }

        // Try to get HTML content first (preserves formatting)
        const htmlContent = clipboardData.getData('text/html');
        
        if (htmlContent) {
          event.preventDefault();
          
          editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;

            // Parse HTML and sanitize
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlContent, 'text/html');
            
            // Remove unwanted elements and attributes
            sanitizeDOM(doc);
            
            // Generate Lexical nodes from sanitized DOM
            const nodes = $generateNodesFromDOM(editor, doc);
            
            // Insert nodes at selection
            if (nodes.length > 0) {
              selection.insertNodes(nodes);
            }
          });
          
          return true;
        }

        // Fallback to plain text (default behavior)
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );
  }, [editor]);

  return null;
}

/**
 * Sanitize DOM to remove unwanted elements and normalize styles
 */
function sanitizeDOM(doc: Document) {
  // Remove script, style, and other dangerous elements
  const dangerousTags = ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta'];
  dangerousTags.forEach(tag => {
    const elements = doc.getElementsByTagName(tag);
    Array.from(elements).forEach(el => el.remove());
  });

  // Remove event handlers and dangerous attributes
  const dangerousAttrs = ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur'];
  const allElements = doc.getElementsByTagName('*');
  Array.from(allElements).forEach(el => {
    dangerousAttrs.forEach(attr => {
      if (el.hasAttribute(attr)) {
        el.removeAttribute(attr);
      }
    });

    // Normalize class names (remove most classes except semantic ones)
    if (el.hasAttribute('class')) {
      const classes = el.getAttribute('class')?.split(' ') || [];
      const allowedClasses = classes.filter(c => 
        c.startsWith('lexical-') || 
        c === 'editor-' ||
        c === 'document-'
      );
      if (allowedClasses.length > 0) {
        el.setAttribute('class', allowedClasses.join(' '));
      } else {
        el.removeAttribute('class');
      }
    }

    // Normalize inline styles - keep only formatting-related styles
    if (el.hasAttribute('style')) {
      const style = el.getAttribute('style') || '';
      const normalizedStyle = normalizeInlineStyles(style);
      if (normalizedStyle) {
        el.setAttribute('style', normalizedStyle);
      } else {
        el.removeAttribute('style');
      }
    }

    // Remove data attributes except lexical ones
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('data-') && !attr.name.startsWith('data-lexical-')) {
        el.removeAttribute(attr.name);
      }
    });
  });

  // Normalize font families to standard ones
  normalizeFonts(doc);
}

/**
 * Normalize inline styles to keep only allowed formatting properties
 */
function normalizeInlineStyles(styleString: string): string {
  const allowedProperties = [
    'font-size',
    'font-family',
    'font-weight',
    'font-style',
    'text-decoration',
    'color',
    'background-color',
    'text-align',
    'line-height',
  ];

  const styles = styleString.split(';').filter(s => s.trim());
  const normalized: string[] = [];

  styles.forEach(style => {
    const [property, value] = style.split(':').map(s => s.trim());
    if (property && value && allowedProperties.includes(property.toLowerCase())) {
      // Normalize font sizes to pt
      if (property === 'font-size') {
        const normalizedSize = normalizeFontSize(value);
        if (normalizedSize) {
          normalized.push(`${property}: ${normalizedSize}`);
        }
      } 
      // Normalize font families
      else if (property === 'font-family') {
        const normalizedFont = normalizeFontFamily(value);
        if (normalizedFont) {
          normalized.push(`${property}: ${normalizedFont}`);
        }
      }
      // Keep other allowed properties as-is
      else {
        normalized.push(`${property}: ${value}`);
      }
    }
  });

  return normalized.join('; ');
}

/**
 * Normalize font size to pt units
 */
function normalizeFontSize(size: string): string | null {
  // Already in pt
  if (size.endsWith('pt')) {
    return size;
  }

  // Convert px to pt (1pt = 1.333px approximately)
  if (size.endsWith('px')) {
    const px = parseFloat(size);
    const pt = Math.round(px * 0.75);
    return `${pt}pt`;
  }

  // Convert em/rem to pt (assuming 12pt base)
  if (size.endsWith('em') || size.endsWith('rem')) {
    const em = parseFloat(size);
    const pt = Math.round(em * 12);
    return `${pt}pt`;
  }

  // Named sizes
  const namedSizes: Record<string, string> = {
    'xx-small': '8pt',
    'x-small': '9pt',
    'small': '10pt',
    'medium': '12pt',
    'large': '14pt',
    'x-large': '18pt',
    'xx-large': '24pt',
  };

  return namedSizes[size.toLowerCase()] || '12pt';
}

/**
 * Normalize font family to standard fonts
 */
function normalizeFontFamily(family: string): string {
  const standardFonts = [
    'Times New Roman',
    'Arial',
    'Calibri',
    'Cambria',
    'Georgia',
    'Verdana',
    'Trebuchet MS',
    'Comic Sans MS',
    'Impact',
    'Lucida Console',
    'Courier New',
  ];

  // Remove quotes and extra whitespace
  const cleaned = family.replace(/['"]/g, '').trim();
  
  // Split by comma (font stack)
  const fonts = cleaned.split(',').map(f => f.trim());
  
  // Find first standard font in the stack
  for (const font of fonts) {
    const match = standardFonts.find(sf => 
      sf.toLowerCase() === font.toLowerCase()
    );
    if (match) return `"${match}"`;
  }

  // Check for generic families
  if (fonts.some(f => f.toLowerCase().includes('serif') && !f.toLowerCase().includes('sans'))) {
    return '"Times New Roman"';
  }
  if (fonts.some(f => f.toLowerCase().includes('sans'))) {
    return '"Arial"';
  }
  if (fonts.some(f => f.toLowerCase().includes('mono'))) {
    return '"Courier New"';
  }

  // Default to Times New Roman
  return '"Times New Roman"';
}

/**
 * Normalize fonts throughout the document
 */
function normalizeFonts(doc: Document) {
  const allElements = doc.getElementsByTagName('*');
  Array.from(allElements).forEach(el => {
    if (el instanceof HTMLElement && el.style.fontFamily) {
      el.style.fontFamily = normalizeFontFamily(el.style.fontFamily);
    }
  });
}

