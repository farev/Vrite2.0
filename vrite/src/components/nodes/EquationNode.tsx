'use client';

import {
  DecoratorNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Edit2, Check, X } from 'lucide-react';

export type SerializedEquationNode = Spread<
  {
    equation: string;
    inline: boolean;
  },
  SerializedLexicalNode
>;

/**
 * EquationNode - Renders LaTeX equations using KaTeX
 * Note: KaTeX is loaded dynamically to avoid SSR issues
 */
export class EquationNode extends DecoratorNode<JSX.Element> {
  __equation: string;
  __inline: boolean;

  static getType(): string {
    return 'equation';
  }

  static clone(node: EquationNode): EquationNode {
    return new EquationNode(node.__equation, node.__inline, node.__key);
  }

  constructor(equation: string, inline?: boolean, key?: NodeKey) {
    super(key);
    this.__equation = equation;
    this.__inline = inline ?? false;
  }

  static importJSON(serializedNode: SerializedEquationNode): EquationNode {
    const node = $createEquationNode(
      serializedNode.equation,
      serializedNode.inline
    );
    return node;
  }

  exportJSON(): SerializedEquationNode {
    return {
      equation: this.__equation,
      inline: this.__inline,
      type: 'equation',
      version: 1,
    };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement(this.__inline ? 'span' : 'div');
    element.className = this.__inline ? 'equation-inline' : 'equation-block';
    return element;
  }

  updateDOM(): false {
    return false;
  }

  getEquation(): string {
    return this.__equation;
  }

  setEquation(equation: string): void {
    const writable = this.getWritable();
    writable.__equation = equation;
  }

  decorate(): JSX.Element {
    return (
      <Suspense fallback={<span>Loading equation...</span>}>
        <EquationComponent
          equation={this.__equation}
          inline={this.__inline}
          nodeKey={this.__key}
        />
      </Suspense>
    );
  }

  isInline(): boolean {
    return this.__inline;
  }

  static importDOM(): DOMConversionMap | null {
    return {
      span: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute('data-lexical-equation')) {
          return null;
        }
        return {
          conversion: convertEquationElement,
          priority: 2,
        };
      },
      div: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute('data-lexical-equation')) {
          return null;
        }
        return {
          conversion: convertEquationElement,
          priority: 2,
        };
      },
    };
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement(this.__inline ? 'span' : 'div');
    element.setAttribute('data-lexical-equation', this.__equation);
    element.textContent = `$${this.__equation}$`;
    return { element };
  }
}

function convertEquationElement(domNode: HTMLElement): DOMConversionOutput | null {
  const equation = domNode.getAttribute('data-lexical-equation');
  if (equation) {
    const node = $createEquationNode(equation, domNode.nodeName === 'SPAN');
    return { node };
  }
  return null;
}

export function $createEquationNode(
  equation = '',
  inline = false
): EquationNode {
  return new EquationNode(equation, inline);
}

export function $isEquationNode(
  node: LexicalNode | null | undefined
): node is EquationNode {
  return node instanceof EquationNode;
}

/**
 * EquationComponent - React component that renders the equation
 */
function EquationComponent({
  equation,
  inline,
  nodeKey,
}: {
  equation: string;
  inline: boolean;
  nodeKey: NodeKey;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(equation);
  const [katex, setKatex] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load KaTeX dynamically
  useEffect(() => {
    import('katex').then((module) => {
      setKatex(() => module.default);
    });
  }, []);

  // Render equation when KaTeX is loaded
  useEffect(() => {
    if (!katex || !containerRef.current || isEditing) return;

    try {
      katex.render(equation, containerRef.current, {
        displayMode: !inline,
        throwOnError: false,
        errorColor: '#cc0000',
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid equation');
    }
  }, [katex, equation, inline, isEditing]);

  const handleSave = useCallback(() => {
    // Update the node
    const editor = (window as any).__lexicalEditor;
    if (editor) {
      editor.update(() => {
        const node = editor.getEditorState()._nodeMap.get(nodeKey);
        if ($isEquationNode(node)) {
          node.setEquation(editValue);
        }
      });
    }
    setIsEditing(false);
  }, [editValue, nodeKey]);

  const handleCancel = useCallback(() => {
    setEditValue(equation);
    setIsEditing(false);
  }, [equation]);

  if (!katex) {
    return <span className="equation-loading">Loading...</span>;
  }

  if (isEditing) {
    return (
      <span className="equation-editor">
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSave();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              handleCancel();
            }
          }}
          className="equation-input"
          autoFocus
        />
        <button onClick={handleSave} className="equation-btn equation-btn-save">
          <Check size={14} />
        </button>
        <button onClick={handleCancel} className="equation-btn equation-btn-cancel">
          <X size={14} />
        </button>
      </span>
    );
  }

  return (
    <span
      className={inline ? 'equation-inline-wrapper' : 'equation-block-wrapper'}
      onClick={() => setIsEditing(true)}
    >
      <span ref={containerRef} className="equation-content" />
      {error && <span className="equation-error">{error}</span>}
      <button
        className="equation-edit-btn"
        onClick={(e) => {
          e.stopPropagation();
          setIsEditing(true);
        }}
      >
        <Edit2 size={12} />
      </button>
    </span>
  );
}

