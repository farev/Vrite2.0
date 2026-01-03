import type { LexicalEditor } from 'lexical';
import { $convertToMarkdownString, $convertFromMarkdownString, TRANSFORMERS } from '@lexical/markdown';

/**
 * Serialize Lexical editor state to markdown string.
 * Preserves formatting: **bold**, *italic*, # headings, etc.
 */
export function serializeToMarkdown(editor: LexicalEditor): string {
  let markdown = '';

  editor.getEditorState().read(() => {
    markdown = $convertToMarkdownString(TRANSFORMERS);
  });

  return markdown;
}

/**
 * Parse markdown string and apply to Lexical editor.
 * Creates properly formatted nodes (bold, italic, headings, etc.)
 */
export function deserializeFromMarkdown(editor: LexicalEditor, markdown: string): void {
  editor.update(() => {
    $convertFromMarkdownString(markdown, TRANSFORMERS);
  });
}

/**
 * Convert markdown string to plain text (strip markdown syntax).
 * Useful for displaying content without formatting.
 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    // Remove headings
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold
    .replace(/\*\*(.+?)\*\*/g, '$1')
    // Remove italic
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    // Remove strikethrough
    .replace(/~~(.+?)~~/g, '$1')
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`(.+?)`/g, '$1')
    // Remove links
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .trim();
}
