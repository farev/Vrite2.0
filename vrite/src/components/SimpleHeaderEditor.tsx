'use client';

import React, { useState, useRef, useEffect } from 'react';

interface SimpleHeaderEditorProps {
  documentTitle: string;
  headerEnabled: boolean;
  headerContent: string;
  onHeaderChange: (content: string) => void;
  onHeaderToggle: () => void;
}

export function SimpleHeaderEditor({
  documentTitle,
  headerEnabled,
  headerContent,
  onHeaderChange,
  onHeaderToggle,
}: SimpleHeaderEditorProps) {
  const [editing, setEditing] = useState(false);
  const editableRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (editing && editableRef.current) {
      editableRef.current.focus();
      // Select all text
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

  const handleBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    setEditing(false);
    const newText = e.currentTarget.textContent || '';
    if (newText !== headerContent) {
      onHeaderChange(newText);
    }
  };

  const displayContent = headerContent || documentTitle || '';

  return (
    <div
      className={`document-header-editor ${editing ? 'editing' : ''}`}
      onDoubleClick={handleDoubleClick}
    >
      {editing ? (
        <span
          ref={editableRef}
          className="header-content-editable"
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
        <span className="header-display-text">
          {displayContent || 'Double-click to edit header'}
        </span>
      )}
    </div>
  );
}
