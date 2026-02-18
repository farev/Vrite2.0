/**
 * Lexical Serializer - Converts Lexical editor state to simplified JSON format
 * for communication with the AI agent backend.
 */

import type { LexicalNode, TextNode, ElementNode } from 'lexical';
import { $isElementNode } from 'lexical';
import type { HeadingNode } from '@lexical/rich-text';
import type { ListItemNode, ListNode } from '@lexical/list';
import type { TableNode, TableRowNode, TableCellNode } from '@lexical/table';
import type { EquationNode } from '@/components/nodes/EquationNode';
import { $isEquationNode } from '@/components/nodes/EquationNode';
import type { ImageNode } from '@/components/nodes/ImageNode';
import { $isImageNode } from '@/components/nodes/ImageNode';

// ============== Types ==============

export interface TextSegment {
  text: string;
  format: number; // Bitmask: 0=normal, 1=bold, 2=italic, 4=underline, etc.
}

export interface EquationSegment {
  type: 'equation';
  equation: string;  // LaTeX string
}

export type Segment = TextSegment | EquationSegment;

export interface EquationBlockData {
  equation: string;
  inline: boolean;  // Always false for block equations
}

export interface TableCell {
  segments: Segment[];
}

export interface TableRow {
  cells: TableCell[];
}

export interface TableBlockData {
  rows: TableRow[];
}

export interface ImageBlockData {
  src: string;
  altText: string;
  width: number | string;
  height: number | string;
  alignment: string;
  caption: string;
  showCaption: boolean;
}

export interface SimplifiedBlock {
  id: string;
  type: 'paragraph' | 'heading' | 'list-item' | 'equation' | 'table' | 'image';
  tag?: 'h1' | 'h2' | 'h3';
  listType?: 'bullet' | 'number';
  indent?: number;
  align?: 'left' | 'center' | 'right' | 'justify' | 'start' | 'end'; // Text alignment
  segments: Segment[];
  equationData?: EquationBlockData;  // For equation blocks
  tableData?: TableBlockData;  // For table blocks
  imageData?: ImageBlockData;  // For image blocks
}

export interface SimplifiedDocument {
  blocks: SimplifiedBlock[];
}

export interface BlockKeyMap {
  [blockId: string]: string; // blockId -> Lexical node key
}

// ============== Serialization ==============

/**
 * Convert Lexical editor root to simplified JSON format for the AI agent.
 */
