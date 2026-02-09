'use client';

import React from 'react';

interface PageHeaderProps {
  pageNumber: number;
  totalPages: number;
  documentTitle?: string;
}

/**
 * PageHeader - Displayed at the top of each page
 * Shows document title and/or page number
 */
export function PageHeader({ pageNumber, totalPages, documentTitle }: PageHeaderProps) {
  return (
    <div className="page-header">
      <span className="header-title">{documentTitle || 'Untitled Document'}</span>
    </div>
  );
}
