'use client';

import React, { useState, useRef, useEffect } from 'react';

interface HeaderFooterSettings {
  headerEnabled: boolean;
  headerContent: string;
  footerEnabled: boolean;
  footerShowPageNumber: boolean;
}

interface HeaderFooterOverlayProps {
  pageCount: number;
  pageHeight: number;
  pageWidth: number;
  margins: { top: number; right: number; bottom: number; left: number };
  documentTitle: string;
  settings: HeaderFooterSettings;
  onSettingsChange: (settings: HeaderFooterSettings) => void;
}

/**
 * HeaderFooterOverlay - Renders headers and footers at page intervals
 * Supports double-click editing like Google Docs
 */
export function HeaderFooterOverlay({
  pageCount,
  pageHeight,
  pageWidth,
  margins,
  documentTitle,
  settings,
  onSettingsChange,
}: HeaderFooterOverlayProps) {
  const [editingHeader, setEditingHeader] = useState<number | null>(null);
  const [editingFooter, setEditingFooter] = useState<number | null>(null);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const footerInputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingHeader !== null && headerInputRef.current) {
      headerInputRef.current.focus();
      headerInputRef.current.select();
    }
  }, [editingHeader]);

  useEffect(() => {
    if (editingFooter !== null && footerInputRef.current) {
      footerInputRef.current.focus();
      footerInputRef.current.select();
    }
  }, [editingFooter]);

  const handleHeaderDoubleClick = (pageNumber: number) => {
    setEditingHeader(pageNumber);
    if (!settings.headerEnabled) {
      onSettingsChange({ ...settings, headerEnabled: true });
    }
  };

  const handleFooterDoubleClick = (pageNumber: number) => {
    setEditingFooter(pageNumber);
    if (!settings.footerEnabled) {
      onSettingsChange({ ...settings, footerEnabled: true });
    }
  };

  const handleHeaderBlur = () => {
    setEditingHeader(null);
  };

  const handleFooterBlur = () => {
    setEditingFooter(null);
  };

  const handleHeaderChange = (value: string) => {
    onSettingsChange({ ...settings, headerContent: value });
  };

  return (
    <div className="header-footer-overlay">
      {Array.from({ length: pageCount }).map((_, idx) => {
        const pageNumber = idx + 1;
        const pageTop = idx * (pageHeight + 24); // 24px page gap

        return (
          <React.Fragment key={pageNumber}>
            {/* Header */}
            {settings.headerEnabled && (
              <div
                className="page-header-overlay"
                style={{
                  position: 'absolute',
                  top: `${pageTop}px`,
                  left: `${margins.left}px`,
                  right: `${margins.right}px`,
                  height: `${margins.top}px`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: '1px solid #e5e7eb',
                  cursor: editingHeader === pageNumber ? 'text' : 'pointer',
                  backgroundColor: 'white',
                  zIndex: 10,
                }}
                onDoubleClick={() => handleHeaderDoubleClick(pageNumber)}
              >
                {editingHeader === pageNumber ? (
                  <input
                    ref={headerInputRef}
                    type="text"
                    value={settings.headerContent}
                    onChange={(e) => handleHeaderChange(e.target.value)}
                    onBlur={handleHeaderBlur}
                    className="header-footer-input"
                    placeholder="Header text"
                  />
                ) : (
                  <div className="header-content">
                    <span className="header-title">{settings.headerContent || documentTitle}</span>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            {settings.footerEnabled && (
              <div
                className="page-footer-overlay"
                style={{
                  position: 'absolute',
                  top: `${pageTop + pageHeight - margins.bottom}px`,
                  left: `${margins.left}px`,
                  right: `${margins.right}px`,
                  height: `${margins.bottom}px`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '8px 0',
                  borderTop: '1px solid #e5e7eb',
                  cursor: editingFooter === pageNumber ? 'text' : 'pointer',
                  backgroundColor: 'white',
                  zIndex: 10,
                }}
                onDoubleClick={() => handleFooterDoubleClick(pageNumber)}
              >
                {editingFooter === pageNumber ? (
                  <input
                    ref={footerInputRef}
                    type="text"
                    value={settings.footerShowPageNumber ? `Page ${pageNumber} of ${pageCount}` : ''}
                    readOnly
                    onBlur={handleFooterBlur}
                    className="header-footer-input"
                  />
                ) : (
                  <div className="footer-content">
                    {settings.footerShowPageNumber && (
                      <span className="page-number">Page {pageNumber} of {pageCount}</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
