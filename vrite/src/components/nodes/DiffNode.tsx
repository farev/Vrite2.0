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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computeWordDiff, groupIntoPhraseChunks } from '@/lib/wordDiff';

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
    imageData?: {
      src: string;
      altText: string;
      width: number | string;
      height: number | string;
      alignment: string;
      caption: string;
      showCaption: boolean;
    }; // For image diffs
  },
  SerializedLexicalNode
>;

function DiffComponent({
  text,
  diffType,
  nodeKey,
  onAccept,
  onReject,
  onResolveWithText,
  originalText,
  isBold,
  isItalic,
  headingLevel,
  alignmentChange,
  equationData,
  imageData,
}: {
  text: string;
  diffType: DiffType;
  nodeKey: NodeKey;
  onAccept: (nodeKey: NodeKey) => void;
  onReject: (nodeKey: NodeKey) => void;
  onResolveWithText: (nodeKey: NodeKey, text: string) => void;
  originalText?: string;
  isBold?: boolean;
  isItalic?: boolean;
  headingLevel?: number;
  alignmentChange?: { from: string; to: string };
  equationData?: { equation: string; inline: boolean };
  imageData?: {
    src: string;
    altText: string;
    width: number | string;
    height: number | string;
    alignment: string;
    caption: string;
    showCaption: boolean;
  };
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

  // Phrase chunks for replacement diffs (computed once from stable props)
  const chunks = useMemo(() => {
    if (!isReplacement || !originalText) return [];
    const segments = computeWordDiff(originalText, text);
    return groupIntoPhraseChunks(segments);
  }, [isReplacement, originalText, text]);

  // Track which change chunks have been individually resolved
  const [chunkResolutions, setChunkResolutions] = useState<Record<number, 'accepted' | 'rejected'>>({});

  // Track which phrase chunk the mouse is currently hovering over
  const [hoveredChunkIdx, setHoveredChunkIdx] = useState<number | null>(null);
  // Timer ref to delay hiding so the mouse can travel from phrase to buttons
  const hoverLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showChunkButtons = useCallback((i: number) => {
    if (hoverLeaveTimerRef.current) clearTimeout(hoverLeaveTimerRef.current);
    setHoveredChunkIdx(i);
  }, []);

  const scheduleHideButtons = useCallback(() => {
    hoverLeaveTimerRef.current = setTimeout(() => setHoveredChunkIdx(null), 200);
  }, []);

  const resolveChunk = useCallback((chunkIdx: number, decision: 'accepted' | 'rejected') => {
    setChunkResolutions(prev => {
      const next = { ...prev, [chunkIdx]: decision };
      const allResolved = chunks.every((chunk, idx) =>
        chunk.kind === 'equal' || next[idx] !== undefined
      );
      if (allResolved) {
        const resolvedText = chunks.map((chunk, idx) => {
          if (chunk.kind === 'equal') return chunk.text;
          return next[idx] === 'accepted' ? chunk.inserted : chunk.deleted;
        }).join('');
        // Defer so state update completes before removing the node
        Promise.resolve().then(() => onResolveWithText(nodeKey, resolvedText));
      }
      return next;
    });
  }, [chunks, nodeKey, onResolveWithText]);

  // Render image diff
  if (imageData) {
    const maxPreviewWidth = 200;
    const maxPreviewHeight = 150;

    return (
      <span className={classes} style={{ display: 'inline-block', verticalAlign: 'middle' }}>
        <span className="diff-inline-body" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          {isReplacement && originalText && (
            <span className="diff-inline-original">{originalText}</span>
          )}
          <span className="diff-inline-text">
            <img
              src={imageData.src}
              alt={imageData.altText}
              style={{
                maxWidth: `${maxPreviewWidth}px`,
                maxHeight: `${maxPreviewHeight}px`,
                objectFit: 'contain',
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
              }}
            />
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

  // Phrase-level diff for replacements (Grammarly-style grouped changes)
  if (isReplacement) {
    return (
      <span className="diff-word-container">
        <span className="diff-word-text">
        {chunks.map((chunk, i) => {
          if (chunk.kind === 'equal') {
            return <span key={i} style={textStyle}>{chunk.text}</span>;
          }
          const resolution = chunkResolutions[i];
          if (resolution === 'accepted') {
            return <span key={i} style={textStyle}>{chunk.inserted}</span>;
          }
          if (resolution === 'rejected') {
            return <span key={i} style={textStyle}>{chunk.deleted}</span>;
          }
          // Pending: show delete + insert; hover reveals per-phrase accept/reject buttons
          return (
            <span
              key={i}
              className="diff-phrase-pending"
              onMouseEnter={() => showChunkButtons(i)}
              onMouseLeave={scheduleHideButtons}
            >
              {chunk.deleted && <span className="diff-word-delete">{chunk.deleted}</span>}
              {chunk.inserted && <span className="diff-word-insert" style={textStyle}>{chunk.inserted}</span>}
              {hoveredChunkIdx === i && (
                <span
                  className="diff-phrase-actions"
                  onMouseEnter={() => showChunkButtons(i)}
                  onMouseLeave={scheduleHideButtons}
                >
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); resolveChunk(i, 'rejected'); }}
                    className="diff-inline-btn diff-inline-reject"
                    title="Reject this change"
                  >
                    <X size={10} />
                  </button>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); resolveChunk(i, 'accepted'); }}
                    className="diff-inline-btn diff-inline-accept"
                    title="Accept this change"
                  >
                    <Check size={10} />
                  </button>
                </span>
              )}
            </span>
          );
        })}
        </span>
        {/* Block-level accept/reject — accepts/rejects all remaining changes at once */}
        <span className="diff-word-actions">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReject(nodeKey); }}
            className="diff-block-btn diff-block-reject"
            title={rejectTitle}
          >
            Reject
          </button>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAccept(nodeKey); }}
            className="diff-block-btn diff-block-accept"
            title={acceptTitle}
          >
            Accept
          </button>
        </span>
      </span>
    );
  }

  // Regular text diff (pure additions and deletions)
  return (
    <span className={classes}>
      <span className="diff-inline-body">
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
  __imageData?: {
    src: string;
    altText: string;
    width: number | string;
    height: number | string;
    alignment: string;
    caption: string;
    showCaption: boolean;
  };

  // Static callbacks for accept/reject/resolve - will be set by the plugin
  static __onAccept: ((nodeKey: NodeKey) => void) | null = null;
  static __onReject: ((nodeKey: NodeKey) => void) | null = null;
  static __onResolveWithText: ((nodeKey: NodeKey, text: string) => void) | null = null;

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
      node.__imageData,
      node.__key
    );
  }

  static setCallbacks(
    onAccept: (nodeKey: NodeKey) => void,
    onReject: (nodeKey: NodeKey) => void,
    onResolveWithText?: (nodeKey: NodeKey, text: string) => void
  ) {
    DiffNode.__onAccept = onAccept;
    DiffNode.__onReject = onReject;
    if (onResolveWithText) DiffNode.__onResolveWithText = onResolveWithText;
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
    imageData?: {
      src: string;
      altText: string;
      width: number | string;
      height: number | string;
      alignment: string;
      caption: string;
      showCaption: boolean;
    },
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
    this.__imageData = imageData;
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
      serializedNode.equationData,
      serializedNode.imageData
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
      imageData: this.__imageData,
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
        imageData={this.__imageData}
        onAccept={DiffNode.__onAccept || (() => {})}
        onReject={DiffNode.__onReject || (() => {})}
        onResolveWithText={DiffNode.__onResolveWithText || (() => {})}
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
  equationData?: { equation: string; inline: boolean },
  imageData?: {
    src: string;
    altText: string;
    width: number | string;
    height: number | string;
    alignment: string;
    caption: string;
    showCaption: boolean;
  }
): DiffNode {
  return new DiffNode(diffType, text, originalText, isBold, isItalic, headingLevel, alignmentChange, equationData, imageData);
}

export function $isDiffNode(node: LexicalNode | null | undefined): node is DiffNode {
  return node instanceof DiffNode;
}
