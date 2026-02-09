'use client';

import React from 'react';

interface PageFooterProps {
  pageNumber: number;
  totalPages: number;
}

/**
 * PageFooter - Displayed at the bottom of each page
 * Shows page number in "Page X of Y" format
 */
export function PageFooter({ pageNumber, totalPages }: PageFooterProps) {
  return (
    <div className="page-footer">
      <span className="page-number">Page {pageNumber} of {totalPages}</span>
    </div>
  );
}
