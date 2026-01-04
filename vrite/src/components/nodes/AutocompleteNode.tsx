'use client';

import {
  DecoratorNode,
  type DOMConversionMap,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';

export type SerializedAutocompleteNode = Spread<
  {
    suggestion: string;
  },
  SerializedLexicalNode
>;

/**
 * AutocompleteNode - Displays ghost text suggestions
 */
export class AutocompleteNode extends DecoratorNode<JSX.Element> {
  __suggestion: string;

  static getType(): string {
    return 'autocomplete';
  }

  static clone(node: AutocompleteNode): AutocompleteNode {
    return new AutocompleteNode(node.__suggestion, node.__key);
  }

  constructor(suggestion: string, key?: NodeKey) {
    super(key);
    this.__suggestion = suggestion;
  }

  static importJSON(serializedNode: SerializedAutocompleteNode): AutocompleteNode {
    return $createAutocompleteNode(serializedNode.suggestion);
  }

  exportJSON(): SerializedAutocompleteNode {
    return {
      suggestion: this.__suggestion,
      type: 'autocomplete',
      version: 1,
    };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('span');
    element.className = 'autocomplete-suggestion';
    return element;
  }

  updateDOM(): false {
    return false;
  }

  getSuggestion(): string {
    return this.__suggestion;
  }

  decorate(): JSX.Element {
    return (
      <span className="autocomplete-ghost-text">
        {this.__suggestion}
      </span>
    );
  }

  isInline(): boolean {
    return true;
  }

  exportDOM(): DOMExportOutput {
    return { element: null };
  }
}

export function $createAutocompleteNode(suggestion: string): AutocompleteNode {
  return new AutocompleteNode(suggestion);
}

export function $isAutocompleteNode(
  node: LexicalNode | null | undefined
): node is AutocompleteNode {
  return node instanceof AutocompleteNode;
}

