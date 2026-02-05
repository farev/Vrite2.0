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
  type ElementNode,
  $isElementNode,
} from 'lexical';
import { $createHeadingNode, type HeadingTagType } from '@lexical/rich-text';
import { $createListItemNode, $createListNode, type ListItemNode } from '@lexical/list';
import { $createDiffNode } from '@/components/nodes/DiffNode';
import { $createEquationNode, $isEquationNode } from '@/components/nodes/EquationNode';
import type { SimplifiedBlock, Segment, BlockKeyMap } from './lexicalSerializer';

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
  newSegments: Segment[];
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

  // Pre-process to group consecutive list item insertions
  const processedChanges = preprocessListInsertions(changes);

  for (const change of processedChanges) {
    try {
      if (change.operation === 'insert_list_group') {
        // Handle grouped list items
        applyInsertListGroup(change as InsertListGroupChange, blockKeyMap, root);
      } else {
        switch (change.operation) {
          case 'replace_block':
            applyReplaceBlock(change as ReplaceBlockChange, blockKeyMap);
            break;
          case 'insert_block':
            applyInsertBlock(change as InsertBlockChange, blockKeyMap, root);
            break;
          case 'delete_block':
            applyDeleteBlock(change as DeleteBlockChange, blockKeyMap);
            break;
          case 'modify_segments':
            applyModifySegments(change as ModifySegmentsChange, blockKeyMap);
            break;
          default:
            console.warn('Unknown change operation:', change);
        }
      }
    } catch (error) {
      console.error('Error applying change:', change, error);
    }
  }
}

// Internal type for grouped list insertions
interface InsertListGroupChange {
  operation: 'insert_list_group';
  afterBlockId: string | null;
  listType: 'bullet' | 'number';
  items: SimplifiedBlock[];
}

/**
 * Pre-process changes to group consecutive list item insertions.
 */
function preprocessListInsertions(changes: LexicalChange[]): (LexicalChange | InsertListGroupChange)[] {
  const result: (LexicalChange | InsertListGroupChange)[] = [];
  let i = 0;

  while (i < changes.length) {
    const change = changes[i];

    // Check if this is a list-item insert
    if (change.operation === 'insert_block' && change.newBlock.type === 'list-item') {
      const listType = change.newBlock.listType || 'bullet';
      const group: InsertListGroupChange = {
        operation: 'insert_list_group',
        afterBlockId: change.afterBlockId,
        listType: listType,
        items: [change.newBlock],
      };

      // Collect consecutive list items of the same type
      let j = i + 1;
      while (j < changes.length) {
        const nextChange = changes[j];
        if (
          nextChange.operation === 'insert_block' &&
          nextChange.newBlock.type === 'list-item' &&
          (nextChange.newBlock.listType || 'bullet') === listType
        ) {
          group.items.push(nextChange.newBlock);
          j++;
        } else {
          break;
        }
      }

      result.push(group);
      i = j;
    } else {
      result.push(change);
      i++;
    }
  }

  return result;
}

/**
 * Insert a group of list items as a single ListNode.
 */
function applyInsertListGroup(
  change: InsertListGroupChange,
  blockKeyMap: BlockKeyMap,
  root: LexicalNode
): void {
  const listNode = $createListNode(change.listType);

  for (const block of change.items) {
    const listItemNode = createListItemNodeWithDiff(block);
    listNode.append(listItemNode);
  }

  insertNodeIntoDocument(listNode, change.afterBlockId, blockKeyMap, root);
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

  // Get original alignment if node is an ElementNode
  let originalAlign: string | undefined;
  if ($isElementNode(existingNode)) {
    originalAlign = (existingNode as ElementNode).getFormatType() || 'left';
  }

  // Create new node with diff highlighting
  const newNode = createBlockNodeWithDiff(change.newBlock, originalText, originalAlign);
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
  const block = change.newBlock;

  // Handle list items specially - they need to be wrapped in a ListNode
  if (block.type === 'list-item') {
    const listType = block.listType || 'bullet';
    const listNode = $createListNode(listType);
    const listItemNode = createListItemNodeWithDiff(block);
    listNode.append(listItemNode);

    insertNodeIntoDocument(listNode, change.afterBlockId, blockKeyMap, root);
  } else {
    // Create regular block (paragraph, heading)
    const newNode = createBlockNodeWithDiff(block, null);
    insertNodeIntoDocument(newNode, change.afterBlockId, blockKeyMap, root);
  }
}

