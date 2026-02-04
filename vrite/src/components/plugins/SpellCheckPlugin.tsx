'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $isTextNode, type LexicalNode } from 'lexical';

type SpellingError = {
  word: string;
  suggestions: string[];
  nodeKey: string;
  offset: number;
};

export function SpellCheckPlugin() {
  const [editor] = useLexicalComposerContext();
  const [isReady, setIsReady] = useState(false);
  const dictionaryRef = useRef<Set<string>>(new Set());
  const frequencyRef = useRef<Map<string, number>>(new Map());
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [errors, setErrors] = useState<SpellingError[]>([]);
  const [selectedError, setSelectedError] = useState<SpellingError | null>(null);
  const lastCheckedContent = useRef<string>('');
  const ignoredWordsRef = useRef<Set<string>>(new Set());

  // Load dictionary on mount
  useEffect(() => {
    console.log('[SpellCheck] Initializing spell checker...');

    // Load dictionary
    const dictPromise = fetch('/dictionaries/en-US.txt')
      .then((response) => response.text())
      .then((text) => {
        const words = text
          .split('\n')
          .map((w) => w.trim().toLowerCase())
          .filter((w) => w.length > 0);

        dictionaryRef.current = new Set(words);
        console.log(`[SpellCheck] Loaded ${words.length} words`);
      });

    // Load frequency data
    const freqPromise = fetch('/dictionaries/en-US-freq.txt')
      .then((response) => response.text())
      .then((text) => {
        text.split('\n').forEach((line) => {
          const parts = line.split('\t');
          if (parts.length === 2) {
            const word = parts[0].toLowerCase();
            const freq = parseInt(parts[1], 10);
            if (!isNaN(freq)) {
              frequencyRef.current.set(word, freq);
            }
          }
        });
        console.log(`[SpellCheck] Loaded ${frequencyRef.current.size} word frequencies`);
      })
      .catch((error) => {
        console.warn('[SpellCheck] Failed to load frequency data:', error);
      });

    // Wait for both to load
    Promise.all([dictPromise, freqPromise])
      .then(() => {
        setIsReady(true);
      })
      .catch((error) => {
        console.error('[SpellCheck] Failed to load dictionary:', error);
      });
  }, []);

  // Debounced spell check on content change
  useEffect(() => {
    if (!isReady) {
      return;
    }

    const removeUpdateListener = editor.registerUpdateListener(({ editorState }) => {
      // Clear existing timeout
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }

      // Set new debounced check
      checkTimeoutRef.current = setTimeout(() => {
        editorState.read(() => {
          performSpellCheck();
        });
      }, 300);
    });

    return () => {
      removeUpdateListener();
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, [editor, isReady]);

  const performSpellCheck = () => {
    if (!isReady || dictionaryRef.current.size === 0) {
      return;
    }

    // Get current content to check if it changed
    let currentContent = '';
    editor.getEditorState().read(() => {
      const root = $getRoot();
      currentContent = root.getTextContent();
    });

    // Skip if content hasn't changed
    if (currentContent === lastCheckedContent.current) {
      return;
    }

    lastCheckedContent.current = currentContent;

    const startTime = performance.now();
    const foundErrors: SpellingError[] = [];

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const allTextNodes: Array<{ node: LexicalNode; text: string; key: string }> = [];

      // Collect all text nodes
      const collectTextNodes = (node: LexicalNode) => {
        if ($isTextNode(node)) {
          const nodeType = node.getType();
          if (nodeType === 'text') {
            allTextNodes.push({
              node,
              text: node.getTextContent(),
              key: node.getKey(),
            });
          }
        }

        if ('getChildren' in node && typeof node.getChildren === 'function') {
          const children = node.getChildren() as LexicalNode[];
          children.forEach(collectTextNodes);
        }
      };

      collectTextNodes(root);

      // Check each text node for errors
      allTextNodes.forEach(({ text, key }) => {
        // Split into words while preserving positions
        const wordRegex = /\b[a-zA-Z]+\b/g;
        let match;

        while ((match = wordRegex.exec(text)) !== null) {
          const word = match[0];
          const offset = match.index;

          // Skip if word is ignored
          if (ignoredWordsRef.current.has(word.toLowerCase())) {
            continue;
          }

          // Check if word is in dictionary
          if (!dictionaryRef.current.has(word.toLowerCase())) {
            const suggestions = findSuggestions(word, dictionaryRef.current, frequencyRef.current);

            if (suggestions.length > 0) {
              foundErrors.push({
                word,
                suggestions,
                nodeKey: key,
                offset,
              });
            }
          }
        }
      });
    });

    setErrors(foundErrors);

    const duration = performance.now() - startTime;
    if (duration > 50) {
      console.log(`[SpellCheck] Found ${foundErrors.length} errors in ${duration.toFixed(2)}ms`);
    }
  };

  // Apply correction
  const applyCorrection = (error: SpellingError, correction: string) => {
    editor.update(() => {
      const node = editor.getEditorState()._nodeMap.get(error.nodeKey);
      if (node && $isTextNode(node)) {
        const text = node.getTextContent();
        const before = text.substring(0, error.offset);
        const after = text.substring(error.offset + error.word.length);
        const newText = before + correction + after;

        node.setTextContent(newText);
      }
    });

    setSelectedError(null);
  };

  // Ignore error - remove from display
  const ignoreError = (error: SpellingError) => {
    // Add word to ignored set
    ignoredWordsRef.current.add(error.word.toLowerCase());

    // Remove from current errors
    setErrors((prev) => prev.filter(
      (e) => !(e.nodeKey === error.nodeKey && e.offset === error.offset)
    ));

    setSelectedError(null);
  };

  return (
    <SpellCheckOverlay
      errors={errors}
      editor={editor}
      selectedError={selectedError}
      onSelectError={setSelectedError}
      onCorrect={applyCorrection}
      onIgnore={ignoreError}
    />
  );
}

