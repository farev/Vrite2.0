'use client';

import { useEffect, useCallback } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getRoot,
  $createTextNode,
  $createParagraphNode,
  $getNodeByKey,
  $setSelection,
  $isElementNode,
  type NodeKey,
  type LexicalNode,
  type ElementNode,
} from 'lexical';
import { $convertToMarkdownString, TRANSFORMERS } from '@lexical/markdown';
import { DiffNode, $isDiffNode } from '../nodes/DiffNode';
import { $createEquationNode, $isEquationNode } from '../nodes/EquationNode';
import { buildBlockKeyMap } from '@/lib/lexicalSerializer';
import { applyChangesWithDiff, type LexicalChange, createNodesFromSegments } from '@/lib/lexicalChangeApplicator';

interface DiffPluginProps {
  changes: LexicalChange[] | null;
  contextImages?: Array<{ filename: string; data: string; width: number; height: number }>;
  onDiffComplete?: () => void;
  onAllResolved?: (finalContent: string) => void;
  onAnyAccepted?: () => void;
  onAnyResolved?: () => void;
  onDiffNodesDetected?: () => void;
}

export default function DiffPlugin({
  changes,
  contextImages = [],
  onDiffComplete,
  onAllResolved,
  onAnyAccepted,
  onAnyResolved,
  onDiffNodesDetected,
}: DiffPluginProps) {
  const [editor] = useLexicalComposerContext();

  // Check if all diff nodes have been resolved
  const checkAllResolved = useCallback(() => {
    const root = $getRoot();
    let hasDiffNodes = false;

    const checkNode = (node: LexicalNode) => {
      if ($isDiffNode(node)) {
        hasDiffNodes = true;
        return;
      }
      if ('getChildren' in node && typeof node.getChildren === 'function') {
        const children = node.getChildren() as LexicalNode[];
        for (const child of children) {
          checkNode(child);
          if (hasDiffNodes) return;
        }
      }
    };

    checkNode(root);

    // When all diffs are resolved, the editor state is already correct
    // No need to reload or convert - diffs were applied directly to Lexical state
    if (!hasDiffNodes && onAllResolved) {
      // Just notify that all diffs are resolved (no content parameter needed)
      onAllResolved('');
    }
  }, [onAllResolved]);

  // Handle accepting a diff node
  const handleAccept = useCallback(
    (nodeKey: NodeKey) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isDiffNode(node)) {
          const text = node.getText();
          const diffType = node.getDiffType();
          const nodeData = node.exportJSON();
          const parent = node.getParent();

          if (diffType === 'deletion') {
            // For deletions, accepting means removing the content entirely
            node.remove();
            // Remove empty parent paragraph if it only contained the deletion
            if (parent && parent.getTextContent().trim() === '') {
              parent.remove();
            }
          } else {
            // For additions/replacements, check if it's an image
            if (nodeData.imageData) {
              // Import ImageNode
              const { $createImageNode } = require('@/components/nodes/ImageNode');

              // Create an ImageNode
              const imageNode = $createImageNode({
                src: nodeData.imageData.src,
                altText: nodeData.imageData.altText,
                width: typeof nodeData.imageData.width === 'number' ? nodeData.imageData.width : (nodeData.imageData.width === 'inherit' ? 'inherit' : parseInt(String(nodeData.imageData.width))),
                height: typeof nodeData.imageData.height === 'number' ? nodeData.imageData.height : (nodeData.imageData.height === 'inherit' ? 'inherit' : parseInt(String(nodeData.imageData.height))),
                alignment: nodeData.imageData.alignment as 'left' | 'center' | 'right',
                caption: nodeData.imageData.caption || '',
                showCaption: nodeData.imageData.showCaption || false,
              });

              // Replace the parent paragraph with the image
              if (parent) {
                parent.replace(imageNode);
              }
            } else if (nodeData.equationData) {
              // Create an inline EquationNode (all equations are inline now)
              const equationNode = $createEquationNode(
                nodeData.equationData.equation,
                true  // Always inline
              );

              // Replace the DiffNode with the inline EquationNode
              node.replace(equationNode);
            } else {
              // Regular text replacement
              const textNode = $createTextNode(text);
              if (nodeData.isBold) textNode.toggleFormat('bold');
              if (nodeData.isItalic) textNode.toggleFormat('italic');

              // Replace the DiffNode with the new TextNode
              // The parent element already has the new alignment set (from createBlockNodeWithDiff)
              node.replace(textNode);
            }
          }
        }
        checkAllResolved();
      });
      // Callbacks are called unconditionally — handleAccept is only invoked from
      // a DiffNode's click handler, so the node is guaranteed to exist.
      // (The previous guard used a flag set inside the async editor.update() callback,
      // which always read as false before the deferred mutation ran.)
      onAnyAccepted?.();
      onAnyResolved?.();
    },
    [editor, checkAllResolved, onAnyAccepted, onAnyResolved]
  );

  // Handle rejecting a diff node
  const handleReject = useCallback(
    (nodeKey: NodeKey) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isDiffNode(node)) {
          const originalText = node.getOriginalText();
          const diffType = node.getDiffType();
          const nodeData = node.exportJSON();
          const parent = node.getParent();

          // Restore original alignment if there was an alignment change
          if (nodeData.alignmentChange && parent && $isElementNode(parent)) {
            const originalAlign = nodeData.alignmentChange.from;
            (parent as ElementNode).setFormat(originalAlign as any);
          }

          if (diffType === 'addition') {
            if (originalText) {
              // Replacement - restore original text
              const textNode = $createTextNode(originalText);
              node.replace(textNode);
            } else {
              // New content with no original - remove entirely
              node.remove();
              // Remove empty parent if needed
              if (parent && parent.getTextContent().trim() === '') {
                parent.remove();
              }
            }
          } else {
            // Deletion - restore the deleted content
            if (originalText) {
              const textNode = $createTextNode(originalText);
              node.replace(textNode);
            } else {
              node.remove();
            }
          }
        }
        checkAllResolved();
      });
      // Callback called unconditionally — handleReject is only invoked from a
      // DiffNode's click handler, so the node is guaranteed to exist.
      // (The previous guard used a flag set inside the async editor.update() callback,
      // which always read as false before the deferred mutation ran.)
      onAnyResolved?.();
    },
    [editor, checkAllResolved, onAnyResolved]
  );

  // Handle resolving a diff node with a custom (partially-accepted) text
  const handleResolveWithText = useCallback(
    (nodeKey: NodeKey, resolvedText: string) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isDiffNode(node)) {
          const nodeData = node.exportJSON();
          const textNode = $createTextNode(resolvedText);
          if (nodeData.isBold) textNode.toggleFormat('bold');
          if (nodeData.isItalic) textNode.toggleFormat('italic');
          node.replace(textNode);
        }
        checkAllResolved();
      });
      onAnyAccepted?.();
      onAnyResolved?.();
    },
    [editor, checkAllResolved, onAnyAccepted, onAnyResolved]
  );

  // Set up callbacks on the DiffNode class
  useEffect(() => {
    DiffNode.setCallbacks(handleAccept, handleReject, handleResolveWithText);
  }, [handleAccept, handleReject, handleResolveWithText]);

  // Apply changes when received
  useEffect(() => {
    if (!changes || changes.length === 0) {
      return;
    }

    editor.update(() => {
      const root = $getRoot();

      // Clear selection to avoid "selection has been lost" error when replacing nodes
      $setSelection(null);

      // Build block ID to node key mapping
      const blockKeyMap = buildBlockKeyMap(root);

      console.log('Applying Lexical changes:', changes);
      console.log('Block key map:', blockKeyMap);
      console.log('Context images:', contextImages);

      // Apply changes with diff highlighting
      applyChangesWithDiff(changes, blockKeyMap, contextImages);

      console.log('Applied Lexical changes with inline diffs');

      if (onDiffComplete) {
        onDiffComplete();
      }
    });
  }, [editor, changes, onDiffComplete]);

  // Detect DiffNodes reappearing (e.g., after undo) and re-enable diff mode
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const root = $getRoot();
        let hasDiffNodes = false;

        const scan = (node: LexicalNode) => {
          if (hasDiffNodes) return;
          if ($isDiffNode(node)) {
            hasDiffNodes = true;
            return;
          }
          if ('getChildren' in node && typeof node.getChildren === 'function') {
            for (const child of (node.getChildren() as LexicalNode[])) {
              scan(child);
              if (hasDiffNodes) return;
            }
          }
        };
        scan(root);

        if (hasDiffNodes && onDiffNodesDetected) {
          onDiffNodesDetected();
        }
      });
    });
  }, [editor, onDiffNodesDetected]);

  return null;
}
