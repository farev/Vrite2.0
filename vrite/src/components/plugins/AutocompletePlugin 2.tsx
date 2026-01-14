'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  $getRoot,
  COMMAND_PRIORITY_LOW,
  KEY_TAB_COMMAND,
  KEY_ESCAPE_COMMAND,
  $createTextNode,
} from 'lexical';
import { $createAutocompleteNode, $isAutocompleteNode } from '../nodes/AutocompleteNode';

interface AutocompletePluginProps {
  enabled?: boolean;
  debounceMs?: number;
  minChars?: number;
}

/**
 * AutocompletePlugin - Provides AI-powered autocomplete suggestions
 */
export default function AutocompletePlugin({
  enabled = true,
  debounceMs = 500,
  minChars = 10,
}: AutocompletePluginProps) {
  const [editor] = useLexicalComposerContext();
  const [isLoading, setIsLoading] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Clear any existing autocomplete nodes
  const clearAutocomplete = useCallback(() => {
    editor.update(() => {
      const root = $getRoot();
      const allNodes: any[] = [];
      
      const collectNodes = (node: any) => {
        allNodes.push(node);
        if ('getChildren' in node && typeof node.getChildren === 'function') {
          const children = node.getChildren();
          children.forEach(collectNodes);
        }
      };
      collectNodes(root);
      
      allNodes.forEach((node) => {
        if ($isAutocompleteNode(node)) {
          node.remove();
        }
      });
    });
  }, [editor]);

  // Accept the current suggestion
  const acceptSuggestion = useCallback(() => {
    editor.update(() => {
      const root = $getRoot();
      const allNodes: any[] = [];
      
      const collectNodes = (node: any) => {
        allNodes.push(node);
        if ('getChildren' in node && typeof node.getChildren === 'function') {
          const children = node.getChildren();
          children.forEach(collectNodes);
        }
      };
      collectNodes(root);
      
      // Find autocomplete node
      const autocompleteNode = allNodes.find($isAutocompleteNode);
      if (autocompleteNode) {
        const suggestion = autocompleteNode.getSuggestion();
        const textNode = $createTextNode(suggestion);
        autocompleteNode.replace(textNode);
      }
    });
  }, [editor]);

  // Fetch suggestion from AI
  const fetchSuggestion = useCallback(async (context: string) => {
    if (!enabled || context.length < minChars) {
      return;
    }

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:8000/api/autocomplete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          context,
          max_tokens: 50,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error('Autocomplete request failed');
      }

      const data = await response.json();
      const suggestion = data.suggestion || '';

      if (suggestion) {
        // Insert autocomplete node
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection) && selection.isCollapsed()) {
            const autocompleteNode = $createAutocompleteNode(suggestion);
            selection.insertNodes([autocompleteNode]);
          }
        });
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Autocomplete error:', error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [editor, enabled, minChars]);

  // Handle editor updates
  useEffect(() => {
    if (!enabled) return;

    const unregister = editor.registerUpdateListener(({ editorState }) => {
      // Clear any existing debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Clear any existing autocomplete
      clearAutocomplete();

      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return;
        }

        // Get text content for context
        const root = $getRoot();
        const text = root.getTextContent();

        // Debounce the autocomplete request
        debounceTimerRef.current = setTimeout(() => {
          fetchSuggestion(text);
        }, debounceMs);
      });
    });

    return () => {
      unregister();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [editor, enabled, debounceMs, fetchSuggestion, clearAutocomplete]);

  // Register keyboard commands
  useEffect(() => {
    // Tab to accept suggestion
    const unregisterTab = editor.registerCommand(
      KEY_TAB_COMMAND,
      (event) => {
        const hasAutocomplete = editor.getEditorState().read(() => {
          const root = $getRoot();
          const allNodes: any[] = [];
          
          const collectNodes = (node: any) => {
            allNodes.push(node);
            if ('getChildren' in node && typeof node.getChildren === 'function') {
              const children = node.getChildren();
              children.forEach(collectNodes);
            }
          };
          collectNodes(root);
          
          return allNodes.some($isAutocompleteNode);
        });

        if (hasAutocomplete) {
          event?.preventDefault();
          acceptSuggestion();
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_LOW
    );

    // Escape to dismiss suggestion
    const unregisterEscape = editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        clearAutocomplete();
        return false;
      },
      COMMAND_PRIORITY_LOW
    );

    return () => {
      unregisterTab();
      unregisterEscape();
    };
  }, [editor, acceptSuggestion, clearAutocomplete]);

  return null;
}

