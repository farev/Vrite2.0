'use client';

import React, { useState, useRef, useEffect, type JSX } from 'react';
import type {
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical';
import { DecoratorNode } from 'lexical';

export type SerializedPageBreakNode = Spread<
  {
    height: number;
    pageNumber: number;
    footerText?: string;
    headerText?: string;
    showPageNumbers?: boolean;
  },
  SerializedLexicalNode
>;

// Component with double-click to edit UX
function PageBreakComponent({
  height,
  whiteSpace,
  footerHeight,
  headerHeight,
  pageGap,
  currentPage,
  nextPage,
  footerContent,
  headerContent,
  onFooterEdit,
  onHeaderEdit,
}: {
  height: number;
  whiteSpace: number;
  footerHeight: number;
  headerHeight: number;
  pageGap: number;
  currentPage: number;
  nextPage: number;
  footerContent: string;
  headerContent: string;
  onFooterEdit: (e: React.FocusEvent<HTMLSpanElement>) => void;
  onHeaderEdit: (e: React.FocusEvent<HTMLSpanElement>) => void;
}) {
  const [editingFooter, setEditingFooter] = useState(false);
  const [editingHeader, setEditingHeader] = useState(false);
  const footerRef = useRef<HTMLSpanElement>(null);
  const headerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (editingFooter && footerRef.current) {
      footerRef.current.focus();
      const range = document.createRange();
      range.selectNodeContents(footerRef.current);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editingFooter]);

  useEffect(() => {
    if (editingHeader && headerRef.current) {
      headerRef.current.focus();
      const range = document.createRange();
      range.selectNodeContents(headerRef.current);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editingHeader]);

  return (
    <div
      className="page-break-container"
      style={{ height: `${height}px` }}
      data-page-break-height={height}
      data-page-from={currentPage}
      data-page-to={nextPage}
    >
      {/* White space - remaining space on current page */}
      <div
        className="page-break-top"
        style={{ height: `${whiteSpace}px` }}
      />

      {/* Footer - end of current page (page N) */}
      <div
        className={`page-break-footer ${editingFooter ? 'editing' : ''}`}
        style={{ height: `${footerHeight}px` }}
        onDoubleClick={() => setEditingFooter(true)}
      >
        {editingFooter ? (
          <span
            ref={footerRef}
            className="page-footer-content editing"
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => {
              setEditingFooter(false);
              onFooterEdit(e);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.target as HTMLElement).blur();
              }
            }}
          >
            {footerContent}
          </span>
        ) : (
          <span className="page-footer-display">
            {footerContent || 'Double-click to edit footer'}
          </span>
        )}
      </div>

      {/* Gray gap - visual page separation (24px) */}
      <div
        className="page-break-gap"
        style={{ height: `${pageGap}px` }}
      />

      {/* Header - start of next page (page N+1) */}
      <div
        className={`page-break-header ${editingHeader ? 'editing' : ''}`}
        style={{ height: `${headerHeight}px` }}
        onDoubleClick={() => setEditingHeader(true)}
      >
        {editingHeader ? (
          <span
            ref={headerRef}
            className="page-header-content editing"
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => {
              setEditingHeader(false);
              onHeaderEdit(e);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.target as HTMLElement).blur();
              }
            }}
          >
            {headerContent}
          </span>
        ) : (
          <span className="page-header-display">
            {headerContent || 'Double-click to edit header'}
          </span>
        )}
      </div>
    </div>
  );
}

export class PageBreakNode extends DecoratorNode<JSX.Element> {
  __height: number;
  __pageNumber: number; // The page number that's ending (next page = pageNumber + 1)
  __footerText: string;
  __headerText: string;
  __showPageNumbers: boolean;

  static getType(): string {
    return 'page-break';
  }

  static clone(node: PageBreakNode): PageBreakNode {
    return new PageBreakNode(
      node.__height,
      node.__pageNumber,
      node.__footerText,
      node.__headerText,
      node.__showPageNumbers,
      node.__key
    );
  }

  constructor(
    height: number,
    pageNumber: number = 1,
    footerText: string = '',
    headerText: string = '',
    showPageNumbers: boolean = true,
    key?: NodeKey
  ) {
    super(key);
    this.__height = height;
    this.__pageNumber = pageNumber;
    this.__footerText = footerText;
    this.__headerText = headerText;
    this.__showPageNumbers = showPageNumbers;
  }

