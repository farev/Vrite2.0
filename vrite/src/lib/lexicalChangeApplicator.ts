/**
 * Lexical Change Applicator - Applies changes from the AI agent to the Lexical editor
 * with diff highlighting for user review.
 */

import {
  $getRoot,
  $getNodeByKey,
  $createParagraphNode,
  $createTextNode,
  type LexicalNode,
  type TextNode,
} from 'lexical';
import { $createHeadingNode, type HeadingTagType } from '@lexical/rich-text';
import { $createListItemNode, $createListNode, type ListItemNode } from '@lexical/list';
import { $createDiffNode } from '@/components/nodes/DiffNode';
import type { SimplifiedBlock, TextSegment, BlockKeyMap } from './lexicalSerializer';

// ============== Change Types ==============

export interface ReplaceBlockChange {
  operation: 'replace_block';
  blockId: string;
  newBlock: SimplifiedBlock;
}

export interface InsertBlockChange {
  operation: 'insert_block';
  afterBlockId: string | null;
  newBlock: SimplifiedBlock;
}

export interface DeleteBlockChange {
  operation: 'delete_block';
  blockId: string;
}

export interface ModifySegmentsChange {
  operation: 'modify_segments';
  blockId: string;
  newSegments: TextSegment[];
}

export type LexicalChange =
  | ReplaceBlockChange
  | InsertBlockChange
  | DeleteBlockChange
  | ModifySegmentsChange;

// ============== Change Application ==============

/**
 * Apply changes from the AI agent to the Lexical editor with diff highlighting.
 */
export function applyChangesWithDiff(
  changes: LexicalChange[],
  blockKeyMap: BlockKeyMap
): void {
  const root = $getRoot();

  for (const change of changes) {
    try {
      switch (change.operation) {
        case 'replace_block':
          applyReplaceBlock(change, blockKeyMap);
          break;
        case 'insert_block':
          applyInsertBlock(change, blockKeyMap, root);
          break;
        case 'delete_block':
          applyDeleteBlock(change, blockKeyMap);
          break;
        case 'modify_segments':
          applyModifySegments(change, blockKeyMap);
          break;
        default:
          console.warn('Unknown change operation:', change);
      }
    } catch (error) {
      console.error('Error applying change:', change, error);
    }
  }
}

/**
 * Replace a block with new content.
 */
function applyReplaceBlock(change: ReplaceBlockChange, blockKeyMap: BlockKeyMap): void {
  const nodeKey = blockKeyMap[change.blockId];
  if (!nodeKey) {
    console.warn(`Block not found: ${change.blockId}`);
    return;
  }

  const existingNode = $getNodeByKey(nodeKey);
  if (!existingNode) {
    console.warn(`Node not found for key: ${nodeKey}`);
    return;
  }

  // Get original text for diff display
  const originalText = existingNode.getTextContent();

  // Create new node with diff highlighting
  const newNode = createBlockNodeWithDiff(change.newBlock, originalText);
  existingNode.replace(newNode);
}

/**
 * Insert a new block into the document.
 */
function applyInsertBlock(
  change: InsertBlockChange,
  blockKeyMap: BlockKeyMap,
  root: LexicalNode
): void {
  // Create new block (as new content, no original)
  const newNode = createBlockNodeWithDiff(change.newBlock, null);

  if (change.afterBlockId === null) {
    // Insert at the beginning
    const firstChild = (root as { getFirstChild?: () => LexicalNode | null }).getFirstChild?.();
    if (firstChild) {
      firstChild.insertBefore(newNode);
    } else {
      (root as { append?: (node: LexicalNode) => void }).append?.(newNode);
    }
  } else {
    const afterKey = blockKeyMap[change.afterBlockId];
    if (!afterKey) {
      console.warn(`After block not found: ${change.afterBlockId}, appending to end`);
      (root as { append?: (node: LexicalNode) => void }).append?.(newNode);
      return;
    }

    const afterNode = $getNodeByKey(afterKey);
    if (afterNode) {
      afterNode.insertAfter(newNode);
    } else {
      console.warn(`After node not found, appending to end`);
      (root as { append?: (node: LexicalNode) => void }).append?.(newNode);
    }
  }
}

/**
 * Delete a block from the document.
 */
function applyDeleteBlock(change: DeleteBlockChange, blockKeyMap: BlockKeyMap): void {
  const nodeKey = blockKeyMap[change.blockId];
  if (!nodeKey) {
    console.warn(`Block not found for deletion: ${change.blockId}`);
    return;
  }

  const node = $getNodeByKey(nodeKey);
  if (node) {
    const originalText = node.getTextContent();

    // Create a diff node showing the deletion
    const diffNode = $createDiffNode(
      'deletion',
      originalText,
      originalText,
      false,
      false
    );

    // Replace the block content with the deletion indicator
    const paragraph = $createParagraphNode();
    paragraph.append(diffNode);
    node.replace(paragraph);
  }
}

