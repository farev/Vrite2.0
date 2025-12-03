'use client';

import { useEffect, useCallback } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  type NodeKey,
  type LexicalNode,
} from 'lexical';
import * as Diff from 'diff';
import { DiffNode, $createDiffNode, $isDiffNode } from '../nodes/DiffNode';

interface DiffPluginProps {
  originalContent: string | null;
  suggestedContent: string | null;
  onDiffComplete?: () => void;
  onAllResolved?: (finalContent: string) => void;
}

export default function DiffPlugin({
  originalContent,
  suggestedContent,
  onDiffComplete,
  onAllResolved,
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
      const content = root.getTextContent();
      onAllResolved(content);
    }
  }, [onAllResolved]);

  // Handle accepting a diff node
  const handleAccept = useCallback(
    (nodeKey: NodeKey) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isDiffNode(node)) {
          const diffType = node.getDiffType();
          const text = node.getText();

          if (diffType === 'addition') {
            // Accept addition: replace diff node with regular text
            const textNode = $createTextNode(text);
            node.replace(textNode);
          } else {
            // Accept deletion: remove the diff node entirely
            node.remove();
          }
        }

        // Check if all diff nodes are resolved
        checkAllResolved();
      });
    },
    [editor, checkAllResolved]
  );

  // Handle rejecting a diff node
  const handleReject = useCallback(
    (nodeKey: NodeKey) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isDiffNode(node)) {
          const diffType = node.getDiffType();
          const originalText = node.getOriginalText();

          if (diffType === 'addition') {
            // Reject addition: remove the diff node
            node.remove();
          } else {
            // Reject deletion: restore original text
            if (originalText) {
              const textNode = $createTextNode(originalText);
              node.replace(textNode);
            } else {
              node.remove();
            }
          }
        }

        // Check if all diff nodes are resolved
        checkAllResolved();
      });
    },
    [editor, checkAllResolved]
  );

  // Set up callbacks on the DiffNode class
  useEffect(() => {
    DiffNode.setCallbacks(handleAccept, handleReject);
  }, [handleAccept, handleReject]);

  // Apply diff when content changes
  useEffect(() => {
    if (originalContent === null || suggestedContent === null) {
      return;
    }

    editor.update(() => {
      const root = $getRoot();
      root.clear();

      // Compute word-level diff
      const diff = Diff.diffWords(originalContent, suggestedContent);

      // Create a single paragraph to hold all content
      // In a more advanced implementation, we'd handle paragraph breaks
      const paragraph = $createParagraphNode();

      diff.forEach((part) => {
        if (part.added) {
          // This is new text being added
          const diffNode = $createDiffNode('addition', part.value);
          paragraph.append(diffNode);
        } else if (part.removed) {
          // This is text being deleted
          const diffNode = $createDiffNode('deletion', part.value, part.value);
          paragraph.append(diffNode);
        } else {
          // Unchanged text - add as regular text node
          // Handle newlines by creating new paragraphs
          const lines = part.value.split('\n');
          lines.forEach((line, index) => {
            if (line) {
              paragraph.append($createTextNode(line));
            }
            // Add newline representation (except for last segment)
            if (index < lines.length - 1) {
              paragraph.append($createTextNode('\n'));
            }
          });
        }
      });

      root.append(paragraph);

      if (onDiffComplete) {
        onDiffComplete();
      }
    });
  }, [editor, originalContent, suggestedContent, onDiffComplete]);

  return null;
}