  createDOM(_config: EditorConfig): HTMLElement {
    return document.createElement('div');
  }

  updateDOM(): boolean {
    return false;
  }

  static importJSON(serializedNode: SerializedPageBreakNode): PageBreakNode {
    return new PageBreakNode(
      serializedNode.height,
      serializedNode.pageNumber || 1,
      serializedNode.footerText || '',
      serializedNode.headerText || '',
      serializedNode.showPageNumbers !== false
    );
  }

  exportJSON(): SerializedPageBreakNode {
    return {
      type: 'page-break',
      version: 3, // Bumped version for editable headers/footers
      height: this.__height,
      pageNumber: this.__pageNumber,
      footerText: this.__footerText,
      headerText: this.__headerText,
      showPageNumbers: this.__showPageNumbers,
    };
  }

  getHeight(): number {
    return this.__height;
  }

  getPageNumber(): number {
    return this.__pageNumber;
  }

  getFooterText(): string {
    return this.__footerText;
  }

  getHeaderText(): string {
    return this.__headerText;
  }

  getShowPageNumbers(): boolean {
    return this.__showPageNumbers;
  }

  setFooterText(text: string): void {
    const writable = this.getWritable();
    writable.__footerText = text;
  }

  setHeaderText(text: string): void {
    const writable = this.getWritable();
    writable.__headerText = text;
  }

  setShowPageNumbers(show: boolean): void {
    const writable = this.getWritable();
    writable.__showPageNumbers = show;
  }

  getTextContent(): string {
    return '';
  }

  isInline(): boolean {
    return false;
  }

  isIsolated(): boolean {
    return true;
  }

  decorate(): JSX.Element {
    // Page break structure - provides visual separation between pages
    // Contains footer of current page and header of next page
    // Structure:
    // - White space (remaining space on current page)
    // - Footer (editable, for page N)
    // - Gray gap (24px visual separator)
    // - Header (editable, for page N+1)

    const pageGap = 24; // Visual gap between pages
    const footerHeight = 96; // Matches margin height (1 inch = 72pt = 96px)
    const headerHeight = 96; // Matches margin height (1 inch = 72pt = 96px)

    const currentPage = this.__pageNumber;
    const nextPage = this.__pageNumber + 1;

    // Calculate white space: total height - footer - gap - header
    const whiteSpace = Math.max(0, this.__height - footerHeight - pageGap - headerHeight);

    const nodeKey = this.getKey();

    const handleFooterEdit = (e: React.FocusEvent<HTMLSpanElement>) => {
      const newText = e.currentTarget.textContent || '';
      const event = new CustomEvent('pagebreak-footer-edit', {
        detail: { nodeKey, text: newText },
        bubbles: true,
      });
      e.currentTarget.dispatchEvent(event);
    };

    const handleHeaderEdit = (e: React.FocusEvent<HTMLSpanElement>) => {
      const newText = e.currentTarget.textContent || '';
      const event = new CustomEvent('pagebreak-header-edit', {
        detail: { nodeKey, text: newText },
        bubbles: true,
      });
      e.currentTarget.dispatchEvent(event);
    };

    // Footer: use custom text or show page number
    const footerContent = this.__footerText || (this.__showPageNumbers ? `Page ${currentPage}` : '');
    // Header: use text from first page header (passed via __headerText), or show placeholder
    const headerContent = this.__headerText || 'Click to edit header';

    return (
      <PageBreakComponent
        height={this.__height}
        whiteSpace={whiteSpace}
        footerHeight={footerHeight}
        headerHeight={headerHeight}
        pageGap={pageGap}
        currentPage={currentPage}
        nextPage={nextPage}
        footerContent={footerContent}
        headerContent={headerContent}
        onFooterEdit={handleFooterEdit}
        onHeaderEdit={handleHeaderEdit}
      />
    );
  }
}

export function $createPageBreakNode(
  height: number,
  pageNumber: number = 1,
  footerText: string = '',
  headerText: string = '',
  showPageNumbers: boolean = true
): PageBreakNode {
  return new PageBreakNode(height, pageNumber, footerText, headerText, showPageNumbers);
}

export function $isPageBreakNode(node: LexicalNode | null | undefined): node is PageBreakNode {
  return node instanceof PageBreakNode;
}