/**
 * Modify the segments (text/formatting) within an existing block.
 */
function applyModifySegments(change: ModifySegmentsChange, blockKeyMap: BlockKeyMap): void {
  const nodeKey = blockKeyMap[change.blockId];
  if (!nodeKey) {
    console.warn(`Block not found: ${change.blockId}`);
    return;
  }

  const node = $getNodeByKey(nodeKey);
  if (!node) {
    console.warn(`Node not found for key: ${nodeKey}`);
    return;
  }

  // Get original text
  const originalText = node.getTextContent();

  // Build new text for comparison
  const newText = change.newSegments.map(s => s.text).join('');

  // Clear existing children
  if ('clear' in node && typeof node.clear === 'function') {
    node.clear();
  }

  if (originalText !== newText) {
    // Text changed - show as diff
    const isBold = hasFormat(change.newSegments, 1);
    const isItalic = hasFormat(change.newSegments, 2);

    const diffNode = $createDiffNode(
      'addition',
      newText,
      originalText,
      isBold,
      isItalic
    );

    (node as { append?: (child: LexicalNode) => void }).append?.(diffNode);
  } else {
    // Only formatting changed - apply segments directly with diff for format changes
    // For simplicity, we'll show this as a diff too since the user should review formatting changes
    const isBold = hasFormat(change.newSegments, 1);
    const isItalic = hasFormat(change.newSegments, 2);

    const diffNode = $createDiffNode(
      'addition',
      newText,
      originalText,
      isBold,
      isItalic
    );

    (node as { append?: (child: LexicalNode) => void }).append?.(diffNode);
  }
}

// ============== Helper Functions ==============

/**
 * Create a Lexical block node with diff highlighting.
 */
function createBlockNodeWithDiff(
  block: SimplifiedBlock,
  originalText: string | null
): LexicalNode {
  let node: LexicalNode;

  // Create the appropriate node type
  switch (block.type) {
    case 'heading':
      node = $createHeadingNode(block.tag as HeadingTagType);
      break;
    case 'list-item':
      node = $createListItemNode();
      if (block.indent) {
        (node as ListItemNode).setIndent(block.indent);
      }
      break;
    case 'paragraph':
    default:
      node = $createParagraphNode();
      break;
  }

  // Build new text from segments
  const newText = block.segments.map(s => s.text).join('');
  const isBold = hasFormat(block.segments, 1);
  const isItalic = hasFormat(block.segments, 2);

  if (originalText !== null && originalText !== newText) {
    // Content changed - show as diff (replacement)
    const diffNode = $createDiffNode(
      'addition',
      newText,
      originalText,
      isBold,
      isItalic
    );
    (node as { append?: (child: LexicalNode) => void }).append?.(diffNode);
  } else if (originalText === null) {
    // New content - show as addition diff
    const diffNode = $createDiffNode(
      'addition',
      newText,
      undefined, // No original text
      isBold,
      isItalic
    );
    (node as { append?: (child: LexicalNode) => void }).append?.(diffNode);
  } else {
    // Same text (shouldn't happen for replace, but handle it)
    // Apply segments directly without diff
    for (const segment of block.segments) {
      const textNode = $createTextNode(segment.text);
      applyFormatToTextNode(textNode, segment.format);
      (node as { append?: (child: LexicalNode) => void }).append?.(textNode);
    }
  }

  return node;
}

/**
 * Check if any segment has a specific format bit set.
 */
function hasFormat(segments: TextSegment[], formatBit: number): boolean {
  return segments.some(s => (s.format & formatBit) !== 0);
}

/**
 * Apply format bitmask to a text node.
 */
function applyFormatToTextNode(textNode: TextNode, format: number): void {
  if (format & 1) textNode.toggleFormat('bold');
  if (format & 2) textNode.toggleFormat('italic');
  if (format & 4) textNode.toggleFormat('underline');
  if (format & 8) textNode.toggleFormat('strikethrough');
  if (format & 16) textNode.toggleFormat('subscript');
  if (format & 32) textNode.toggleFormat('superscript');
  if (format & 64) textNode.toggleFormat('code');
}

/**
 * Create text nodes from segments (for non-diff cases).
 */
export function createTextNodesFromSegments(segments: TextSegment[]): TextNode[] {
  const nodes: TextNode[] = [];

  for (const segment of segments) {
    const textNode = $createTextNode(segment.text);
    applyFormatToTextNode(textNode, segment.format);
    nodes.push(textNode);
  }

  return nodes;
}