export function serializeLexicalToSimplified(root: LexicalNode): SimplifiedDocument {
  const blocks: SimplifiedBlock[] = [];
  let blockIndex = 0;

  const processNode = (node: LexicalNode, parentListType?: 'bullet' | 'number') => {
    const type = node.getType();

    if (type === 'paragraph') {
      const segments = extractSegments(node);
      // Only add if there's content (or it's the only block)
      if (segments.length > 0 || blockIndex === 0) {
        const block: SimplifiedBlock = {
          id: `block-${blockIndex++}`,
          type: 'paragraph',
          segments: segments.length > 0 ? segments : [{ text: '', format: 0 }],
        };

        // Extract alignment if available
        if ($isElementNode(node)) {
          const formatType = (node as ElementNode).getFormatType();
          if (formatType && formatType !== 'left') {
            block.align = formatType;
          }
        }

        blocks.push(block);
      }
    } else if (type === 'heading') {
      const headingNode = node as HeadingNode;
      const segments = extractSegments(headingNode);
      const tag = headingNode.getTag() as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      // Normalize h4-h6 to h3
      const normalizedTag = ['h1', 'h2', 'h3'].includes(tag) ? tag as 'h1' | 'h2' | 'h3' : 'h3';

      const block: SimplifiedBlock = {
        id: `block-${blockIndex++}`,
        type: 'heading',
        tag: normalizedTag,
        segments: segments.length > 0 ? segments : [{ text: '', format: 0 }],
      };

      // Extract alignment if available
      if ($isElementNode(headingNode)) {
        const formatType = (headingNode as unknown as ElementNode).getFormatType();
        if (formatType && formatType !== 'left') {
          block.align = formatType;
        }
      }

      blocks.push(block);
    } else if (type === 'equation') {
      const equationNode = node as EquationNode;
      if (!equationNode.isInline()) {
        // Block equation - create equation block
        blocks.push({
          id: `block-${blockIndex++}`,
          type: 'equation',
          equationData: {
            equation: equationNode.getEquation(),
            inline: false,
          },
          segments: [],
        });
      }
      // Inline equations are handled in extractSegments()
    } else if (type === 'image') {
      const imageNode = node as ImageNode;
      blocks.push({
        id: `block-${blockIndex++}`,
        type: 'image',
        segments: [],
        imageData: {
          src: '[image]', // Don't send base64 to AI - too large
          altText: imageNode.getAltText(),
          width: imageNode.getWidth(),
          height: imageNode.getHeight(),
          alignment: imageNode.getAlignment(),
          caption: imageNode.getCaption(),
          showCaption: imageNode.getShowCaption(),
        },
      });
    } else if (type === 'list') {
      const listNode = node as ListNode;
      const listType = listNode.getListType() === 'bullet' ? 'bullet' : 'number';

      if ('getChildren' in listNode && typeof listNode.getChildren === 'function') {
        const children = listNode.getChildren() as LexicalNode[];
        children.forEach(child => processNode(child, listType));
      }
    } else if (type === 'listitem') {
      const listItemNode = node as ListItemNode;
      const segments = extractSegments(listItemNode);

      const block: SimplifiedBlock = {
        id: `block-${blockIndex++}`,
        type: 'list-item',
        listType: parentListType,
        indent: listItemNode.getIndent(),
        segments: segments.length > 0 ? segments : [{ text: '', format: 0 }],
      };

      // Extract alignment if available
      if ($isElementNode(listItemNode)) {
        const formatType = (listItemNode as unknown as ElementNode).getFormatType();
        if (formatType && formatType !== 'left') {
          block.align = formatType;
        }
      }

      blocks.push(block);
    } else if (type === 'table') {
      const tableNode = node as TableNode;
      const rows: TableRow[] = [];

      if ('getChildren' in tableNode && typeof tableNode.getChildren === 'function') {
        const rowNodes = tableNode.getChildren() as LexicalNode[];

        for (const rowNode of rowNodes) {
          if (rowNode.getType() === 'tablerow') {
            const cells: TableCell[] = [];

            if ('getChildren' in rowNode && typeof rowNode.getChildren === 'function') {
              const cellNodes = rowNode.getChildren() as LexicalNode[];

              for (const cellNode of cellNodes) {
                if (cellNode.getType() === 'tablecell') {
                  const cellSegments = extractSegments(cellNode);
                  cells.push({
                    segments: cellSegments.length > 0 ? cellSegments : [{ text: '', format: 0 }],
                  });
                }
              }
            }

            rows.push({ cells });
          }
        }
      }

      blocks.push({
        id: `block-${blockIndex++}`,
        type: 'table',
        segments: [],
        tableData: { rows },
      });
    } else if ('getChildren' in node && typeof node.getChildren === 'function') {
      // Process children of unknown container nodes (like root)
      const children = node.getChildren() as LexicalNode[];
      children.forEach(child => processNode(child));
    }
  };

  processNode(root);
  return { blocks };
}

/**
 * Extract text segments from an element node, preserving formatting.
 */
