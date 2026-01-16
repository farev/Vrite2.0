/**
 * Lexical Serializer - Converts Lexical editor state to simplified JSON format
 * for communication with the AI agent backend.
 */

import type { LexicalNode, TextNode } from 'lexical';
import type { HeadingNode } from '@lexical/rich-text';
import type { ListItemNode, ListNode } from '@lexical/list';

// ============== Types ==============

export interface TextSegment {
  text: string;
  format: number; // Bitmask: 0=normal, 1=bold, 2=italic, 4=underline, etc.
}

export interface SimplifiedBlock {
  id: string;
  type: 'paragraph' | 'heading' | 'list-item';
  tag?: 'h1' | 'h2' | 'h3';
  listType?: 'bullet' | 'number';
  indent?: number;
  segments: TextSegment[];
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
        blocks.push({
          id: `block-${blockIndex++}`,
          type: 'paragraph',
          segments: segments.length > 0 ? segments : [{ text: '', format: 0 }],
        });
      }
    } else if (type === 'heading') {
      const headingNode = node as HeadingNode;
      const segments = extractSegments(headingNode);
      const tag = headingNode.getTag() as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      // Normalize h4-h6 to h3
      const normalizedTag = ['h1', 'h2', 'h3'].includes(tag) ? tag as 'h1' | 'h2' | 'h3' : 'h3';

      blocks.push({
        id: `block-${blockIndex++}`,
        type: 'heading',
        tag: normalizedTag,
        segments: segments.length > 0 ? segments : [{ text: '', format: 0 }],
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

      blocks.push({
        id: `block-${blockIndex++}`,
        type: 'list-item',
        listType: parentListType,
        indent: listItemNode.getIndent(),
        segments: segments.length > 0 ? segments : [{ text: '', format: 0 }],
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
function extractSegments(elementNode: LexicalNode): TextSegment[] {
  const segments: TextSegment[] = [];

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

  // Merge adjacent segments with same format
  return mergeSegments(segments);
}

/**
 * Merge adjacent segments with the same format.
 */
function mergeSegments(segments: TextSegment[]): TextSegment[] {
  if (segments.length === 0) return [];

  const merged: TextSegment[] = [];
  let current = { ...segments[0] };

  for (let i = 1; i < segments.length; i++) {
    if (segments[i].format === current.format) {
      current.text += segments[i].text;
    } else {
      merged.push(current);
      current = { ...segments[i] };
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

  const processNode = (node: LexicalNode) => {
    const type = node.getType();

    if (type === 'paragraph' || type === 'heading') {
      map[`block-${blockIndex++}`] = node.getKey();
    } else if (type === 'listitem') {
      map[`block-${blockIndex++}`] = node.getKey();
    } else if (type === 'list') {
      // Process list children
      if ('getChildren' in node && typeof node.getChildren === 'function') {
        const children = node.getChildren() as LexicalNode[];
        children.forEach(child => processNode(child));
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

  // Check if all blocks have empty segments
  return document.blocks.every(block =>
    block.segments.length === 0 ||
    (block.segments.length === 1 && block.segments[0].text.trim() === '')
  );
}
