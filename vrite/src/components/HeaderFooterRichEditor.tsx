'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { LexicalEditor } from 'lexical';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ListItemNode, ListNode } from '@lexical/list';
import { LinkNode } from '@lexical/link';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { TableNode, TableCellNode, TableRowNode } from '@lexical/table';
import { CodeNode, CodeHighlightNode } from '@lexical/code';
import { EquationNode } from './nodes/EquationNode';

const hfTheme = {
  root: 'hf-editor-root',
  paragraph: 'hf-paragraph',
  heading: {
    h1: 'document-h1',
    h2: 'document-h2',
    h3: 'document-h3',
  },
  list: {
    nested: { listitem: 'document-nested-listitem' },
    ol: 'document-list-ol',
    ul: 'document-list-ul',
    listitem: 'document-listitem',
  },
  link: 'document-link',
  text: {
    bold: 'document-text-bold',
    italic: 'document-text-italic',
    underline: 'document-text-underline',
  },
};

interface HeaderFooterRichEditorProps {
  initialState?: string | null;
  placeholder?: string;
  label?: string; // "Header" or "Footer" badge text
  onStateChange?: (stateJSON: string) => void;
  onEditorFocus?: (editor: LexicalEditor) => void;
  onEditorBlur?: () => void;
  onEditingChange?: (editing: boolean) => void;
  className?: string;
}

function EditorBridge({
  initialState,
  isEditing,
  onStateChange,
  onEditorFocus,
  onEditorBlur,
}: {
  initialState?: string | null;
  isEditing: boolean;
  onStateChange?: (stateJSON: string) => void;
  onEditorFocus?: (editor: LexicalEditor) => void;
  onEditorBlur?: () => void;
}) {
  const [editor] = useLexicalComposerContext();
  const hasInitialized = useRef(false);

  // Load initial state once
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    if (initialState) {
      try {
        const parsed = editor.parseEditorState(initialState);
        editor.setEditorState(parsed);
      } catch {
        // If parsing fails, leave editor with default empty state
      }
    }
  }, [editor, initialState]);

  // Toggle editable mode
  useEffect(() => {
    editor.setEditable(isEditing);
  }, [editor, isEditing]);

  // Handle focus when entering edit mode
  useEffect(() => {
    if (isEditing) {
      const t = setTimeout(() => {
        editor.focus();
      }, 10);
      return () => clearTimeout(t);
    }
  }, [editor, isEditing]);

  // Save state on blur — but NOT if focus is going to the toolbar
  useEffect(() => {
    const rootEl = editor.getRootElement();
    if (!rootEl) return;

    const handleBlur = (e: FocusEvent) => {
      const relatedTarget = e.relatedTarget as HTMLElement | null;

      // Don't treat as blur if focus is moving to the toolbar
      // (toolbar uses preventDefault on mousedown, so relatedTarget is usually null)
      if (relatedTarget) {
        // If focus moves within the same wrapper, ignore
        if (rootEl.closest('.hf-rich-editor-wrapper')?.contains(relatedTarget)) {
          return;
        }
        // If focus moves to the formatting toolbar, ignore
        if (relatedTarget.closest('.formatting-toolbar')) {
          return;
        }
      }

      const stateJSON = JSON.stringify(editor.getEditorState().toJSON());
      onStateChange?.(stateJSON);
      onEditorBlur?.();
    };

    rootEl.addEventListener('blur', handleBlur, true);
    return () => rootEl.removeEventListener('blur', handleBlur, true);
  }, [editor, onStateChange, onEditorBlur]);

  // Notify parent on focus so toolbar can target this editor
  useEffect(() => {
    if (isEditing) {
      onEditorFocus?.(editor);
    }
  }, [editor, isEditing, onEditorFocus]);

  // Handle Escape key to exit editing; stop propagation so main editor doesn't capture
  useEffect(() => {
    const rootEl = editor.getRootElement();
    if (!rootEl || !isEditing) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        const stateJSON = JSON.stringify(editor.getEditorState().toJSON());
        onStateChange?.(stateJSON);
        onEditorBlur?.();
      }
      e.stopPropagation();
    };

    rootEl.addEventListener('keydown', handleKeyDown);
    return () => rootEl.removeEventListener('keydown', handleKeyDown);
  }, [editor, isEditing, onStateChange, onEditorBlur]);

  return (
    <>
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            className="hf-content-editable"
            spellCheck="true"
          />
        }
        placeholder={null}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <HistoryPlugin />
      <ListPlugin />
      <LinkPlugin />
    </>
  );
}

export function HeaderFooterRichEditor({
  initialState,
  placeholder,
  label,
  onStateChange,
  onEditorFocus,
  onEditorBlur,
  onEditingChange,
  className,
}: HeaderFooterRichEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Double-click to enter editing
  const handleDoubleClick = useCallback(() => {
    if (!isEditing) {
      setIsEditing(true);
      onEditingChange?.(true);
    }
  }, [isEditing, onEditingChange]);

  const handleEditorBlur = useCallback(() => {
    setIsEditing(false);
    onEditingChange?.(false);
    onEditorBlur?.();
  }, [onEditorBlur, onEditingChange]);

  const handleEditorFocus = useCallback((editor: LexicalEditor) => {
    onEditorFocus?.(editor);
  }, [onEditorFocus]);

  // Click outside detection — exclude the toolbar
  useEffect(() => {
    if (!isEditing) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Don't close if clicking on the toolbar
      if (target.closest('.formatting-toolbar')) {
        return;
      }

      if (wrapperRef.current && !wrapperRef.current.contains(target)) {
        // Save state before exiting
        setIsEditing(false);
        onEditingChange?.(false);
        onEditorBlur?.();
      }
    };

    // Small delay so the current click event doesn't immediately close
    const t = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true);
    }, 0);

    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [isEditing, onEditorBlur, onEditingChange]);

  const initialConfig = {
    namespace: 'HeaderFooterEditor',
    theme: hfTheme,
    onError: (error: Error) => console.error('[HF Editor]', error),
    editable: false,
    nodes: [
      HeadingNode,
      ListNode,
      ListItemNode,
      QuoteNode,
      CodeNode,
      CodeHighlightNode,
      TableNode,
      TableCellNode,
      TableRowNode,
      LinkNode,
      EquationNode,
    ],
  };

  const isFooter = label?.toLowerCase() === 'footer';

  const separatorEl = isEditing && (
    <div className="hf-separator">
      <span className="hf-badge">{label || 'Header'}</span>
      <div className="hf-separator-line" />
    </div>
  );

  return (
    <div
      ref={wrapperRef}
      className={`hf-rich-editor-wrapper ${isEditing ? 'hf-editing' : ''} ${className || ''}`}
      onDoubleClick={handleDoubleClick}
      onMouseDown={(e) => {
        if (isEditing) {
          e.stopPropagation();
        }
      }}
    >
      {/* Footer: separator goes above the text */}
      {isFooter && separatorEl}

      <div className="hf-editor-area">
        <LexicalComposer initialConfig={initialConfig}>
          <EditorBridge
            initialState={initialState}
            isEditing={isEditing}
            onStateChange={onStateChange}
            onEditorFocus={handleEditorFocus}
            onEditorBlur={handleEditorBlur}
          />
        </LexicalComposer>
        {!isEditing && !initialState && placeholder && (
          <div className="hf-placeholder">{placeholder}</div>
        )}
      </div>

      {/* Header: separator goes below the text */}
      {!isFooter && separatorEl}
    </div>
  );
}
