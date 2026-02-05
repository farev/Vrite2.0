'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  DecoratorNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';

export type ErrorType = 'spelling' | 'grammar';

export type ErrorSuggestion = {
  text: string;
  description?: string;
};

type SerializedErrorDecoratorNode = Spread<
  {
    text: string;
    errorType: ErrorType;
    suggestions: ErrorSuggestion[];
  },
  SerializedLexicalNode
>;

export class ErrorDecoratorNode extends DecoratorNode<React.ReactElement> {
  __text: string;
  __errorType: ErrorType;
  __suggestions: ErrorSuggestion[];

  static getType(): string {
    return 'error-decorator';
  }

  static clone(node: ErrorDecoratorNode): ErrorDecoratorNode {
    return new ErrorDecoratorNode(
      node.__text,
      node.__errorType,
      node.__suggestions,
      node.__key
    );
  }

  constructor(
    text: string,
    errorType: ErrorType,
    suggestions: ErrorSuggestion[],
    key?: NodeKey
  ) {
    super(key);
    this.__text = text;
    this.__errorType = errorType;
    this.__suggestions = suggestions;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const span = document.createElement('span');
    span.className = `error-decorator error-${this.__errorType}`;
    span.textContent = this.__text;
    return span;
  }

  updateDOM(): false {
    return false;
  }

  getText(): string {
    return this.__text;
  }

  getErrorType(): ErrorType {
    return this.__errorType;
  }

  getSuggestions(): ErrorSuggestion[] {
    return this.__suggestions;
  }

  decorate(): React.ReactElement {
    return (
      <ErrorDecorator
        text={this.__text}
        errorType={this.__errorType}
        suggestions={this.__suggestions}
        nodeKey={this.__key}
      />
    );
  }

  static importJSON(serializedNode: SerializedErrorDecoratorNode): ErrorDecoratorNode {
    return $createErrorDecoratorNode(
      serializedNode.text,
      serializedNode.errorType,
      serializedNode.suggestions
    );
  }

  exportJSON(): SerializedErrorDecoratorNode {
    return {
      ...super.exportJSON(),
      text: this.__text,
      errorType: this.__errorType,
      suggestions: this.__suggestions,
      type: 'error-decorator',
      version: 1,
    };
  }
}

function ErrorDecorator({
  text,
  errorType,
  suggestions,
  nodeKey,
}: {
  text: string;
  errorType: ErrorType;
  suggestions: ErrorSuggestion[];
  nodeKey: NodeKey;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (showTooltip && spanRef.current) {
      const rect = spanRef.current.getBoundingClientRect();
      setTooltipPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
      });
    }
  }, [showTooltip]);

  const handleClick = (suggestion: string) => {
    // Apply correction
    const { $getNodeByKey, $createTextNode } = require('lexical');
    const { useLexicalComposerContext } = require('@lexical/react/LexicalComposerContext');

    // This will be handled by the plugin
    const event = new CustomEvent('error-correction', {
      detail: { nodeKey, correction: suggestion },
    });
    window.dispatchEvent(event);

    setShowTooltip(false);
  };

  return (
    <>
      <span
        ref={spanRef}
        className={`error-decorator error-${errorType}`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        style={{
          textDecoration: 'underline',
          textDecorationStyle: 'wavy',
          textDecorationColor: errorType === 'spelling' ? '#ef4444' : '#3b82f6',
          textDecorationThickness: '2px',
          cursor: 'pointer',
        }}
      >
        {text}
      </span>
      {showTooltip && suggestions.length > 0 && (
        <div
          className="error-tooltip"
          style={{
            position: 'absolute',
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            zIndex: 9999,
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            padding: '8px',
            minWidth: '200px',
            maxWidth: '300px',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: '#6b7280' }}>
            {errorType === 'spelling' ? 'Spelling' : 'Grammar'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {suggestions.slice(0, 5).map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handleClick(suggestion.text)}
                style={{
                  padding: '6px 8px',
                  textAlign: 'left',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  fontSize: '14px',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLButtonElement).style.backgroundColor = '#f3f4f6';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLButtonElement).style.backgroundColor = 'transparent';
                }}
              >
                <div style={{ fontWeight: 500 }}>{suggestion.text}</div>
                {suggestion.description && (
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                    {suggestion.description}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export function $createErrorDecoratorNode(
  text: string,
  errorType: ErrorType,
  suggestions: ErrorSuggestion[]
): ErrorDecoratorNode {
  return new ErrorDecoratorNode(text, errorType, suggestions);
}

export function $isErrorDecoratorNode(
  node: LexicalNode | null | undefined
): node is ErrorDecoratorNode {
  return node instanceof ErrorDecoratorNode;
}
