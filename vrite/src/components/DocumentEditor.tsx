'use client';

import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from 'react';
import {
  $getRoot,
  $getSelection,
  $createParagraphNode,
  $createTextNode,
  FORMAT_TEXT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  type EditorState,
  type LexicalEditor,
  type LexicalNode,
  $isRangeSelection,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW,
} from 'lexical';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { $convertToMarkdownString, $convertFromMarkdownString, TRANSFORMERS } from '@lexical/markdown';
import { ListItemNode, ListNode } from '@lexical/list';
import { LinkNode } from '@lexical/link';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { TableNode, TableCellNode, TableRowNode } from '@lexical/table';
import { CodeNode, CodeHighlightNode } from '@lexical/code';
import { mergeRegister } from '@lexical/utils';
import {
  Bold,
  Italic,
  Underline,
  Undo,
  Redo,
  Sparkles,
} from 'lucide-react';
import AIAssistantSidebar, { type ContextSnippet } from './AIAssistantSidebar';
import FormattingToolbar from './FormattingToolbar';
import DiffViewer from './DiffViewer';
import DiffPlugin from './plugins/DiffPlugin';
import ClipboardPlugin from './plugins/ClipboardPlugin';
import AutocompletePlugin from './plugins/AutocompletePlugin';
import PaginationPlugin from './plugins/PaginationPlugin';
import { DiffNode, $isDiffNode } from './nodes/DiffNode';
import { EquationNode } from './nodes/EquationNode';
import { AutocompleteNode } from './nodes/AutocompleteNode';
import { PageBreakNode } from './nodes/PageBreakNode';
import {
  saveDocument,
  loadDocument,
  loadDocumentById,
  AUTO_SAVE_INTERVAL,
  type DocumentData,
  saveTemporaryDocument,
  updateTemporaryDocument,
  loadTemporaryDocument,
} from '../lib/storage';
import {
  serializeLexicalToSimplified,
  type SimplifiedDocument,
} from '../lib/lexicalSerializer';
import type { LexicalChange } from '../lib/lexicalChangeApplicator';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentSync } from '../hooks/useDocumentSync';

const theme = {
  root: 'document-editor-root',
  paragraph: 'document-paragraph',
  heading: {
    h1: 'document-h1',
    h2: 'document-h2',
    h3: 'document-h3',
  },
  list: {
    nested: {
      listitem: 'document-nested-listitem',
    },
    ol: 'document-list-ol',
    ul: 'document-list-ul',
    listitem: 'document-listitem',
  },
  link: 'document-link',
  text: {
    bold: 'document-text-bold',
    italic: 'document-text-italic',
    underline: 'document-text-underline',
  },
};

function onError(error: Error) {
  console.error(error);
}

// Initial config will be created dynamically to support loading saved state
const createInitialConfig = (savedEditorState?: string) => ({
  namespace: 'DocumentEditor',
  theme,
  onError,
  nodes: [
    HeadingNode,
    ListNode,
    ListItemNode,
    QuoteNode,
    CodeNode,
    CodeHighlightNode,
    TableNode,
    TableCellNode,
    TableRowNode,
    LinkNode,
    DiffNode,
    EquationNode,
    AutocompleteNode,
    PageBreakNode,
  ],
  editorState: savedEditorState,
});

function ToolbarPlugin({ onAIToggle }: { onAIToggle?: () => void }) {
  const [editor] = useLexicalComposerContext();
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      setIsBold(selection.hasFormat('bold'));
      setIsItalic(selection.hasFormat('italic'));
      setIsUnderline(selection.hasFormat('underline'));
    }
  }, []);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        updateToolbar();
      });
    });
  }, [editor, updateToolbar]);

  return (
    <div className="toolbar">
      <div className="toolbar-section">
        <button
          type="button"
          className={`toolbar-button ${isBold ? 'active' : ''}`}
          onClick={() => {
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
          }}
          title="Bold (Ctrl+B)"
        >
          <Bold size={18} />
        </button>
        <button
          type="button"
          className={`toolbar-button ${isItalic ? 'active' : ''}`}
          onClick={() => {
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
          }}
          title="Italic (Ctrl+I)"
        >
          <Italic size={18} />
        </button>
        <button
          type="button"
          className={`toolbar-button ${isUnderline ? 'active' : ''}`}
          onClick={() => {
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline');
          }}
          title="Underline (Ctrl+U)"
        >
          <Underline size={18} />
        </button>
      </div>
      
      <div className="toolbar-divider" />
      
      <div className="toolbar-section">
        <button
          type="button"
          className="toolbar-button"
          onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
          title="Undo (Ctrl+Z)"
        >
          <Undo size={18} />
        </button>
        <button
          type="button"
          className="toolbar-button"
          onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
          title="Redo (Ctrl+Y)"
        >
          <Redo size={18} />
        </button>
      </div>
      
      <div className="toolbar-divider" />
      
      <div className="toolbar-section">
        <button
          type="button"
          className="toolbar-button ai-toolbar-button"
          onClick={onAIToggle}
          title="AI Assistant (Ctrl+K)"
        >
          <Sparkles size={18} />
        </button>
      </div>
    </div>
  );
}

