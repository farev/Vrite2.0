'use client';

import { useEffect, useCallback } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getRoot,
  $createTextNode,
  $getNodeByKey,
  type NodeKey,
  type LexicalNode,
} from 'lexical';
import { $convertToMarkdownString, TRANSFORMERS } from '@lexical/markdown';
import { DiffNode, $isDiffNode } from '../nodes/DiffNode';
import { buildBlockKeyMap } from '@/lib/lexicalSerializer';
import { applyChangesWithDiff, type LexicalChange } from '@/lib/lexicalChangeApplicator';

interface DiffPluginProps {
  changes: LexicalChange[] | null;
  onDiffComplete?: () => void;
  onAllResolved?: (finalContent: string) => void;
  onAnyAccepted?: () => void;
}

export default function DiffPlugin({
  changes,
  onDiffComplete,
  onAllResolved,
  onAnyAccepted,
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

    if (!hasDiffNodes && onAllResolved) {
      const markdownContent = $convertToMarkdownString(TRANSFORMERS);
      onAllResolved(markdownContent);
    }
  }, [onAllResolved]);

  // Handle accepting a diff node
  const handleAccept = useCallback(
    (nodeKey: NodeKey) => {
      let didAccept = false;
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isDiffNode(node)) {
          const text = node.getText();
          const nodeData = node.exportJSON();

          const textNode = $createTextNode(text);
          if (nodeData.isBold) textNode.toggleFormat('bold');
          if (nodeData.isItalic) textNode.toggleFormat('italic');

          node.replace(textNode);
          didAccept = true;
        }
        checkAllResolved();
      });
      if (didAccept) {
        onAnyAccepted?.();
      }
    },
    [editor, checkAllResolved, onAnyAccepted]
  );

  // Handle rejecting a diff node
  const handleReject = useCallback(
    (nodeKey: NodeKey) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isDiffNode(node)) {
          const originalText = node.getOriginalText();
          const diffType = node.getDiffType();

          if (diffType === 'addition') {
            if (originalText) {
              // Replacement - restore original text
              const textNode = $createTextNode(originalText);
              node.replace(textNode);
            } else {
              // New content with no original - remove entirely
              const parent = node.getParent();
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
    },
    [editor, checkAllResolved]
  );

  // Set up callbacks on the DiffNode class
  useEffect(() => {
    DiffNode.setCallbacks(handleAccept, handleReject);
  }, [handleAccept, handleReject]);

  // Apply changes when received
  useEffect(() => {
    if (!changes || changes.length === 0) {
      return;
    }

    editor.update(() => {
      const root = $getRoot();

      // Build block ID to node key mapping
      const blockKeyMap = buildBlockKeyMap(root);

      console.log('Applying Lexical changes:', changes);
      console.log('Block key map:', blockKeyMap);

      // Apply changes with diff highlighting
      applyChangesWithDiff(changes, blockKeyMap);

      console.log('Applied Lexical changes with inline diffs');

      if (onDiffComplete) {
        onDiffComplete();
      }
    });
  }, [editor, changes, onDiffComplete]);

  return null;
}