function extractSegments(elementNode: LexicalNode): Segment[] {
  const segments: Segment[] = [];

  if (!('getChildren' in elementNode) || typeof elementNode.getChildren !== 'function') {
    return segments;
  }

  const children = elementNode.getChildren() as LexicalNode[];

  for (const child of children) {
    if (child.getType() === 'text') {
      const textNode = child as TextNode;
      segments.push({
        text: textNode.getTextContent(),
        format: textNode.getFormat(),
      });
    } else if (child.getType() === 'equation') {
      const equationNode = child as EquationNode;
      if (equationNode.isInline()) {
        segments.push({
          type: 'equation',
          equation: equationNode.getEquation(),
        });
      }
    } else if (child.getType() === 'linebreak') {
      // Represent line breaks as newline in text
      segments.push({
        text: '\n',
        format: 0,
      });
    } else if (child.getType() === 'diff') {
      // Handle diff nodes - extract their text content
      segments.push({
        text: child.getTextContent(),
        format: 0,
      });
    } else if ('getTextContent' in child && typeof child.getTextContent === 'function') {
      // Fallback for other node types with text content
      const text = child.getTextContent();
      if (text) {
        segments.push({
          text,
          format: 0,
        });
      }
    }
  }

  // Merge adjacent text segments with same format
  return mergeSegments(segments);
}

/**
 * Merge adjacent text segments with the same format.
 * Equation segments are never merged.
 */
function mergeSegments(segments: Segment[]): Segment[] {
  if (segments.length === 0) return [];

  const merged: Segment[] = [];
  let current = segments[0];

  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i];

    // Only merge text segments with matching format
    if ('text' in current && 'text' in segment && current.format === segment.format) {
      current = { text: current.text + segment.text, format: current.format };
    } else {
      merged.push(current);
      current = segment;
    }
  }
  merged.push(current);

  return merged;
}

// ============== Block Key Mapping ==============

/**
 * Build a mapping from block IDs to Lexical node keys.
 * This allows the change applicator to find nodes by their simplified block ID.
 */
export function buildBlockKeyMap(root: LexicalNode): BlockKeyMap {
  const map: BlockKeyMap = {};
  let blockIndex = 0;

  const processNode = (node: LexicalNode, parentListType?: 'bullet' | 'number') => {
    const type = node.getType();

    if (type === 'paragraph') {
      // Match serialization logic: only add if there's content (or it's the only block)
      const segments = extractSegments(node);
      if (segments.length > 0 || blockIndex === 0) {
        map[`block-${blockIndex++}`] = node.getKey();
      }
    } else if (type === 'heading') {
      map[`block-${blockIndex++}`] = node.getKey();
    } else if (type === 'equation') {
      const equationNode = node as EquationNode;
      // Match serialization logic: only block equations, not inline
      if (!equationNode.isInline()) {
        map[`block-${blockIndex++}`] = node.getKey();
      }
    } else if (type === 'image') {
      map[`block-${blockIndex++}`] = node.getKey();
    } else if (type === 'table') {
      map[`block-${blockIndex++}`] = node.getKey();
    } else if (type === 'listitem') {
      map[`block-${blockIndex++}`] = node.getKey();
    } else if (type === 'list') {
      // Process list children
      if ('getChildren' in node && typeof node.getChildren === 'function') {
        const children = node.getChildren() as LexicalNode[];
        children.forEach(child => processNode(child, type === 'list' ? (node as ListNode).getListType() === 'bullet' ? 'bullet' : 'number' : parentListType));
      }
    } else if ('getChildren' in node && typeof node.getChildren === 'function') {
      // Process children of root or other containers
      const children = node.getChildren() as LexicalNode[];
      children.forEach(child => {
        if (child.getType() !== 'text' && child.getType() !== 'diff') {
          processNode(child);
        }
      });
    }
  };

  processNode(root);
  return map;
}

/**
 * Get the last block ID in the document (useful for appending content).
 */
export function getLastBlockId(document: SimplifiedDocument): string | null {
  if (document.blocks.length === 0) return null;
  return document.blocks[document.blocks.length - 1].id;
}

/**
 * Check if a document is empty/blank.
 */
export function isDocumentEmpty(document: SimplifiedDocument): boolean {
  if (document.blocks.length === 0) return true;

  // Check if all blocks have empty segments or are empty equations
  return document.blocks.every(block => {
    if (block.type === 'equation') {
      return !block.equationData || block.equationData.equation.trim() === '';
    }
    return (
      block.segments.length === 0 ||
      (block.segments.length === 1 && 'text' in block.segments[0] && block.segments[0].text.trim() === '')
    );
  });
}
