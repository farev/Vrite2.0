'use client';

import React, { useState, useRef, useEffect } from 'react';

interface HeaderFooterSettings {
  headerEnabled: boolean;
  headerContent: string;
  footerEnabled: boolean;
  footerShowPageNumber: boolean;
}

interface HeaderFooterEditorProps {
  documentTitle: string;
  pageCount: number;
  settings: HeaderFooterSettings;
  onSettingsChange: (settings: HeaderFooterSettings) => void;
}

/**
 * HeaderFooterEditor - Simple header/footer areas at top/bottom of document
 * Double-click to edit, applies to all pages
 */
export function HeaderFooterEditor({
  documentTitle,
  pageCount,
  settings,
  onSettingsChange,
}: HeaderFooterEditorProps) {
  const [editingHeader, setEditingHeader] = useState(false);
  const headerInputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingHeader && headerInputRef.current) {
      headerInputRef.current.focus();
      headerInputRef.current.select();
    }
  }, [editingHeader]);

  const handleHeaderDoubleClick = () => {
    setEditingHeader(true);
    if (!settings.headerEnabled) {
      onSettingsChange({ ...settings, headerEnabled: true });
    }
  };

  const handleHeaderBlur = () => {
    setEditingHeader(false);
  };

  const handleHeaderChange = (value: string) => {
    onSettingsChange({ ...settings, headerContent: value });
  };

  const toggleHeader = () => {
    onSettingsChange({ ...settings, headerEnabled: !settings.headerEnabled });
  };

  const toggleFooter = () => {
    onSettingsChange({ ...settings, footerEnabled: !settings.footerEnabled });
  };

  return (
    <>
      {/* Header */}
      <div
        className={`document-header-editor ${settings.headerEnabled ? 'enabled' : 'disabled'}`}
        onDoubleClick={handleHeaderDoubleClick}
        title="Double-click to edit header"
      >
        {editingHeader ? (
          <div className="header-edit-mode">
            <input
              ref={headerInputRef}
              type="text"
              value={settings.headerContent}
              onChange={(e) => handleHeaderChange(e.target.value)}
              onBlur={handleHeaderBlur}
              className="header-footer-input"
              placeholder="Header text (appears on all pages)"
            />
            <button
              className="header-toggle-btn"
              onClick={toggleHeader}
              title={settings.headerEnabled ? 'Disable header' : 'Enable header'}
            >
              {settings.headerEnabled ? '✓' : '+'}
            </button>
          </div>
        ) : (
          <div className="header-display-mode">
            {settings.headerEnabled ? (
              <span className="header-text">{settings.headerContent || documentTitle}</span>
            ) : (
              <span className="header-placeholder">Double-click to add header</span>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className={`document-footer-editor ${settings.footerEnabled ? 'enabled' : 'disabled'}`}
        onDoubleClick={toggleFooter}
        title="Double-click to toggle footer"
      >
        {settings.footerEnabled && settings.footerShowPageNumber ? (
          <span className="footer-text">Page numbers will appear here (Page 1, Page 2, ...)</span>
        ) : (
          <span className="footer-placeholder">Double-click to add footer</span>
        )}
      </div>
    </>
  );
}