function KeyboardShortcutPlugin({ onCommandK }: { onCommandK: () => void }) {
  const [editor] = useLexicalComposerContext();
  
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        onCommandK();
      }
    };

    return editor.registerRootListener((rootElement, prevRootElement) => {
      if (prevRootElement !== null) {
        prevRootElement.removeEventListener('keydown', handleKeyDown);
      }
      if (rootElement !== null) {
        rootElement.addEventListener('keydown', handleKeyDown);
      }
    });
  }, [editor, onCommandK]);

  return null;
}

function MyOnChangePlugin({ onChange }: { onChange: (editorState: EditorState, content: string) => void }) {
  return (
    <OnChangePlugin
      onChange={(editorState, editor) => {
        // Convert editor content to markdown (preserves formatting)
        let markdownContent = '';

        editor.read(() => {
          markdownContent = $convertToMarkdownString(TRANSFORMERS);
        });

        onChange(editorState, markdownContent);
      }}
    />
  );
}

function EditorRefPlugin({ setEditorRef }: { setEditorRef: (editor: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    setEditorRef(editor);
  }, [editor, setEditorRef]);

  return null;
}

function Placeholder() {
  return null;
}

type SelectionRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type SelectionInfo = {
  text: string;
  rect: SelectionRect | null;
};

function SelectionContextPlugin({ onSelectionChange }: { onSelectionChange: (info: SelectionInfo) => void }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const updateSelection = () => {
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection) && !selection.isCollapsed()) {
          const text = selection.getTextContent().trim();
          let rect: SelectionRect | null = null;
          if (typeof window !== 'undefined') {
            const domSelection = window.getSelection();
            if (domSelection && domSelection.rangeCount > 0) {
              const domRect = domSelection.getRangeAt(0).getBoundingClientRect();
              rect = {
                top: domRect.top + window.scrollY,
                left: domRect.left + window.scrollX,
                width: domRect.width,
                height: domRect.height,
              };
            }
          }
          onSelectionChange({ text, rect });
        } else {
          onSelectionChange({ text: '', rect: null });
        }
      });
    };

    const unregister = mergeRegister(
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateSelection();
          return false;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerUpdateListener(() => {
        updateSelection();
      })
    );

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateSelection);
      window.addEventListener('scroll', updateSelection, true);
    }

    return () => {
      unregister();
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', updateSelection);
        window.removeEventListener('scroll', updateSelection, true);
      }
    };
  }, [editor, onSelectionChange]);

  return null;
}

// SelectionContextPopover removed - text is now automatically added to AI context when selected

// Page size presets (width x height in pixels at 96 DPI)
const PAGE_SIZES = {
  letter: { width: 816, height: 1056, label: 'Letter (8.5" × 11")' },
  a4: { width: 794, height: 1123, label: 'A4 (210mm × 297mm)' },
  legal: { width: 816, height: 1344, label: 'Legal (8.5" × 14")' },
  tabloid: { width: 1056, height: 1632, label: 'Tabloid (11" × 17")' },
};

// Constants for pagination
const PAGE_GAP = 24; // Gap between pages in pixels
const PT_TO_PX = 1.333; // Convert points to pixels (1pt = 1.333px at 96 DPI)
const PAGE_FOOTER_HEIGHT_PX = 40; // Footer height in pixels

interface DocumentEditorProps {
  documentTitle: string;
  onTitleChange: (title: string) => void;
  onLastSavedChange: (timestamp: number) => void;
  onSaveCallbackReady?: (callback: () => void) => void;
  initialDocumentId?: string | null;
  onDocumentIdChange?: (id: string) => void;
  isAuthenticated: boolean;
}

// Track previous title to detect changes
let previousTitle = '';

// Global save lock to prevent concurrent saves
let saveInProgress = false;
let pendingSaveTimeout: NodeJS.Timeout | null = null;

