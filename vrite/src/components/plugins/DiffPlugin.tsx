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
import type { DiffType } from '../nodes/DiffNode';

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
            // Reject addition: restore original text when available
            if (originalText) {
              node.replace($createTextNode(originalText));
            } else {
              node.remove();
            }
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
      const rawDiff = Diff.diffWords(originalContent, suggestedContent);

      // Merge adjacent delete+add pairs into a single replacement chunk
      const mergedDiff: Array<{
        type: DiffType | 'unchanged';
        value: string;
        original?: string;
      }> = [];

      for (let i = 0; i < rawDiff.length; i++) {
        const current = rawDiff[i];
        const next = rawDiff[i + 1];

        // deletion then addition -> replacement
        if (current?.removed && next?.added) {
          mergedDiff.push({
            type: 'addition',
            value: next.value,
            original: current.value,
          });
          i++; // skip next
          continue;
        }

        // addition then deletion (just in case order flips)
        if (current?.added && next?.removed) {
          mergedDiff.push({
            type: 'addition',
            value: current.value,
            original: next.value,
          });
          i++; // skip next
          continue;
        }

        if (current?.added) {
          mergedDiff.push({ type: 'addition', value: current.value });
          continue;
        }

        if (current?.removed) {
          mergedDiff.push({
            type: 'deletion',
            value: current.value,
            original: current.value,
          });
          continue;
        }

        mergedDiff.push({ type: 'unchanged', value: current.value });
      }

      // Create a single paragraph to hold all content
      // In a more advanced implementation, we'd handle paragraph breaks
      const paragraph = $createParagraphNode();

      mergedDiff.forEach((part) => {
        if (part.type === 'addition') {
          // New text or replacement
          const diffNode = $createDiffNode('addition', part.value, part.original);
          paragraph.append(diffNode);
          return;
        }

        if (part.type === 'deletion') {
          const diffNode = $createDiffNode('deletion', part.value, part.original);
          paragraph.append(diffNode);
          return;
        }

        // Unchanged text - add as regular text node
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
      });

      root.append(paragraph);

      if (onDiffComplete) {
        onDiffComplete();
      }
    });
  }, [editor, originalContent, suggestedContent, onDiffComplete]);

  return null;
}
