import {
  $getRoot,
  $createTextNode,
  $createParagraphNode,
  $isTextNode,
  type LexicalEditor,
  type LexicalNode,
  type TextNode,
} from 'lexical';
import { $createHeadingNode, $isHeadingNode, type HeadingTagType } from '@lexical/rich-text';
import type { FormattingOperation } from './deltaApplicator';

export class FormattingApplicator {
  /**
   * Strip formatting markers from content.
   * Markers like [BOLD:text], [ITALIC:text], [HEADING1:text] are removed.
   */
  static stripMarkers(content: string): string {
    // Remove all formatting markers, keeping just the text inside
    return content
      .replace(/\[BOLD:(.*?)\]/g, '$1')
      .replace(/\[ITALIC:(.*?)\]/g, '$1')
      .replace(/\[HEADING[1-3]:(.*?)\]/g, '$1');
  }

  /**
   * Apply formatting operations to the Lexical editor.
   * Should be called after diff changes are accepted.
   */
  static applyFormatting(editor: LexicalEditor, operations: FormattingOperation[]): void {
    if (operations.length === 0) {
      return;
    }

    editor.update(() => {
      // First, strip all formatting markers from the content
      const root = $getRoot();
      const textContent = root.getTextContent();
      const cleanedContent = this.stripMarkers(textContent);

      // If markers were present, update the content
      if (textContent !== cleanedContent) {
        root.clear();
        const paragraphs = cleanedContent.split('\n\n');
        paragraphs.forEach((paraText) => {
          const paragraph = $createParagraphNode();
          const lines = paraText.split('\n');
          lines.forEach((line, index) => {
            if (line) {
              paragraph.append($createTextNode(line));
            }
            if (index < lines.length - 1) {
              paragraph.append($createTextNode('\n'));
            }
          });
          root.append(paragraph);
        });
      }

      // Now apply formatting to the cleaned content
      for (const op of operations) {
        console.log(`Applying ${op.type} formatting to: "${op.text.substring(0, 30)}..."`);

        switch (op.type) {
          case 'bold':
            this.applyBoldToText(op.text);
            break;
          case 'italic':
            this.applyItalicToText(op.text);
            break;
          case 'heading':
            this.applyHeadingToText(op.text, op.level || 1);
            break;
        }
      }
    });
  }

  private static applyBoldToText(targetText: string): void {
    const root = $getRoot();
    const textNodes = this.findTextNodes(root, targetText);

    for (const node of textNodes) {
      if ($isTextNode(node)) {
        node.toggleFormat('bold');
      }
    }
  }

  private static applyItalicToText(targetText: string): void {
    const root = $getRoot();
    const textNodes = this.findTextNodes(root, targetText);

    for (const node of textNodes) {
      if ($isTextNode(node)) {
        node.toggleFormat('italic');
      }
    }
  }

  private static applyHeadingToText(targetText: string, level: number): void {
    const root = $getRoot();
    const nodes = this.findNodesContainingText(root, targetText);

    for (const node of nodes) {
      // Find the parent paragraph/heading node
      let parent = node.getParent();

      while (parent && !parent.isRootNode()) {
        if (parent.getType() === 'paragraph' || $isHeadingNode(parent)) {
          // Convert to heading
          const headingTag = `h${Math.min(Math.max(level, 1), 6)}` as HeadingTagType;
          const headingNode = $createHeadingNode(headingTag);

          // Transfer children
          const children = parent.getChildren();
          for (const child of children) {
            headingNode.append(child);
          }

          parent.replace(headingNode);
          break;
        }
        parent = parent.getParent();
      }
    }
  }

  /**
   * Find text nodes that contain the target text.
   * Handles cases where the text might be split across multiple nodes.
   */
  private static findTextNodes(node: LexicalNode, targetText: string): TextNode[] {
    const results: TextNode[] = [];

    const traverse = (currentNode: LexicalNode, accumulatedText: string = ''): void => {
      if ($isTextNode(currentNode)) {
        const nodeText = currentNode.getTextContent();
        const combined = accumulatedText + nodeText;

        if (combined.includes(targetText)) {
          results.push(currentNode as TextNode);
        } else if (targetText.startsWith(combined)) {
          // Partial match, continue accumulating
          const siblings = currentNode.getNextSiblings();
          for (const sibling of siblings) {
            traverse(sibling, combined);
          }
        }
      }

      if ('getChildren' in currentNode && typeof currentNode.getChildren === 'function') {
        const children = currentNode.getChildren() as LexicalNode[];
        for (const child of children) {
          traverse(child);
        }
      }
    };

    traverse(node);
    return results;
  }

  /**
   * Find any nodes (text or element) that contain the target text.
   */
  private static findNodesContainingText(node: LexicalNode, targetText: string): LexicalNode[] {
    const results: LexicalNode[] = [];

    const traverse = (currentNode: LexicalNode): void => {
      const nodeText = currentNode.getTextContent();

      if (nodeText.includes(targetText)) {
        results.push(currentNode);
      }

      if ('getChildren' in currentNode && typeof currentNode.getChildren === 'function') {
        const children = currentNode.getChildren() as LexicalNode[];
        for (const child of children) {
          traverse(child);
        }
      }
    };

    traverse(node);
    return results;
  }
}
