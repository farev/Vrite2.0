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
import { $createHeadingNode } from '@lexical/rich-text';
import * as Diff from 'diff';
import { DiffNode, $createDiffNode, $isDiffNode } from '../nodes/DiffNode';
import type { DiffType } from '../nodes/DiffNode';
import type { FormattingOperation } from '@/lib/deltaApplicator';

interface DiffPluginProps {
  originalContent: string | null;
  suggestedContent: string | null;
  formattingOps?: FormattingOperation[];
  onDiffComplete?: () => void;
  onAllResolved?: (finalContent: string) => void;
}

export default function DiffPlugin({
  originalContent,
  suggestedContent,
  formattingOps = [],
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
          const formatting = node.exportJSON(); // Get isBold, isItalic, headingLevel

          if (diffType === 'addition') {
            // Accept addition: replace diff node with formatted text
            const textNode = $createTextNode(text);

            // Apply text formatting
            if (formatting.isBold) {
              textNode.toggleFormat('bold');
            }
            if (formatting.isItalic) {
              textNode.toggleFormat('italic');
            }

            node.replace(textNode);

            // For headings, convert the parent paragraph to a heading
            if (formatting.headingLevel) {
              const parent = textNode.getParent();
              if (parent && parent.getType() === 'paragraph') {
                const headingTag = `h${Math.min(Math.max(formatting.headingLevel, 1), 6)}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
                const headingNode = $createHeadingNode(headingTag);

                // Transfer all children from paragraph to heading
                const children = parent.getChildren();
                for (const child of children) {
                  headingNode.append(child);
                }

                parent.replace(headingNode);
              }
            }
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
      // Handle paragraph breaks by detecting \n\n
      let paragraph = $createParagraphNode();

      // Helper function to find formatting for a given text
      const findFormatting = (text: string) => {
        const formats = { isBold: false, isItalic: false, headingLevel: undefined as number | undefined };
        for (const op of formattingOps) {
          if (text.includes(op.text)) {
            if (op.type === 'bold') formats.isBold = true;
            if (op.type === 'italic') formats.isItalic = true;
            if (op.type === 'heading') formats.headingLevel = op.level;
          }
        }
        return formats;
      };

      mergedDiff.forEach((part) => {
        if (part.type === 'addition') {
          // New text or replacement - check for formatting
          const formatting = findFormatting(part.value);
          const diffNode = $createDiffNode(
            'addition',
            part.value,
            part.original,
            formatting.isBold,
            formatting.isItalic,
            formatting.headingLevel
          );
          paragraph.append(diffNode);
          return;
        }

        if (part.type === 'deletion') {
          const diffNode = $createDiffNode('deletion', part.value, part.original);
          paragraph.append(diffNode);
          return;
        }

        // Unchanged text - preserve paragraph breaks by detecting \n\n
        const paragraphs = part.value.split('\n\n');
        paragraphs.forEach((paraText, paraIndex) => {
          if (paraIndex > 0) {
            // Create new paragraph node for each \n\n
            paragraph = $createParagraphNode();
            root.append(paragraph);
          }

          const lines = paraText.split('\n');
          lines.forEach((line, lineIndex) => {
            if (line) {
              paragraph.append($createTextNode(line));
            }
            if (lineIndex < lines.length - 1) {
              paragraph.append($createTextNode('\n'));
            }
          });
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
