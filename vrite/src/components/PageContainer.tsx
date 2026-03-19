'use client';

import React from 'react';

interface PageContainerProps {
  pageNumber: number;
  pageHeight: number;
  pageWidth: number;
  margins: { top: number; right: number; bottom: number; left: number };
  children?: React.ReactNode;
  showHeader?: boolean;
  showFooter?: boolean;
  headerContent?: React.ReactNode;
  footerContent?: React.ReactNode;
}

/**
 * PageContainer - Represents a single visual page in the document
 * This creates the visual appearance of a page (white background, shadow, borders)
 * while the actual content is rendered in an overlay ContentEditable
 */
export function PageContainer({
  pageNumber,
  pageHeight,
  pageWidth,
  margins,
  children,
  showHeader = false,
  showFooter = false,
  headerContent,
  footerContent,
}: PageContainerProps) {
  return (
    <div
      className="document-page"
      data-page-number={pageNumber}
      style={{
        width: `${pageWidth}px`,
        height: `${pageHeight}px`,
        marginBottom: '24px', // page gap
      }}
    >
      {showHeader && (
        <div
          className="document-page-header"
          style={{
            height: `${margins.top}px`,
            paddingLeft: `${margins.left}px`,
            paddingRight: `${margins.right}px`,
          }}
        >
          {headerContent}
        </div>
      )}

      <div
        className="document-page-content-area"
        style={{
          marginTop: `${margins.top}px`,
          marginLeft: `${margins.left}px`,
          marginRight: `${margins.right}px`,
          marginBottom: `${margins.bottom}px`,
        }}
      >
        {children}
      </div>

      {showFooter && (
        <div
          className="document-page-footer"
          style={{
            height: `${margins.bottom}px`,
            paddingLeft: `${margins.left}px`,
            paddingRight: `${margins.right}px`,
          }}
        >
          {footerContent}
        </div>
      )}
    </div>
  );
}
