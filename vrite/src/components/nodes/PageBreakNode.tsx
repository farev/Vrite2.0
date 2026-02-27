'use client';

import React, { type JSX } from 'react';
import type {
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical';
import { DecoratorNode } from 'lexical';
import { HeaderFooterRichEditor } from '../HeaderFooterRichEditor';

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
  footerEditorState,
  headerEditorState,
  showPageNumbers,
  onFooterEdit,
  onHeaderEdit,
  onEditorFocus,
  onEditorBlur,
}: {
  height: number;
  whiteSpace: number;
  footerHeight: number;
  headerHeight: number;
  pageGap: number;
  currentPage: number;
  nextPage: number;
  footerEditorState: string;
  headerEditorState: string;
  showPageNumbers: boolean;
  onFooterEdit: (stateJSON: string) => void;
  onHeaderEdit: (stateJSON: string) => void;
  onEditorFocus?: (editor: LexicalEditor) => void;
  onEditorBlur?: () => void;
}) {
  const footerPlaceholder = '';
  const headerPlaceholder = '';

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
        className="page-break-footer"
        style={{ height: `${footerHeight}px` }}
      >
        <HeaderFooterRichEditor
          initialState={footerEditorState || null}
          placeholder={footerPlaceholder}
          label="Footer"
          onStateChange={onFooterEdit}
          onEditorFocus={onEditorFocus}
          onEditorBlur={onEditorBlur}
        />
      </div>

      {/* Gray gap - visual page separation (24px) */}
      <div
        className="page-break-gap"
        style={{ height: `${pageGap}px` }}
      />

      {/* Header - start of next page (page N+1) */}
      <div
        className="page-break-header"
        style={{ height: `${headerHeight}px` }}
      >
        <HeaderFooterRichEditor
          initialState={headerEditorState || null}
          placeholder={headerPlaceholder}
          label="Header"
          onStateChange={onHeaderEdit}
          onEditorFocus={onEditorFocus}
          onEditorBlur={onEditorBlur}
        />
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
      version: 4, // Bumped version for rich text headers/footers
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
    const pageGap = 24;
    const footerHeight = 96;
    const headerHeight = 96;

    const currentPage = this.__pageNumber;
    const nextPage = this.__pageNumber + 1;

    const whiteSpace = Math.max(0, this.__height - footerHeight - pageGap - headerHeight);

    const nodeKey = this.getKey();

    const handleFooterEdit = (stateJSON: string) => {
      const event = new CustomEvent('pagebreak-footer-edit', {
        detail: { nodeKey, text: stateJSON },
        bubbles: true,
      });
      // Dispatch on the nearest DOM node
      const el = document.querySelector(`[data-page-from="${currentPage}"]`);
      el?.dispatchEvent(event);
    };

    const handleHeaderEdit = (stateJSON: string) => {
      const event = new CustomEvent('pagebreak-header-edit', {
        detail: { nodeKey, text: stateJSON },
        bubbles: true,
      });
      const el = document.querySelector(`[data-page-from="${currentPage}"]`);
      el?.dispatchEvent(event);
    };

    // Handle editor focus/blur for toolbar context switching
    const handleEditorFocus = (editor: LexicalEditor) => {
      const event = new CustomEvent('hf-editor-focus', {
        detail: { editor },
        bubbles: true,
      });
      document.dispatchEvent(event);
    };

    const handleEditorBlur = () => {
      const event = new CustomEvent('hf-editor-blur', {
        bubbles: true,
      });
      document.dispatchEvent(event);
    };

    return (
      <PageBreakComponent
        height={this.__height}
        whiteSpace={whiteSpace}
        footerHeight={footerHeight}
        headerHeight={headerHeight}
        pageGap={pageGap}
        currentPage={currentPage}
        nextPage={nextPage}
        footerEditorState={this.__footerText}
        headerEditorState={this.__headerText}
        showPageNumbers={this.__showPageNumbers}
        onFooterEdit={handleFooterEdit}
        onHeaderEdit={handleHeaderEdit}
        onEditorFocus={handleEditorFocus}
        onEditorBlur={handleEditorBlur}
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