// Overlay component to render underlines - positioned within editor
function SpellCheckOverlay({
  errors,
  editor,
  selectedError,
  onSelectError,
  onCorrect,
  onIgnore,
}: {
  errors: SpellingError[];
  editor: ReturnType<typeof useLexicalComposerContext>[0];
  selectedError: SpellingError | null;
  onSelectError: (error: SpellingError | null) => void;
  onCorrect: (error: SpellingError, correction: string) => void;
  onIgnore: (error: SpellingError) => void;
}) {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [underlines, setUnderlines] = useState<Array<{
    error: SpellingError;
    x: number;
    y: number;
    width: number;
    height: number;
  }>>([]);

  // Find the editor surface to attach our overlay
  useEffect(() => {
    const editorSurface = document.querySelector('.document-editor-surface');
    if (editorSurface) {
      setPortalContainer(editorSurface as HTMLElement);
    }
  }, []);

  // Calculate positions for underlines
  useEffect(() => {
    const calculatePositions = () => {
      const editorElement = document.querySelector('.document-content-editable');
      if (!editorElement) return;

      const newUnderlines: Array<{
        error: SpellingError;
        x: number;
        y: number;
        width: number;
        height: number;
      }> = [];

      errors.forEach((error) => {
        try {
          const domNode = editor.getElementByKey(error.nodeKey);
          if (!domNode) return;

          const textNode = domNode.firstChild;
          if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;

          const range = document.createRange();
          const start = error.offset;
          const end = error.offset + error.word.length;
          const textContent = domNode.textContent || '';

          if (start >= 0 && end <= textContent.length) {
            range.setStart(textNode, start);
            range.setEnd(textNode, end);
            const rects = range.getClientRects();

            // Use the first rect (handles line wrapping)
            if (rects.length > 0) {
              const rect = rects[0];

              newUnderlines.push({
                error,
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height,
              });
            }
          }
        } catch (e) {
          // Ignore positioning errors
        }
      });

      setUnderlines(newUnderlines);
    };

    calculatePositions();

    // Recalculate on scroll or resize
    const editorElement = document.querySelector('.document-content-editable');
    const scrollContainer = document.querySelector('.document-editor-scroll');

    if (editorElement) {
      window.addEventListener('resize', calculatePositions);
      if (scrollContainer) {
        scrollContainer.addEventListener('scroll', calculatePositions);
      }

      return () => {
        window.removeEventListener('resize', calculatePositions);
        if (scrollContainer) {
          scrollContainer.removeEventListener('scroll', calculatePositions);
        }
      };
    }
  }, [errors, editor]);

  // Handle clicks on editor to detect if user clicked on a misspelled word
  useEffect(() => {
    const editorElement = document.querySelector('.document-content-editable');
    if (!editorElement) return;

    const handleEditorClick = (event: Event) => {
      const mouseEvent = event as unknown as MouseEvent;
      const clickX = mouseEvent.clientX;
      const clickY = mouseEvent.clientY;

      // Check if click is within any error's bounding box
      for (const { error, x, y, width, height } of underlines) {
        if (
          clickX >= x &&
          clickX <= x + width &&
          clickY >= y &&
          clickY <= y + height
        ) {
          onSelectError(error);
          return;
        }
      }

      // Click outside any error
      onSelectError(null);
    };

    editorElement.addEventListener('click', handleEditorClick);
    return () => editorElement.removeEventListener('click', handleEditorClick);
  }, [underlines, onSelectError]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.spell-check-menu') &&
          !target.closest('.document-content-editable')) {
        onSelectError(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onSelectError]);

  if (!portalContainer) {
    return null;
  }

  const overlayContent = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 999,
      }}
    >
      {underlines.map(({ error, x, y, width, height }) => {
        const isSelected = selectedError?.nodeKey === error.nodeKey &&
                          selectedError?.offset === error.offset;

        return (
          <div key={`${error.nodeKey}-${error.offset}`}>
            {/* Red squiggly underline - tall enough to click easily */}
            <div
              className="spell-check-underline"
              style={{
                position: 'fixed',
                left: `${x}px`,
                top: `${y}px`,
                width: `${width}px`,
                height: `${height}px`,
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 6 3' enable-background='new 0 0 6 3' height='3' width='6'%3E%3Cg fill='%23ef4444'%3E%3Cpolygon points='5.5,0 2.5,3 1.1,3 4.1,0'/%3E%3Cpolygon points='4,0 6,2 6,0.6 5.4,0'/%3E%3Cpolygon points='0,2 1,3 2.4,3 0,0.6'/%3E%3C/g%3E%3C/svg%3E")`,
                backgroundRepeat: 'repeat-x',
                backgroundPosition: 'left bottom',
                backgroundSize: '6px 3px',
                pointerEvents: 'none',
              }}
            />

            {/* Suggestion menu - Google Docs style */}
            {isSelected && (
              <div
                className="spell-check-menu"
                style={{
                  position: 'fixed',
                  left: `${x + width + 4}px`, // To the right
                  top: `${y - 4}px`, // Above (aligned with top)
                  backgroundColor: 'white',
                  border: '1px solid #dadce0',
                  borderRadius: '8px',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                  padding: '8px 0',
                  minWidth: '120px',
                  maxWidth: '200px',
                  pointerEvents: 'auto',
                  zIndex: 10000,
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                }}
              >
                {error.suggestions.slice(0, 3).map((suggestion, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '8px 16px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      color: '#202124',
                      transition: 'background-color 0.1s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f1f3f4';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                    onClick={() => onCorrect(error, suggestion)}
                  >
                    {suggestion}
                  </div>
                ))}

                {/* Divider */}
                <div
                  style={{
                    height: '1px',
                    backgroundColor: '#e8eaed',
                    margin: '4px 0',
                  }}
                />

                {/* Ignore button */}
                <div
                  style={{
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: '#5f6368',
                    transition: 'background-color 0.1s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f1f3f4';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  onClick={() => onIgnore(error)}
                >
                  <span style={{ fontSize: '16px' }}>✕</span>
                  <span>Ignore</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return createPortal(overlayContent, document.body);
}

// Find suggestions for misspelled word
function findSuggestions(word: string, dictSet: Set<string>, freqMap: Map<string, number>): string[] {
  const normalized = word.toLowerCase();
  const suggestions: Array<{ word: string; distance: number; frequency: number }> = [];

  // Try words of same length with edit distance 1
  for (const dictWord of dictSet) {
    if (Math.abs(dictWord.length - normalized.length) <= 1) {
      const distance = levenshteinDistance(normalized, dictWord);
      if (distance === 1) {
        const frequency = freqMap.get(dictWord) || 0;
        suggestions.push({ word: dictWord, distance, frequency });
        if (suggestions.length >= 20) break; // Collect more for ranking
      }
    }
  }

  // If no suggestions found, try edit distance 2
  if (suggestions.length === 0) {
    for (const dictWord of dictSet) {
      if (Math.abs(dictWord.length - normalized.length) <= 2) {
        const distance = levenshteinDistance(normalized, dictWord);
        if (distance === 2) {
          const frequency = freqMap.get(dictWord) || 0;
          suggestions.push({ word: dictWord, distance, frequency });
          if (suggestions.length >= 20) break; // Collect more for ranking
        }
      }
    }
  }

  // Sort by distance (asc), then frequency (desc)
  suggestions.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    return b.frequency - a.frequency;
  });

  // Take top 3 and match capitalization
  return suggestions.slice(0, 3).map((s) => {
    if (word[0] === word[0].toUpperCase()) {
      return s.word[0].toUpperCase() + s.word.slice(1);
    }
    return s.word;
  });
}

// Calculate Damerau-Levenshtein distance (handles transpositions)
function levenshteinDistance(a: string, b: string): number {
  const lenA = a.length;
  const lenB = b.length;
  const maxDist = lenA + lenB;

  // Create matrix with extra row/column for handling transpositions
  const H: number[][] = [];
  for (let i = 0; i < lenA + 2; i++) {
    H[i] = new Array(lenB + 2).fill(0);
  }

  H[0][0] = maxDist;
  for (let i = 0; i <= lenA; i++) {
    H[i + 1][0] = maxDist;
    H[i + 1][1] = i;
  }
  for (let j = 0; j <= lenB; j++) {
    H[0][j + 1] = maxDist;
    H[1][j + 1] = j;
  }

  const da: Map<string, number> = new Map();

  for (let i = 1; i <= lenA; i++) {
    let db = 0;
    for (let j = 1; j <= lenB; j++) {
      const k = da.get(b[j - 1]) || 0;
      const l = db;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      if (cost === 0) db = j;

      H[i + 1][j + 1] = Math.min(
        H[i][j] + cost,           // substitution
        H[i + 1][j] + 1,          // insertion
        H[i][j + 1] + 1,          // deletion
        H[k][l] + (i - k - 1) + 1 + (j - l - 1) // transposition
      );
    }

    da.set(a[i - 1], i);
  }

  return H[lenA + 1][lenB + 1];
}
