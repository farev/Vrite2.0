'use client';

import { useEffect, useCallback } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getRoot,
  $createTextNode,
  $getNodeByKey,
  type NodeKey,
  type LexicalNode,
  type TextNode,
} from 'lexical';
import { $convertFromMarkdownString, $convertToMarkdownString, TRANSFORMERS } from '@lexical/markdown';
import { DiffNode, $createDiffNode, $isDiffNode } from '../nodes/DiffNode';
import { parseMarkdown } from '@/lib/markdownParser';

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
      // Serialize current editor state to markdown (preserves formatting)
      const markdownContent = $convertToMarkdownString(TRANSFORMERS);
      onAllResolved(markdownContent);
    }
  }, [onAllResolved]);

  // Handle accepting a diff node
  const handleAccept = useCallback(
    (nodeKey: NodeKey) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isDiffNode(node)) {
          const text = node.getText();
          const nodeData = node.exportJSON();

          // Create formatted text node
          const textNode = $createTextNode(text);

          // Apply formatting
          if (nodeData.isBold) {
            textNode.toggleFormat('bold');
          }
          if (nodeData.isItalic) {
            textNode.toggleFormat('italic');
          }

          node.replace(textNode);
        }

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
          const originalText = node.getOriginalText();

          if (originalText) {
            const textNode = $createTextNode(originalText);
            node.replace(textNode);
          } else {
            node.remove();
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

  // Apply changes with inline diffs
  useEffect(() => {
    if (originalContent === null || suggestedContent === null) {
      return;
    }

    editor.update(() => {
      const root = $getRoot();
      root.clear();

      // First, apply original content to get baseline
      $convertFromMarkdownString(originalContent, TRANSFORMERS);

      // Get the changes from the backend (stored in window)
      const changes = (window as unknown as Record<string, unknown>).__vriteChanges as Array<{old_text: string, new_text: string}> | undefined;

      if (changes && changes.length > 0) {
        console.log('Applying inline diffs for changes:', changes);

        // Walk through all text nodes and find matches for old_text
        const textNodes: TextNode[] = [];
        root.getChildren().forEach((child) => {
          if ('getChildren' in child && typeof child.getChildren === 'function') {
            const descendants = child.getChildren() as LexicalNode[];
            descendants.forEach((desc) => {
              if (desc.getType() === 'text') {
                textNodes.push(desc as TextNode);
              }
            });
          }
        });

        // For each change, find and replace with DiffNode
        changes.forEach((change) => {
          const { old_text, new_text } = change;

          // Parse markdown from new_text to get formatting
          const parsed = parseMarkdown(new_text);

          // Find text node containing old_text
          for (const textNode of textNodes) {
            const nodeText = textNode.getTextContent();
            if (nodeText.includes(old_text)) {
              // Create a diff node showing the formatted change
              const diffNode = $createDiffNode(
                'addition',
                parsed.text,
                old_text,
                parsed.isBold,
                parsed.isItalic,
                parsed.headingLevel
              );

              // Replace the text node with diff node
              textNode.replace(diffNode);
              break;
            }
          }
        });
      } else {
        // No specific changes, just apply suggested content
        root.clear();
        $convertFromMarkdownString(suggestedContent, TRANSFORMERS);
      }

      console.log('Applied changes with inline diffs');

      if (onDiffComplete) {
        onDiffComplete();
      }
    });
  }, [editor, originalContent, suggestedContent, onDiffComplete]);

  return null;
}