export default function DocumentEditor({
  documentTitle,
  onTitleChange,
  onLastSavedChange,
  onSaveCallbackReady,
  initialDocumentId,
  onDocumentIdChange,
  isAuthenticated,
}: DocumentEditorProps) {
  const { showSignupModal, isAnonymous } = useAuth();
  const [documentContent, setDocumentContent] = useState('');
  const [documentId, setDocumentId] = useState<string | undefined>(initialDocumentId || undefined);

  // User can save to cloud if they're authenticated OR anonymous (both have Supabase sessions)
  const canSaveToCloud = isAuthenticated || isAnonymous;

  // Multi-tab sync for temporary documents
  const { updateLastKnownTimestamp } = useDocumentSync({
    documentId,
    isAuthenticated,
    onDocumentUpdated: (newContent, newTitle) => {
      console.log('[Editor] Reloading document from another tab');
      setDocumentContent(newContent);
      onTitleChange(newTitle);

      // Update the Lexical editor with the new content
      if (editorRef) {
        editorRef.update(() => {
          const root = $getRoot();
          root.clear();
          $convertFromMarkdownString(newContent, TRANSFORMERS);
        });
      }
    },
    onConflictDetected: () => {
      console.log('[Editor] Multi-tab conflict detected');
    },
  });
  const [isAISidebarOpen, setIsAISidebarOpen] = useState(true);
  const [pageSize, setPageSize] = useState<keyof typeof PAGE_SIZES>('letter');
  const [documentMargins, setDocumentMargins] = useState({
    top: 72,
    right: 72,
    bottom: 72,
    left: 72,
  });
  const [isDiffViewerOpen, setIsDiffViewerOpen] = useState(false);
  const [isDiffModeActive, setIsDiffModeActive] = useState(false);
  const [originalContent, setOriginalContent] = useState<string | null>(null);
  const [suggestedContent, setSuggestedContent] = useState<string | null>(null);
  const [pendingChanges, setPendingChanges] = useState<LexicalChange[] | null>(null);
  const [pageCount, setPageCount] = useState(1);
  const [editorRef, setEditorRef] = useState<LexicalEditor | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo>({ text: '', rect: null });
  const [contextSnippets, setContextSnippets] = useState<ContextSnippet[]>([]);
  const [isDocumentAtTop, setIsDocumentAtTop] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isDocumentEmpty = documentContent.trim().length === 0;
  const initialMountRef = useRef(true);
  const hasLoadedDocumentRef = useRef(false);
  
  const currentPageSize = PAGE_SIZES[pageSize];
  const pageStackHeight = useMemo(() => {
    if (pageCount <= 1) {
      return currentPageSize.height;
    }
    return pageCount * currentPageSize.height + (pageCount - 1) * PAGE_GAP;
  }, [currentPageSize.height, pageCount]);

  const marginsInPx = useMemo(() => ({
    top: documentMargins.top * PT_TO_PX,
    right: documentMargins.right * PT_TO_PX,
    bottom: documentMargins.bottom * PT_TO_PX,
    left: documentMargins.left * PT_TO_PX,
  }), [documentMargins]);

  const pageContentHeight = useMemo(
    () => currentPageSize.height - marginsInPx.top - marginsInPx.bottom - PAGE_FOOTER_HEIGHT_PX,
    [currentPageSize.height, marginsInPx.bottom, marginsInPx.top]
  );

  const editorWrapperStyle = useMemo(
    () =>
      ({
        '--page-width': `${currentPageSize.width}px`,
        '--page-height': `${currentPageSize.height}px`,
        '--page-gap': `${PAGE_GAP}px`,
        '--page-content-height': `${Math.max(pageContentHeight, 0)}px`,
        minHeight: `${pageStackHeight}px`,
      }) as CSSProperties,
    [currentPageSize.height, currentPageSize.width, pageContentHeight, pageStackHeight]
  );

  const editorSurfaceStyle = useMemo(
    () => ({
      paddingTop: `${documentMargins.top}pt`,
      paddingRight: `${documentMargins.right}pt`,
      paddingBottom: `${documentMargins.bottom}pt`,
      paddingLeft: `${documentMargins.left}pt`,
    }),
    [documentMargins]
  );
  
  // Detect title changes
  useEffect(() => {
    if (previousTitle && previousTitle !== documentTitle) {
      console.log('[Editor] Title changed from:', previousTitle, 'to:', documentTitle);
      setHasUnsavedChanges(true);
      // Let the debounced auto-save handle it
    }
    previousTitle = documentTitle;
  }, [documentTitle]);
  
  const handleEditorChange = (editorState: EditorState, content: string) => {
    setDocumentContent(content);
    setEditorState(editorState);
    setHasUnsavedChanges(true); // Mark document as having unsaved changes
  };

  // Manual save function with debouncing and deduplication
  const handleManualSave = useCallback(async (isManualTrigger = true) => {
    // Prevent concurrent saves using global lock
    if (saveInProgress) {
      console.log('[Editor] Save already in progress globally, skipping');
      return;
    }

    // Clear any pending save timeout
    if (pendingSaveTimeout) {
      clearTimeout(pendingSaveTimeout);
      pendingSaveTimeout = null;
    }

    saveInProgress = true;
    setIsSaving(true);

    try {
      // Check if user can save to cloud (authenticated or anonymous with Supabase session)
      if (!canSaveToCloud) {
        // No session - save to localStorage and show signup modal
        console.log('[Editor] No session - storing to localStorage');

        const tempId = documentId || (initialDocumentId && initialDocumentId.startsWith('temp-') ? initialDocumentId : undefined);

        if (editorState) {
          if (tempId) {
            // Update existing temporary document
            updateTemporaryDocument(tempId, {
              title: documentTitle,
              editorState: JSON.stringify(editorState.toJSON()),
            });
          } else {
            // Create new temporary document
            const newTempId = saveTemporaryDocument({
              title: documentTitle,
              editorState: JSON.stringify(editorState.toJSON()),
            });

            setDocumentId(newTempId);
            if (onDocumentIdChange) {
              onDocumentIdChange(newTempId);
            }
          }
        }

        const now = Date.now();
        onLastSavedChange(now);
        setHasUnsavedChanges(false);

        // Update sync timestamp
        updateLastKnownTimestamp(now);

        // Show signup modal
        showSignupModal('save');

        saveInProgress = false;
        setIsSaving(false);
        return;
      }

      // Save to cloud (works for both authenticated and anonymous users)
      if (!editorState) {
        console.error('[Editor] No editor state available for save');
        saveInProgress = false;
        setIsSaving(false);
        return;
      }

      const documentData: DocumentData = {
        id: documentId,
        title: documentTitle,
        editorState: JSON.stringify(editorState.toJSON()),
        lastModified: Date.now(),
      };

      const savedDoc = await saveDocument(documentData);

      // Update local ID if it was a new document
      if (!documentId && savedDoc.id) {
        setDocumentId(savedDoc.id);
        console.log('[Editor] New document created with ID:', savedDoc.id);

        // Notify parent to update URL
        if (onDocumentIdChange) {
          onDocumentIdChange(savedDoc.id);
        }
      }

      onLastSavedChange(savedDoc.lastModified);
      setHasUnsavedChanges(false); // Clear unsaved changes flag after successful save

      // Show signup modal for anonymous users on manual save only (not auto-save)
      if (isAnonymous && isManualTrigger) {
        console.log('[Editor] Anonymous user manual save - showing signup modal');
        showSignupModal('save');
      }
    } catch (error) {
      console.error('[Editor] Save failed:', error);

      // Provide more helpful error messages
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('Storage quota exceeded')) {
        // Show storage full modal
        showSignupModal('storage-full');
      } else if (errorMessage.includes('access not available') || errorMessage.includes('provider access token')) {
        alert(
          '❌ Cannot Save Document\n\n' +
          'Your session does not have access to Google Drive/OneDrive.\n\n' +
          'Please log out and log in again to grant storage permissions.\n\n' +
          'Make sure the OAuth provider is properly configured in Supabase.'
        );
      } else {
        alert(`Failed to save document: ${errorMessage}\n\nPlease check your connection and try again.`);
      }
    } finally {
      saveInProgress = false;
      setIsSaving(false);
    }
  }, [documentId, documentTitle, documentContent, editorState, onLastSavedChange, onDocumentIdChange, isAuthenticated, showSignupModal, initialDocumentId]);

  // Expose save callback to parent
  useEffect(() => {
    if (onSaveCallbackReady) {
      onSaveCallbackReady(() => {
        handleManualSave();
      });
    }
  }, [handleManualSave, onSaveCallbackReady]);

  // Reset the loaded flag when document ID changes
  useEffect(() => {
    hasLoadedDocumentRef.current = false;
  }, [initialDocumentId]);

  // Load document on mount (only for existing documents)
  useEffect(() => {
    // Only load once per document
    if (initialDocumentId && editorRef && !hasLoadedDocumentRef.current) {
      hasLoadedDocumentRef.current = true;

      const fetchDocument = async () => {
        console.log('[Editor] Loading document on mount:', initialDocumentId);
        try {
          const isTempDoc = initialDocumentId.startsWith('temp-');
          let savedDoc = null;

          if (isTempDoc) {
            // Load from localStorage
            console.log('[Editor] Loading temporary document from localStorage');
            const tempDoc = loadTemporaryDocument(initialDocumentId);
            if (tempDoc) {
              savedDoc = {
                id: tempDoc.id,
                title: tempDoc.title,
                editorState: tempDoc.editorState,
                lastModified: tempDoc.lastModified,
              };
            }
          } else if (isAuthenticated) {
            // Load from cloud (only if authenticated)
            savedDoc = await loadDocumentById(initialDocumentId);
          }

          if (savedDoc) {
            console.log('[Editor] Document loaded:', savedDoc.id, 'editorState length:', savedDoc.editorState?.length || 0);
            setDocumentId(savedDoc.id);
            onTitleChange(savedDoc.title);
            onLastSavedChange(savedDoc.lastModified);

            if (savedDoc.editorState) {
              // Update the Lexical editor with the loaded editor state
              console.log('[Editor] Loading from Lexical JSON');
              const parsedState = editorRef.parseEditorState(savedDoc.editorState);
              editorRef.setEditorState(parsedState);
              console.log('[Editor] Content loaded into editor');
            } else {
              console.log('[Editor] No editorState found - starting with empty document');
              editorRef.update(() => {
                const root = $getRoot();
                root.clear();
              });
            }

            // Update sync timestamp for temp docs
            if (isTempDoc) {
              updateLastKnownTimestamp(savedDoc.lastModified);
            }
          } else {
            console.log('[Editor] Document not found, starting with empty document');
          }
        } catch (error) {
          console.error('[Editor] Failed to load document:', error);
        }
      };

      fetchDocument();
    } else if (!initialDocumentId) {
      console.log('[Editor] New document - not loading existing document');
    }
  }, [initialDocumentId, editorRef, isAuthenticated]);

  // Auto-save effect with debouncing - save if there are unsaved changes
  useEffect(() => {
    // Skip auto-save on initial mount
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }

    // Debounce auto-save: only save after user stops editing for a few seconds
    if (hasUnsavedChanges && !saveInProgress) {
      // Clear existing timeout
      if (pendingSaveTimeout) {
        clearTimeout(pendingSaveTimeout);
      }

      // Set new timeout for debounced save
      pendingSaveTimeout = setTimeout(() => {
        if (!canSaveToCloud) {
          // Silent save to localStorage only (no modal)
          try {
            if (editorState) {
              const tempId = documentId || (initialDocumentId && initialDocumentId.startsWith('temp-') ? initialDocumentId : undefined);

              if (tempId) {
                updateTemporaryDocument(tempId, {
                  title: documentTitle,
                  editorState: JSON.stringify(editorState.toJSON()),
                });
              } else {
                const newTempId = saveTemporaryDocument({
                  title: documentTitle,
                  editorState: JSON.stringify(editorState.toJSON()),
                });

                setDocumentId(newTempId);
                if (onDocumentIdChange) {
                  onDocumentIdChange(newTempId);
                }
              }

              const now = Date.now();
              onLastSavedChange(now);
              setHasUnsavedChanges(false);

              // Update sync timestamp
              updateLastKnownTimestamp(now);
            }
          } catch (error) {
            console.error('[Editor] Auto-save to localStorage failed:', error);
          }
        } else {
          // Auto-save - use normal save flow (pass false to indicate auto-save)
          handleManualSave(false);
        }
      }, 3000); // 3 seconds after last change
    }

    return () => {
      if (pendingSaveTimeout) {
        clearTimeout(pendingSaveTimeout);
      }
    };
  }, [hasUnsavedChanges, documentContent, documentTitle, handleManualSave, isAuthenticated, documentId, initialDocumentId, onDocumentIdChange, onLastSavedChange]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Cmd/Ctrl+S for save
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        handleManualSave();
      }

      // Cmd/Ctrl+Shift+F for format dropdown
      // Note: This will need to be implemented in FormattingToolbar
      // For now, we'll just prevent the default browser behavior
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'F') {
        event.preventDefault();
        // TODO: Trigger format dropdown
        console.log('Format shortcut triggered - implement dropdown trigger');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleManualSave]);

  // Save on document close/unload - simplified to avoid duplicates
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Only save if there are unsaved changes and not currently saving
      if (hasUnsavedChanges && !saveInProgress) {
        console.log('[Editor] Save on close triggered');

        if (!canSaveToCloud) {
          // No session - save to localStorage synchronously
          try {
            if (editorState) {
              const tempId = documentId || (initialDocumentId && initialDocumentId.startsWith('temp-') ? initialDocumentId : undefined);

              if (tempId) {
                updateTemporaryDocument(tempId, {
                  title: documentTitle,
                  editorState: JSON.stringify(editorState.toJSON()),
                });
              } else {
                saveTemporaryDocument({
                  title: documentTitle,
                  editorState: JSON.stringify(editorState.toJSON()),
                });
              }

              console.log('[Editor] Anonymous save on close successful');
            }
          } catch (error) {
            console.error('[Editor] Failed to save to localStorage on close:', error);
          }
        } else {
          // Authenticated user - use sendBeacon for reliable save on page unload
          try {
            if (editorState) {
              const documentData = {
                id: documentId,
                title: documentTitle,
                editorState: JSON.stringify(editorState.toJSON()),
                lastModified: Date.now(),
              };

              const blob = new Blob([JSON.stringify(documentData)], { type: 'application/json' });
              const sent = navigator.sendBeacon('/api/save-on-close', blob);

              if (sent) {
                console.log('[Editor] Save beacon sent successfully');
              } else {
                console.warn('[Editor] Save beacon failed to send');
              }
            }
          } catch (error) {
            console.warn('[Editor] Failed to send save-on-close beacon:', error);
          }
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, documentContent, documentId, documentTitle, editorState, isAuthenticated, initialDocumentId]);

  const handleCommandK = useCallback(() => {
    setIsAISidebarOpen(true);
  }, []);

  // Get simplified document for AI sidebar (Lexical JSON format)
  const getSimplifiedDocument = useCallback((): SimplifiedDocument => {
    if (!editorRef) {
      return { blocks: [] };
    }

    let doc: SimplifiedDocument = { blocks: [] };

    editorRef.getEditorState().read(() => {
      const root = $getRoot();
      doc = serializeLexicalToSimplified(root);
    });

    return doc;
  }, [editorRef]);

  // Handle Lexical-based changes from AI (V2 API)
  const handleApplyLexicalChanges = useCallback((changes: LexicalChange[]) => {
    console.log('Applying Lexical changes:', changes);
    setPendingChanges(changes);
    setIsDiffModeActive(true);
  }, []);

  const handleDocumentScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = event.currentTarget.scrollTop;
    const isAtTop = scrollTop <= 1;
    setIsDocumentAtTop((prev) => (prev === isAtTop ? prev : isAtTop));
  }, []);

  const handleApplyChanges = (content: string, changes?: Array<{old_text: string, new_text: string}>) => {
    // Store the current and suggested content to trigger inline diff in editor
    // Content is markdown format
    setOriginalContent(documentContent);
    setSuggestedContent(content);
    setIsDiffModeActive(true);

    // Store changes for DiffPlugin to use
    if (changes) {
      (window as unknown as Record<string, unknown>).__vriteChanges = changes;
    }
  };

  const handleDiffComplete = useCallback(() => {
    // Called when diff has been applied to the editor
    console.log('Diff applied to editor');
  }, []);

  const handleAllDiffsResolved = useCallback(() => {
    // Called when all diff nodes have been accepted/rejected
    // The editor state is already correct - diffs were applied directly to Lexical state
    // No need to reload or convert anything
    console.log('All diffs resolved - editor state is already up to date');

    setIsDiffModeActive(false);
    setOriginalContent(null);
    setSuggestedContent(null);
    setPendingChanges(null);
    // Document content is already correct in the editor - no need to set it
  }, []);

  const handleAcceptAllChanges = useCallback(() => {
    // Accept all changes - find all DiffNodes and accept them
    if (editorRef) {
      editorRef.update(() => {
        const root = $getRoot();
        const allNodes: LexicalNode[] = [];

        // Collect all nodes
        const collectNodes = (node: LexicalNode) => {
          allNodes.push(node);
          if ('getChildren' in node && typeof node.getChildren === 'function') {
            const children = node.getChildren() as LexicalNode[];
            children.forEach(collectNodes);
          }
        };
        collectNodes(root);

        // Accept all diff nodes
        allNodes.forEach((node) => {
          if ($isDiffNode(node)) {
            const diffType = node.getDiffType();
            const text = node.getText();
            const nodeData = node.exportJSON();

            if (diffType === 'addition') {
              const textNode = $createTextNode(text);
              // Apply formatting from the diff node
              if (nodeData.isBold) textNode.toggleFormat('bold');
              if (nodeData.isItalic) textNode.toggleFormat('italic');
              node.replace(textNode);
            } else {
              node.remove();
            }
          }
        });
      });

      // Update document content state
      if (suggestedContent) {
        setDocumentContent(suggestedContent);
      }
    }
    setIsDiffModeActive(false);
    setOriginalContent(null);
    setSuggestedContent(null);
    setPendingChanges(null);
  }, [editorRef, suggestedContent]);

  const handleRejectAllChanges = useCallback(() => {
    // Reject all changes - find all DiffNodes and reject them
    if (editorRef) {
      editorRef.update(() => {
        const root = $getRoot();
        const allNodes: LexicalNode[] = [];
        
        // Collect all nodes
        const collectNodes = (node: LexicalNode) => {
          allNodes.push(node);
          if ('getChildren' in node && typeof node.getChildren === 'function') {
            const children = node.getChildren() as LexicalNode[];
            children.forEach(collectNodes);
          }
        };
        collectNodes(root);
        
        // Reject all diff nodes
        allNodes.forEach((node) => {
          if ($isDiffNode(node)) {
            const diffType = node.getDiffType();
            const originalText = node.getOriginalText();
            
            if (diffType === 'addition') {
              if (originalText) {
                node.replace($createTextNode(originalText));
              } else {
                node.remove();
              }
            } else {
              if (originalText) {
                const textNode = $createTextNode(originalText);
                node.replace(textNode);
              } else {
                node.remove();
              }
            }
          }
        });
      });

      // Update document content state
      if (originalContent) {
        setDocumentContent(originalContent);
      }
    }
    setIsDiffModeActive(false);
    setOriginalContent(null);
    setSuggestedContent(null);
    setPendingChanges(null);
  }, [editorRef, originalContent]);

  const handleAcceptChanges = (content: string) => {
    // Legacy handler for modal diff viewer
    // Note: This loses formatting. Kept for backward compatibility.
    if (editorRef) {
      editorRef.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraphs = content.split('\n');
        paragraphs.forEach((text) => {
          const paragraph = $createParagraphNode();
          paragraph.append($createTextNode(text));
          root.append(paragraph);
        });
      });
    }
    setIsDiffViewerOpen(false);
  };

  const handleRejectChanges = () => {
    // Legacy handler for modal diff viewer
    setIsDiffViewerOpen(false);
  };

  const handleMarginsChange = (newMargins: { top: number; right: number; bottom: number; left: number }) => {
    setDocumentMargins(newMargins);
  };

  const handleFormatDocument = async (formatType: string) => {
    try {
      // Get auth token for Supabase Edge Function
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      const { data, error } = await supabase.functions.invoke('format-document', {
        body: {
          content: documentContent,
          format_type: formatType,
        },
      });

      if (error) {
        throw error;
      }

      // Handle tool-based response (new format)
      if (data.type === 'tool_based' && data.changes) {
        // Apply markdown changes using DeltaApplicator
        const { DeltaApplicator } = await import('@/lib/deltaApplicator');
        const suggestedContent = DeltaApplicator.applyDeltas(documentContent, data.changes);

        // Use the same inline diff UI as regular edits
        handleApplyChanges(suggestedContent);

        console.log('Formatting applied:', data.reasoning, data.summary);
      } else if (data.formatted_content) {
        // Fallback: old format - also use inline diff
        handleApplyChanges(data.formatted_content);
      }
    } catch (error) {
      console.error('Error formatting document:', error);
      alert('Failed to format document. Please check your connection and try again.');
    }
  };

  const handleAddSelectionToContext = useCallback(() => {
    const normalized = selectionInfo.text.trim();
    if (!normalized) {
      return;
    }

    setContextSnippets((prev) => {
      if (prev.some((snippet) => snippet.text === normalized)) {
        return prev;
      }

      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      return [...prev, { id, text: normalized }];
    });
    setSelectionInfo({ text: '', rect: null });
    if (typeof window !== 'undefined') {
      const domSelection = window.getSelection();
      domSelection?.removeAllRanges();
    }
  }, [selectionInfo.text]);

  const handleRemoveContextSnippet = useCallback((id: string) => {
    setContextSnippets((prev) => prev.filter((snippet) => snippet.id !== id));
  }, []);

  const handleClearContextSnippets = useCallback(() => {
    setContextSnippets([]);
  }, []);

  // Automatically sync selected text to AI context
  useEffect(() => {
    const normalized = selectionInfo.text.trim();

    if (normalized.length > 0) {
      // Replace context with current selection
      setContextSnippets([{ id: 'current-selection', text: normalized }]);
    } else {
      // Clear context when nothing is selected
      setContextSnippets([]);
    }
  }, [selectionInfo]);

  const aiPanelWidth = isAISidebarOpen ? '380px' : '64px';
  const editorLayoutStyle = { '--ai-panel-width': aiPanelWidth } as CSSProperties;
  const lexicalComposerKey = useMemo(
    () => `lexical-${Math.random().toString(36).slice(2)}`,
    []
  );

  const initialConfig = useMemo(
    () => createInitialConfig(),
    []
  );

  return (
    <div className="document-editor-container">
      <div
        className="document-editor-body"
        style={editorLayoutStyle}
      >
        <div className="document-main-column">
          <LexicalComposer key={lexicalComposerKey} initialConfig={initialConfig}>
            <div className="document-main-stack">
              <FormattingToolbar
                onAIToggle={() => setIsAISidebarOpen(!isAISidebarOpen)}
                documentMargins={documentMargins}
                onMarginsChange={handleMarginsChange}
                onFormatDocument={handleFormatDocument}
                pageSize={pageSize}
                onPageSizeChange={(size) => setPageSize(size as keyof typeof PAGE_SIZES)}
              />
              
              <div
                className={`document-editor-scroll${isDocumentAtTop ? ' is-at-top' : ''}`}
                onScroll={handleDocumentScroll}
              >
                <div className="document-editor-wrapper" style={editorWrapperStyle}>
                  <div className="document-page">
                    <div className="document-page-content" style={editorSurfaceStyle}>
                      <div className="document-editor-surface">
                        <RichTextPlugin
                          contentEditable={
                            <ContentEditable
                              className="document-content-editable"
                              spellCheck="true"
                              autoCorrect="on"
                              autoCapitalize="on"
                            />
                          }
                          placeholder={null}
                          ErrorBoundary={LexicalErrorBoundary}
                        />
                      </div>
                    </div>
                  </div>

                  <MyOnChangePlugin onChange={handleEditorChange} />
                  <EditorRefPlugin setEditorRef={setEditorRef} />
                  <HistoryPlugin />
                  <ListPlugin />
                  <LinkPlugin />
                  <TabIndentationPlugin />
                  <KeyboardShortcutPlugin onCommandK={handleCommandK} />
                  <ClipboardPlugin />
                  <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
                  <AutocompletePlugin enabled={false} />
                  <PaginationPlugin
                    pageHeight={currentPageSize.height}
                    pageWidth={currentPageSize.width}
                    margins={marginsInPx}
                    pageGap={PAGE_GAP}
                    footerHeight={PAGE_FOOTER_HEIGHT_PX}
                    onPageCountChange={setPageCount}
                  />

                  {/* DiffPlugin - Inserts diff nodes directly into the editor */}
                  <DiffPlugin
                    changes={pendingChanges}
                    onDiffComplete={handleDiffComplete}
                    onAllResolved={handleAllDiffsResolved}
                  />
                  <SelectionContextPlugin onSelectionChange={setSelectionInfo} />
                </div>
              </div>
            </div>
          </LexicalComposer>
        </div>

        <AIAssistantSidebar
          isOpen={isAISidebarOpen}
          onToggle={() => setIsAISidebarOpen(!isAISidebarOpen)}
          getSimplifiedDocument={getSimplifiedDocument}
          onApplyLexicalChanges={handleApplyLexicalChanges}
          onApplyChanges={handleApplyChanges}
          documentContent={documentContent}
          contextSnippets={contextSnippets}
          onRemoveContextSnippet={handleRemoveContextSnippet}
          onClearContextSnippets={handleClearContextSnippets}
          isDiffModeActive={isDiffModeActive}
          onAcceptAllChanges={handleAcceptAllChanges}
          onRejectAllChanges={handleRejectAllChanges}
        />
      </div>

      <DiffViewer
        isOpen={isDiffViewerOpen}
        onClose={() => setIsDiffViewerOpen(false)}
        originalContent={originalContent || ''}
        suggestedContent={suggestedContent || ''}
        onAccept={handleAcceptChanges}
        onReject={handleRejectChanges}
        title="Review AI Changes"
      />
    </div>
  );
}
