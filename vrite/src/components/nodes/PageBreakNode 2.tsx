'use client';

import type { JSX } from 'react';
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
  },
  SerializedLexicalNode
>;

export class PageBreakNode extends DecoratorNode<JSX.Element> {
  __height: number;

  static getType(): string {
    return 'page-break';
  }

  static clone(node: PageBreakNode): PageBreakNode {
    return new PageBreakNode(node.__height, node.__key);
  }

  constructor(height: number, key?: NodeKey) {
    super(key);
    this.__height = height;
  }

  createDOM(_config: EditorConfig): HTMLElement {
    return document.createElement('div');
  }

  updateDOM(): boolean {
    return false;
  }

  static importJSON(serializedNode: SerializedPageBreakNode): PageBreakNode {
    return new PageBreakNode(serializedNode.height);
  }

  exportJSON(): SerializedPageBreakNode {
    return {
      type: 'page-break',
      version: 1,
      height: this.__height,
    };
  }

  getHeight(): number {
    return this.__height;
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
    return <div className="page-break" style={{ height: `${this.__height}px` }} />;
  }
}

export function $createPageBreakNode(height: number): PageBreakNode {
  return new PageBreakNode(height);
}

export function $isPageBreakNode(node: LexicalNode | null | undefined): node is PageBreakNode {
  return node instanceof PageBreakNode;
}
