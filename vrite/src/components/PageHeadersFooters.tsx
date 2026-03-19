'use client';

import React, { useState } from 'react';

interface PageHeadersFootersProps {
  pageCount: number;
  pageHeight: number;
  pageGap: number;
  margins: {
    top: number;
    bottom: number;
  };
  headerEnabled?: boolean;
  footerEnabled?: boolean;
  onHeaderChange?: (text: string) => void;
  onFooterChange?: (text: string) => void;
  headerText?: string;
  footerText?: string;
  showPageNumbers?: boolean;
}

export function PageHeadersFooters({
  pageCount,
  pageHeight,
  pageGap,
  margins,
  headerEnabled = true,
  footerEnabled = true,
  onHeaderChange,
  onFooterChange,
  headerText = '',
  footerText = '',
  showPageNumbers = true,
}: PageHeadersFootersProps) {
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [isEditingFooter, setIsEditingFooter] = useState(false);

  const handleHeaderEdit = (e: React.FocusEvent<HTMLDivElement>) => {
    const newText = e.currentTarget.textContent || '';
    onHeaderChange?.(newText);
    setIsEditingHeader(false);
  };

  const handleFooterEdit = (e: React.FocusEvent<HTMLDivElement>) => {
    const newText = e.currentTarget.textContent || '';
    onFooterChange?.(newText);
    setIsEditingFooter(false);
  };

  // Calculate positions for each page
  const pages = Array.from({ length: pageCount }, (_, index) => {
    const pageNumber = index + 1;
    const pageTop = index * (pageHeight + pageGap);
    const headerTop = pageTop;
    const footerTop = pageTop + pageHeight - margins.bottom;

    return { pageNumber, headerTop, footerTop };
  });

  return (
    <div className="page-headers-footers-overlay">
      {pages.map(({ pageNumber, headerTop, footerTop }) => (
        <React.Fragment key={pageNumber}>
          {/* Header for this page */}
          {headerEnabled && (
            <div
              className="page-header-overlay"
              style={{
                top: `${headerTop}px`,
                height: `${margins.top}px`,
              }}
            >
              <div
                className="page-header-content-editable"
                contentEditable
                suppressContentEditableWarning
                onFocus={() => setIsEditingHeader(true)}
                onBlur={handleHeaderEdit}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    (e.target as HTMLElement).blur();
                  }
                }}
              >
                {headerText || (showPageNumbers ? `Page ${pageNumber}` : 'Click to edit header')}
              </div>
            </div>
          )}

          {/* Footer for this page */}
          {footerEnabled && (
            <div
              className="page-footer-overlay"
              style={{
                top: `${footerTop}px`,
                height: `${margins.bottom}px`,
              }}
            >
              <div
                className="page-footer-content-editable"
                contentEditable
                suppressContentEditableWarning
                onFocus={() => setIsEditingFooter(true)}
                onBlur={handleFooterEdit}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    (e.target as HTMLElement).blur();
                  }
                }}
              >
                {footerText || (showPageNumbers ? `Page ${pageNumber}` : 'Click to edit footer')}
              </div>
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
