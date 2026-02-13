'use client';

import React from 'react';
import type { LexicalEditor } from 'lexical';
import { HeaderFooterRichEditor } from './HeaderFooterRichEditor';

interface SimpleFooterEditorProps {
  pageCount: number;
  footerEnabled: boolean;
  footerShowPageNumber: boolean;
  footerEditorState: string | null;
  onFooterChange?: (stateJSON: string) => void;
  onFooterToggle: () => void;
  onEditorFocus?: (editor: LexicalEditor) => void;
  onEditorBlur?: () => void;
  onEditingChange?: (editing: boolean) => void;
}

export function SimpleFooterEditor({
  pageCount,
  footerEnabled,
  footerShowPageNumber,
  footerEditorState,
  onFooterChange,
  onFooterToggle,
  onEditorFocus,
  onEditorBlur,
  onEditingChange,
}: SimpleFooterEditorProps) {
  const defaultPlaceholder = footerShowPageNumber
    ? `Page ${pageCount}`
    : 'Double-click to edit footer';

  return (
    <div className="document-footer-editor">
      <HeaderFooterRichEditor
        initialState={footerEditorState}
        placeholder={defaultPlaceholder}
        label="Footer"
        onStateChange={onFooterChange}
        onEditorFocus={onEditorFocus}
        onEditorBlur={onEditorBlur}
        onEditingChange={onEditingChange}
      />
    </div>
  );
}
