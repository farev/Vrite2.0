'use client';

import React, { useState, useRef, useEffect } from 'react';

interface SimpleFooterEditorProps {
  pageCount: number;
  footerEnabled: boolean;
  footerShowPageNumber: boolean;
  onFooterToggle: () => void;
}

export function SimpleFooterEditor({
  pageCount,
  footerEnabled,
  footerShowPageNumber,
  onFooterToggle,
}: SimpleFooterEditorProps) {
  const [editing, setEditing] = useState(false);
  const editableRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (editing && editableRef.current) {
      editableRef.current.focus();
      const range = document.createRange();
      range.selectNodeContents(editableRef.current);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editing]);

  const handleDoubleClick = () => {
    setEditing(true);
  };

  const handleBlur = () => {
    setEditing(false);
  };

  const displayContent = footerShowPageNumber ? `Page ${pageCount}` : '';

  return (
    <div
      className={`document-footer-editor ${editing ? 'editing' : ''}`}
      onDoubleClick={handleDoubleClick}
    >
      {editing ? (
        <span
          ref={editableRef}
          className="footer-content-editable"
          contentEditable
          suppressContentEditableWarning
          onBlur={handleBlur}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLElement).blur();
            }
          }}
        >
          {displayContent}
        </span>
      ) : (
        <span className="footer-display-text">
          {displayContent || 'Double-click to edit footer'}
        </span>
      )}
    </div>
  );
}
