'use client';

import React from 'react';
import type { LexicalEditor } from 'lexical';
import { HeaderFooterRichEditor } from './HeaderFooterRichEditor';

interface SimpleHeaderEditorProps {
  documentTitle: string;
  headerEnabled: boolean;
  headerEditorState: string | null;
  onHeaderChange: (stateJSON: string) => void;
  onHeaderToggle: () => void;
  onEditorFocus?: (editor: LexicalEditor) => void;
  onEditorBlur?: () => void;
  onEditingChange?: (editing: boolean) => void;
}

export function SimpleHeaderEditor({
  documentTitle,
  headerEnabled,
  headerEditorState,
  onHeaderChange,
  onHeaderToggle,
  onEditorFocus,
  onEditorBlur,
  onEditingChange,
}: SimpleHeaderEditorProps) {
  return (
    <div className="document-header-editor">
      <HeaderFooterRichEditor
        initialState={headerEditorState}
        placeholder=""
        label="Header"
        onStateChange={onHeaderChange}
        onEditorFocus={onEditorFocus}
        onEditorBlur={onEditorBlur}
        onEditingChange={onEditingChange}
      />
    </div>
  );
}
