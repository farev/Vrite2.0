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
import { Check, X } from 'lucide-react';

export type DiffType = 'addition' | 'deletion';

export type SerializedDiffNode = Spread<
  {
    diffType: DiffType;
    text: string;
    originalText?: string;
  },
  SerializedLexicalNode
>;

function DiffComponent({
  text,
  diffType,
  nodeKey,
  onAccept,
  onReject,
  originalText,
}: {
  text: string;
  diffType: DiffType;
  nodeKey: NodeKey;
  onAccept: (nodeKey: NodeKey) => void;
  onReject: (nodeKey: NodeKey) => void;
  originalText?: string;
}) {
  const isAddition = diffType === 'addition';
  const isReplacement = isAddition && !!originalText;
  const acceptTitle = isAddition
    ? isReplacement
      ? 'Accept change'
      : 'Accept addition'
    : 'Accept deletion';
  const rejectTitle = isAddition
    ? isReplacement
      ? 'Keep original text'
      : 'Reject addition'
    : 'Keep original';
  const classes = [
    'diff-inline-node',
    isAddition ? 'diff-inline-addition' : 'diff-inline-deletion',
    isReplacement ? 'diff-inline-replacement' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes}>
      {isReplacement && (
        <span className="diff-inline-original">{originalText}</span>
      )}
      <span className="diff-inline-text">{text}</span>
      <span className="diff-inline-actions">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onReject(nodeKey);
          }}
          className="diff-inline-btn diff-inline-reject"
          title={rejectTitle}
        >
          <X size={12} />
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAccept(nodeKey);
          }}
          className="diff-inline-btn diff-inline-accept"
          title={acceptTitle}
        >
          <Check size={12} />
        </button>
      </span>
    </span>
  );
}

export class DiffNode extends DecoratorNode<JSX.Element> {
  __diffType: DiffType;
  __text: string;
  __originalText?: string;

  // Static callbacks for accept/reject - will be set by the plugin
  static __onAccept: ((nodeKey: NodeKey) => void) | null = null;
  static __onReject: ((nodeKey: NodeKey) => void) | null = null;

  static getType(): string {
    return 'diff';
  }

  static clone(node: DiffNode): DiffNode {
    return new DiffNode(node.__diffType, node.__text, node.__originalText, node.__key);
  }

  static setCallbacks(
    onAccept: (nodeKey: NodeKey) => void,
    onReject: (nodeKey: NodeKey) => void
  ) {
    DiffNode.__onAccept = onAccept;
    DiffNode.__onReject = onReject;
  }

  constructor(diffType: DiffType, text: string, originalText?: string, key?: NodeKey) {
    super(key);
    this.__diffType = diffType;
    this.__text = text;
    this.__originalText = originalText;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const span = document.createElement('span');
    return span;
  }

  updateDOM(): boolean {
    return false;
  }

  static importJSON(serializedNode: SerializedDiffNode): DiffNode {
    return new DiffNode(
      serializedNode.diffType,
      serializedNode.text,
      serializedNode.originalText
    );
  }

  exportJSON(): SerializedDiffNode {
    return {
      type: 'diff',
      version: 1,
      diffType: this.__diffType,
      text: this.__text,
      originalText: this.__originalText,
    };
  }

  getDiffType(): DiffType {
    return this.__diffType;
  }

  getText(): string {
    return this.__text;
  }

  getOriginalText(): string | undefined {
    return this.__originalText;
  }

  getTextContent(): string {
    // For additions, show the new text; for deletions, show empty (it's being removed)
    return this.__diffType === 'addition' ? this.__text : '';
  }

  decorate(): JSX.Element {
    return (
      <DiffComponent
        text={this.__text}
        diffType={this.__diffType}
        nodeKey={this.__key}
        originalText={this.__originalText}
        onAccept={DiffNode.__onAccept || (() => {})}
          onReject={DiffNode.__onReject || (() => {})}
      />
    );
  }

  isInline(): boolean {
    return true;
  }
}

export function $createDiffNode(diffType: DiffType, text: string, originalText?: string): DiffNode {
  return new DiffNode(diffType, text, originalText);
}

export function $isDiffNode(node: LexicalNode | null | undefined): node is DiffNode {
  return node instanceof DiffNode;
}
