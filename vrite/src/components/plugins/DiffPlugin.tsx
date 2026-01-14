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

// Strip all markdown syntax from text to get plain text for matching
// Handles: **bold**, *italic*, # headings, etc.
function stripMarkdownSyntax(text: string): string {
  let result = text;
  // Remove bold markers (**text** or __text__)
  result = result.replace(/\*\*([^*]+)\*\*/g, '$1');
  result = result.replace(/__([^_]+)__/g, '$1');
  // Remove italic markers (*text* or _text_) - be careful not to match ** or __
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1');
  result = result.replace(/(?<!_)_([^_]+)_(?!_)/g, '$1');
  // Remove heading markers (# at start of line)
  result = result.replace(/^#{1,6}\s+/gm, '');
  return result;
}

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

        // Recursively collect all text nodes from the tree
        const collectTextNodes = (node: LexicalNode): TextNode[] => {
          const textNodes: TextNode[] = [];
          if (node.getType() === 'text') {
            textNodes.push(node as TextNode);
          }
          if ('getChildren' in node && typeof node.getChildren === 'function') {
            const children = node.getChildren() as LexicalNode[];
            for (const child of children) {
              textNodes.push(...collectTextNodes(child));
            }
          }
          return textNodes;
        };

        // For each change, find and replace with DiffNode
        changes.forEach((change) => {
          const { old_text, new_text } = change;

          // Strip markdown syntax from old_text for searching
          // (Lexical text nodes contain plain text, not markdown syntax)
          const plainOldText = stripMarkdownSyntax(old_text);

          // Parse markdown from new_text to get formatting
          const parsed = parseMarkdown(new_text);

          // Re-collect text nodes for each change (since nodes may have been modified)
          const textNodes = collectTextNodes(root);

          console.log('Searching for:', plainOldText.substring(0, 50) + '...', 'in', textNodes.length, 'text nodes');

          // Text may span multiple nodes due to inline formatting (e.g., bold text creates separate nodes)
          // Build a map of cumulative positions to find which nodes contain our match
          let found = false;

          // First, try single-node match (simpler case)
          for (const textNode of textNodes) {
            const nodeText = textNode.getTextContent();
            const matchIndex = nodeText.indexOf(plainOldText);

            if (matchIndex !== -1) {
              console.log('Found single-node match at index:', matchIndex);

              const diffNode = $createDiffNode(
                'addition',
                parsed.text,
                plainOldText,
                parsed.isBold,
                parsed.isItalic,
                parsed.headingLevel
              );

              if (matchIndex === 0 && plainOldText.length === nodeText.length) {
                textNode.replace(diffNode);
              } else {
                const endIndex = matchIndex + plainOldText.length;
                if (endIndex < nodeText.length) {
                  textNode.splitText(endIndex);
                }
                if (matchIndex > 0) {
                  const [, matchNode] = textNode.splitText(matchIndex);
                  if (matchNode) {
                    matchNode.replace(diffNode);
                  }
                } else {
                  textNode.replace(diffNode);
                }
              }
              found = true;
              break;
            }
          }

          // If not found in single node, search across multiple adjacent nodes
          if (!found) {
            console.log('Trying multi-node search...');

            // Group text nodes by their parent (paragraph/heading)
            const nodesByParent = new Map<LexicalNode, TextNode[]>();
            for (const textNode of textNodes) {
              const parent = textNode.getParent();
              if (parent) {
                if (!nodesByParent.has(parent)) {
                  nodesByParent.set(parent, []);
                }
                nodesByParent.get(parent)!.push(textNode);
              }
            }

            // Search within each parent's text nodes
            for (const [parent, nodes] of nodesByParent) {
              // Concatenate text from all nodes in this parent
              const concatenated = nodes.map(n => n.getTextContent()).join('');
              const matchIndex = concatenated.indexOf(plainOldText);

              if (matchIndex !== -1) {
                console.log('Found multi-node match in parent at index:', matchIndex);

                // Find which nodes are affected by this match
                let currentPos = 0;
                let startNodeIndex = -1;
                let endNodeIndex = -1;
                let startOffset = 0;
                let endOffset = 0;

                for (let i = 0; i < nodes.length; i++) {
                  const nodeLen = nodes[i].getTextContent().length;
                  const nodeStart = currentPos;
                  const nodeEnd = currentPos + nodeLen;

                  // Check if match starts in this node
                  if (startNodeIndex === -1 && matchIndex >= nodeStart && matchIndex < nodeEnd) {
                    startNodeIndex = i;
                    startOffset = matchIndex - nodeStart;
                  }

                  // Check if match ends in this node
                  const matchEnd = matchIndex + plainOldText.length;
                  if (matchEnd > nodeStart && matchEnd <= nodeEnd) {
                    endNodeIndex = i;
                    endOffset = matchEnd - nodeStart;
                  }

                  currentPos = nodeEnd;
                }

                if (startNodeIndex !== -1 && endNodeIndex !== -1) {
                  console.log('Match spans nodes', startNodeIndex, 'to', endNodeIndex);

                  // For simplicity, remove all nodes in the match range and insert a diff node
                  const diffNode = $createDiffNode(
                    'addition',
                    parsed.text,
                    plainOldText,
                    parsed.isBold,
                    parsed.isItalic,
                    parsed.headingLevel
                  );

                  // Handle the start node
                  const startNode = nodes[startNodeIndex];
                  const startNodeText = startNode.getTextContent();

                  if (startNodeIndex === endNodeIndex) {
                    // Match is within a single node (shouldn't happen here, but handle it)
                    if (startOffset > 0) {
                      const [, rest] = startNode.splitText(startOffset);
                      if (rest && endOffset < startNodeText.length) {
                        rest.splitText(endOffset - startOffset);
                      }
                      if (rest) rest.replace(diffNode);
                    } else {
                      if (endOffset < startNodeText.length) {
                        startNode.splitText(endOffset);
                      }
                      startNode.replace(diffNode);
                    }
                  } else {
                    // Match spans multiple nodes
                    // 1. Split start node if needed and remove the match portion
                    if (startOffset > 0) {
                      const [, toRemove] = startNode.splitText(startOffset);
                      if (toRemove) toRemove.remove();
                    } else {
                      startNode.remove();
                    }

                    // 2. Remove intermediate nodes
                    for (let i = startNodeIndex + 1; i < endNodeIndex; i++) {
                      nodes[i].remove();
                    }

                    // 3. Handle end node - split if needed and remove match portion
                    const endNode = nodes[endNodeIndex];
                    const endNodeText = endNode.getTextContent();
                    if (endOffset < endNodeText.length) {
                      const [toRemove] = endNode.splitText(endOffset);
                      if (toRemove) toRemove.replace(diffNode);
                    } else {
                      endNode.replace(diffNode);
                    }
                  }

                  found = true;
                  break;
                }
              }
            }
          }

          if (!found) {
            console.log('Could not find match for:', plainOldText.substring(0, 50) + '...');
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
