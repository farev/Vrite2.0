'use client';

import React, { useState } from 'react';
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
  showPageNumbers?: boolean;
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
  showPageNumbers = false,
}: SimpleFooterEditorProps) {
  const [forceEdit, setForceEdit] = useState(false);

  return (
    <div
      className="document-footer-editor"
      onDoubleClick={() => setForceEdit(true)}
    >
      <HeaderFooterRichEditor
        initialState={footerEditorState}
        placeholder=""
        label="Footer"
        onStateChange={onFooterChange}
        onEditorFocus={onEditorFocus}
        onEditorBlur={onEditorBlur}
        onEditingChange={(editing) => {
          if (!editing) setForceEdit(false);
          onEditingChange?.(editing);
        }}
        forceEdit={forceEdit}
      />
      {showPageNumbers && (
        <div className="page-break-page-number" aria-label={`Page ${pageCount} of ${pageCount}`}>
          {pageCount} of {pageCount}
        </div>
      )}
    </div>
  );
}
