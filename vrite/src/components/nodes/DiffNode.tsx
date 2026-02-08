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
import { useEffect, useRef, useState } from 'react';

export type DiffType = 'addition' | 'deletion';

export type SerializedDiffNode = Spread<
  {
    diffType: DiffType;
    text: string;
    originalText?: string;
    isBold?: boolean;
    isItalic?: boolean;
    headingLevel?: number;
    alignmentChange?: { from: string; to: string }; // Track alignment changes
    equationData?: { equation: string; inline: boolean }; // For equation diffs
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
  isBold,
  isItalic,
  headingLevel,
  alignmentChange,
  equationData,
}: {
  text: string;
  diffType: DiffType;
  nodeKey: NodeKey;
  onAccept: (nodeKey: NodeKey) => void;
  onReject: (nodeKey: NodeKey) => void;
  originalText?: string;
  isBold?: boolean;
  isItalic?: boolean;
  headingLevel?: number;
  alignmentChange?: { from: string; to: string };
  equationData?: { equation: string; inline: boolean };
}) {
  const [katex, setKatex] = useState<typeof import('katex').default | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const equationRef = useRef<HTMLSpanElement>(null);

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

  // Apply text formatting styles
  const textStyle: React.CSSProperties = {
    fontWeight: isBold ? 'bold' : undefined,
    fontStyle: isItalic ? 'italic' : undefined,
    fontSize: headingLevel ? `${2.5 - headingLevel * 0.3}em` : undefined,
  };

  // Load KaTeX dynamically
  useEffect(() => {
    if (equationData) {
      import('katex').then((module) => {
        setKatex(() => module.default);
      });
    }
  }, [equationData]);

  // Render equation when KaTeX is loaded
  useEffect(() => {
    if (!katex || !equationData || !equationRef.current) return;

    try {
      katex.render(equationData.equation, equationRef.current, {
        displayMode: !equationData.inline,
        throwOnError: false,
        errorColor: '#cc0000',
      });
      setRenderError(null);
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : 'Invalid equation');
    }
  }, [katex, equationData]);

  // Render equation diff
  if (equationData) {
    return (
      <span className={classes}>
        <span className="diff-inline-body">
          {isReplacement && originalText && (
            <span className="diff-inline-original">{originalText}</span>
          )}
          <span className="diff-inline-text" style={{ ...textStyle, display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            {katex ? (
              <>
                <span ref={equationRef} className="equation-preview" />
                {renderError && (
                  <span style={{ fontSize: '0.85em', color: '#cc0000' }}>
                    ({renderError})
                  </span>
                )}
              </>
            ) : (
              <span style={{ fontSize: '0.9em', opacity: 0.7 }}>Loading preview...</span>
            )}
          </span>
        </span>
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

  // Regular text diff
  return (
    <span className={classes}>
      <span className="diff-inline-body">
        {isReplacement && (
          <span className="diff-inline-original">{originalText}</span>
        )}
        <span className="diff-inline-text" style={textStyle}>{text}</span>
      </span>
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
  __isBold?: boolean;
  __isItalic?: boolean;
  __headingLevel?: number;
  __alignmentChange?: { from: string; to: string };
  __equationData?: { equation: string; inline: boolean };

  // Static callbacks for accept/reject - will be set by the plugin
  static __onAccept: ((nodeKey: NodeKey) => void) | null = null;
  static __onReject: ((nodeKey: NodeKey) => void) | null = null;

  static getType(): string {
    return 'diff';
  }

  static clone(node: DiffNode): DiffNode {
    return new DiffNode(
      node.__diffType,
      node.__text,
      node.__originalText,
      node.__isBold,
      node.__isItalic,
      node.__headingLevel,
      node.__alignmentChange,
      node.__equationData,
      node.__key
    );
  }

  static setCallbacks(
    onAccept: (nodeKey: NodeKey) => void,
    onReject: (nodeKey: NodeKey) => void
  ) {
    DiffNode.__onAccept = onAccept;
    DiffNode.__onReject = onReject;
  }

  constructor(
    diffType: DiffType,
    text: string,
    originalText?: string,
    isBold?: boolean,
    isItalic?: boolean,
    headingLevel?: number,
    alignmentChange?: { from: string; to: string },
    equationData?: { equation: string; inline: boolean },
    key?: NodeKey
  ) {
    super(key);
    this.__diffType = diffType;
    this.__text = text;
    this.__originalText = originalText;
    this.__isBold = isBold;
    this.__isItalic = isItalic;
    this.__headingLevel = headingLevel;
    this.__alignmentChange = alignmentChange;
    this.__equationData = equationData;
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
      serializedNode.originalText,
      serializedNode.isBold,
      serializedNode.isItalic,
      serializedNode.headingLevel,
      serializedNode.alignmentChange,
      serializedNode.equationData
    );
  }

  exportJSON(): SerializedDiffNode {
    return {
      type: 'diff',
      version: 1,
      diffType: this.__diffType,
      text: this.__text,
      originalText: this.__originalText,
      isBold: this.__isBold,
      isItalic: this.__isItalic,
      headingLevel: this.__headingLevel,
      alignmentChange: this.__alignmentChange,
      equationData: this.__equationData,
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
        isBold={this.__isBold}
        isItalic={this.__isItalic}
        headingLevel={this.__headingLevel}
        alignmentChange={this.__alignmentChange}
        equationData={this.__equationData}
        onAccept={DiffNode.__onAccept || (() => {})}
        onReject={DiffNode.__onReject || (() => {})}
      />
    );
  }

  isInline(): boolean {
    return true;
  }
}

export function $createDiffNode(
  diffType: DiffType,
  text: string,
  originalText?: string,
  isBold?: boolean,
  isItalic?: boolean,
  headingLevel?: number,
  alignmentChange?: { from: string; to: string },
  equationData?: { equation: string; inline: boolean }
): DiffNode {
  return new DiffNode(diffType, text, originalText, isBold, isItalic, headingLevel, alignmentChange, equationData);
}

export function $isDiffNode(node: LexicalNode | null | undefined): node is DiffNode {
  return node instanceof DiffNode;
}