/**
 * Create a ListItemNode with diff highlighting.
 */
function createListItemNodeWithDiff(block: SimplifiedBlock): ListItemNode {
  const listItemNode = $createListItemNode();
  if (block.indent) {
    listItemNode.setIndent(block.indent);
  }

  // Apply alignment if specified
  if (block.align && $isElementNode(listItemNode)) {
    (listItemNode as unknown as ElementNode).setFormat(block.align);
  }

  const newText = getTextFromSegments(block.segments);
  const isBold = hasFormat(block.segments, 1);
  const isItalic = hasFormat(block.segments, 2);

  const diffNode = $createDiffNode(
    'addition',
    newText,
    undefined,
    isBold,
    isItalic
  );
  listItemNode.append(diffNode);

  return listItemNode;
}

/**
 * Helper to insert a node into the document at the right position.
 */
function insertNodeIntoDocument(
  newNode: LexicalNode,
  afterBlockId: string | null,
  blockKeyMap: BlockKeyMap,
  root: LexicalNode
): void {
  if (afterBlockId === null) {
    // Insert at the beginning
    const firstChild = (root as { getFirstChild?: () => LexicalNode | null }).getFirstChild?.();
    if (firstChild) {
      firstChild.insertBefore(newNode);
    } else {
      (root as { append?: (node: LexicalNode) => void }).append?.(newNode);
    }
  } else {
    const afterKey = blockKeyMap[afterBlockId];
    if (!afterKey) {
      console.warn(`After block not found: ${afterBlockId}, appending to end`);
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

  // Build new text for comparison (equations shown as [Equation: ...])
  const newText = getTextFromSegments(change.newSegments);

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
 * Extract text content from segments for display in diffs.
 * Equations are shown as [Equation: latex].
 */
function getTextFromSegments(segments: Segment[]): string {
  return segments.map(s => {
    if ('text' in s) {
      return s.text;
    } else if (s.type === 'equation') {
      return `[Equation: ${s.equation}]`;
    }
    return '';
  }).join('');
}

/**
 * Append segments (text or equations) to a paragraph/heading/list-item node.
 */
function appendSegmentsToNode(
  node: LexicalNode,
  segments: Segment[],
  isOriginal: boolean = false
): void {
  for (const segment of segments) {
    if ('text' in segment) {
      // Text segment - create text node
      const textNode = $createTextNode(segment.text);
      applyFormatToTextNode(textNode, segment.format);
      (node as { append?: (child: LexicalNode) => void }).append?.(textNode);
    } else if (segment.type === 'equation') {
      // Equation segment - create inline EquationNode
      const equationNode = $createEquationNode(
        segment.equation,
        true  // Inline equation
      );
      (node as { append?: (child: LexicalNode) => void }).append?.(equationNode);
    }
  }
}

/**
 * Create a Lexical block node with diff highlighting.
 */
function createBlockNodeWithDiff(
  block: SimplifiedBlock,
  originalText: string | null,
  originalAlign?: string
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
    case 'equation':
      if (!block.equationData) {
        throw new Error('Equation block missing equationData');
      }

      // Convert block equations to inline equations in paragraphs for better editing
      // Create a paragraph with an inline equation instead of a block equation
      node = $createParagraphNode();

      // Apply alignment if specified
      if (block.align && $isElementNode(node)) {
        (node as ElementNode).setFormat(block.align);
      }

      // Create inline equation (even for "display" equations)
      const equationNode = $createEquationNode(
        block.equationData.equation,
        true  // Always use inline: true for better editing
      );

      if (originalText !== null) {
        // Show diff for replacement
        const diffNode = $createDiffNode(
          'addition',
          `Equation: ${block.equationData.equation}`,
          originalText ? `Original: ${originalText}` : undefined,
          false,
          true,  // italic styling
          undefined,
          undefined,
          { equation: block.equationData.equation, inline: true }  // Always inline
        );
        (node as { append?: (child: LexicalNode) => void }).append?.(diffNode);
        return node;
      } else {
        // New equation - show diff
        const diffNode = $createDiffNode(
          'addition',
          `Equation: ${block.equationData.equation}`,
          undefined,
          false,
          true,  // italic styling
          undefined,
          undefined,
          { equation: block.equationData.equation, inline: true }  // Always inline
        );
        (node as { append?: (child: LexicalNode) => void }).append?.(diffNode);
        return node;
      }
    case 'paragraph':
    default:
      node = $createParagraphNode();
      break;
  }

  // Apply alignment if specified
  if (block.align && $isElementNode(node)) {
    (node as ElementNode).setFormat(block.align);
  }

  // Detect alignment change
  const newAlign = block.align || 'left';
  const oldAlign = originalAlign || 'left';
  const alignmentChange = (newAlign !== oldAlign) ? { from: oldAlign, to: newAlign } : undefined;

  // Check if this is a paragraph with only an equation segment (standalone equation)
  const hasSingleEquation = block.segments.length === 1 &&
    'type' in block.segments[0] &&
    block.segments[0].type === 'equation';

  if (hasSingleEquation) {
    // Standalone equation - show diff with equation data for proper rendering
    const equationSeg = block.segments[0];
    if ('equation' in equationSeg) {
      const diffNode = $createDiffNode(
        'addition',
        `Equation: ${equationSeg.equation}`,
        originalText || undefined,  // Include original text if replacing
        false,
        true,  // italic
        undefined,
        alignmentChange,
        { equation: equationSeg.equation, inline: true }  // Store equation data
      );
      (node as { append?: (child: LexicalNode) => void }).append?.(diffNode);
      return node;
    }
  }

  // Build new text from segments
  const newText = getTextFromSegments(block.segments);
  const isBold = hasFormat(block.segments, 1);
  const isItalic = hasFormat(block.segments, 2);

  if (originalText !== null && originalText !== newText) {
    // Content changed - show as diff (replacement)
    const diffNode = $createDiffNode(
      'addition',
      newText,
      originalText,
      isBold,
      isItalic,
      undefined,
      alignmentChange
    );
    (node as { append?: (child: LexicalNode) => void }).append?.(diffNode);
  } else if (originalText === null) {
    // New content - show as addition diff
    const diffNode = $createDiffNode(
      'addition',
      newText,
      undefined, // No original text
      isBold,
      isItalic,
      undefined,
      alignmentChange
    );
    (node as { append?: (child: LexicalNode) => void }).append?.(diffNode);
  } else {
    // Same text but might have alignment change
    if (alignmentChange) {
      // Only alignment changed - show as diff
      const diffNode = $createDiffNode(
        'addition',
        newText,
        newText, // Same text
        isBold,
        isItalic,
        undefined,
        alignmentChange
      );
      (node as { append?: (child: LexicalNode) => void }).append?.(diffNode);
    } else {
      // No changes - apply segments directly without diff
      appendSegmentsToNode(node, block.segments);
    }
  }

  return node;
}

/**
 * Check if any text segment has a specific format bit set.
 */
function hasFormat(segments: Segment[], formatBit: number): boolean {
  return segments.some(s => 'text' in s && (s.format & formatBit) !== 0);
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
 * Create nodes from segments (text or equation) for non-diff cases.
 */
export function createNodesFromSegments(segments: Segment[]): LexicalNode[] {
  const nodes: LexicalNode[] = [];

  for (const segment of segments) {
    if ('text' in segment) {
      const textNode = $createTextNode(segment.text);
      applyFormatToTextNode(textNode, segment.format);
      nodes.push(textNode);
    } else if (segment.type === 'equation') {
      const equationNode = $createEquationNode(segment.equation, true);
      nodes.push(equationNode);
    }
  }

  return nodes;
}

/**
 * @deprecated Use createNodesFromSegments instead
 */
export function createTextNodesFromSegments(segments: Segment[]): LexicalNode[] {
  return createNodesFromSegments(segments);
}
