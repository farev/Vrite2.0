'use client';

import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
} from '@lexical/markdown';
import type { LexicalEditor } from 'lexical';

/**
 * MarkdownPlugin - Enables markdown shortcuts and transformations
 */
export default function MarkdownPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Register markdown transformers for shortcuts
    // This enables typing things like:
    // - "# " for heading 1
    // - "## " for heading 2
    // - "- " or "* " for bullet lists
    // - "1. " for numbered lists
    // - "**text**" for bold
    // - "*text*" for italic
    // - "`code`" for inline code
    // - "---" for horizontal rule
    
    // The transformers are automatically applied by Lexical's markdown plugin
    // when used with the MarkdownShortcutPlugin from @lexical/react
    
    return () => {
      // Cleanup if needed
    };
  }, [editor]);

  return null;
}

/**
 * Export current editor content as markdown
 */
export function exportAsMarkdown(editor: LexicalEditor): string {
  let markdown = '';
  editor.getEditorState().read(() => {
    markdown = $convertToMarkdownString(TRANSFORMERS);
  });
  return markdown;
}

/**
 * Import markdown content into editor
 */
export function importMarkdown(editor: LexicalEditor, markdown: string): void {
  editor.update(() => {
    $convertFromMarkdownString(markdown, TRANSFORMERS);
  });
}

