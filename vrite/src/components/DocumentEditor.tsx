'use client';

import { useState, useEffect, useCallback, useMemo, type CSSProperties } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
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
import { TRANSFORMERS } from '@lexical/markdown';
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
  Check,
  X,
  PlusCircle,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import AIAssistantSidebar, { type ContextSnippet } from './AIAssistantSidebar';
import FormattingToolbar from './FormattingToolbar';
import DiffViewer from './DiffViewer';
import DocumentHeader from './DocumentHeader';
import DiffPlugin from './plugins/DiffPlugin';
import ClipboardPlugin from './plugins/ClipboardPlugin';
import PaginationPlugin from './plugins/PaginationPlugin';
import AutocompletePlugin from './plugins/AutocompletePlugin';
import { DiffNode, $isDiffNode } from './nodes/DiffNode';
import { EquationNode } from './nodes/EquationNode';
import { AutocompleteNode } from './nodes/AutocompleteNode';
import {
  saveDocument,
  loadDocument,
  AUTO_SAVE_INTERVAL,
  type DocumentData,
} from '../lib/storage';

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
  const [editor] = useLexicalComposerContext();

  return (
    <OnChangePlugin
      onChange={(editorState) => {
        editorState.read(() => {
          const root = $getRoot();
          const textContent = root.getTextContent();
          onChange(editorState, textContent);
        });
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

function SelectionContextPopover({
  selectionInfo,
  onAddToContext,
  onDismiss,
}: {
  selectionInfo: SelectionInfo;
  onAddToContext: () => void;
  onDismiss: () => void;
}) {
  if (!selectionInfo.text || !selectionInfo.rect || typeof document === 'undefined') {
    return null;
  }

  const { rect } = selectionInfo;
  const style = {
    top: rect.top + rect.height + 8,
    left: rect.left + rect.width / 2,
  };

  const preventMouseDown = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return createPortal(
    <div
      className="ai-context-selection-popover"
      style={{ top: `${style.top}px`, left: `${style.left}px` }}
      onMouseDown={preventMouseDown}
    >
      <button type="button" className="ai-context-selection-popover-btn" onClick={onAddToContext}>
        <PlusCircle size={14} />
        Add to AI context
      </button>
      <button type="button" className="ai-context-selection-popover-dismiss" onClick={onDismiss}>
        <X size={12} />
      </button>
    </div>,
    document.body
  );
}

function DocumentPage({ 
  children, 
  pageNumber,
  margins = { top: 72, right: 72, bottom: 72, left: 72 },
  width,
  height,
}: { 
  children: React.ReactNode; 
  pageNumber: number;
  margins?: { top: number; right: number; bottom: number; left: number };
  width: number;
  height: number;
}) {
  return (
    <div 
      className="document-page"
      style={{
        width: `${width}px`,
        height: `${height}px`,
      }}
    >
      <div 
        className="document-page-content"
        style={{
          paddingTop: `${margins.top}pt`,
          paddingRight: `${margins.right}pt`,
          paddingBottom: `${margins.bottom}pt`,
          paddingLeft: `${margins.left}pt`,
        }}
      >
        {children}
      </div>
      <div className="document-page-footer">
        <span className="document-page-number">Page {pageNumber}</span>
      </div>
    </div>
  );
}

// Page size presets (width x height in pixels at 96 DPI)
const PAGE_SIZES = {
  letter: { width: 816, height: 1056, label: 'Letter (8.5" × 11")' },
  a4: { width: 794, height: 1123, label: 'A4 (210mm × 297mm)' },
  legal: { width: 816, height: 1344, label: 'Legal (8.5" × 14")' },
  tabloid: { width: 1056, height: 1632, label: 'Tabloid (11" × 17")' },
};

export default function DocumentEditor() {
  const [documentContent, setDocumentContent] = useState('');
  const [isAISidebarOpen, setIsAISidebarOpen] = useState(true);
  const [pageCount, setPageCount] = useState(1);
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
  const [editorRef, setEditorRef] = useState<LexicalEditor | null>(null);
  const [documentTitle, setDocumentTitle] = useState('Untitled Document');
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo>({ text: '', rect: null });
  const [contextSnippets, setContextSnippets] = useState<ContextSnippet[]>([]);
  const [savedEditorState, setSavedEditorState] = useState<string | undefined>(undefined);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const isDocumentEmpty = documentContent.trim().length === 0;
  
  const currentPageSize = PAGE_SIZES[pageSize];
  
  const handleEditorChange = (editorState: EditorState, content: string) => {
    setDocumentContent(content);
    setEditorState(editorState);
  };

  // Manual save function
  const handleManualSave = useCallback(() => {
    const documentData: DocumentData = {
      title: documentTitle,
      content: documentContent,
      lastModified: Date.now(),
      editorState: editorState ? JSON.stringify(editorState.toJSON()) : undefined,
    };
    saveDocument(documentData);
    setLastSaved(Date.now());
  }, [documentTitle, documentContent, editorState]);

  // Load document on mount
  useEffect(() => {
    const savedDoc = loadDocument();
    if (savedDoc) {
      setDocumentTitle(savedDoc.title);
      setLastSaved(savedDoc.lastModified);
      // Load the Lexical editor state if available
      if (savedDoc.editorState) {
        setSavedEditorState(savedDoc.editorState);
      }
    }
    setIsEditorReady(true);
  }, []);

  // Auto-save effect
  useEffect(() => {
    const autoSaveTimer = setInterval(() => {
      if (documentContent) {
        handleManualSave();
      }
    }, AUTO_SAVE_INTERVAL);

    return () => clearInterval(autoSaveTimer);
  }, [documentContent, handleManualSave]);

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

  const handleCommandK = useCallback(() => {
    setIsAISidebarOpen(true);
  }, []);

  const handleApplyChanges = (content: string) => {
    // Store the current and suggested content to trigger inline diff in editor
    setOriginalContent(documentContent);
    setSuggestedContent(content);
    setIsDiffModeActive(true);
  };

  const handleDiffComplete = useCallback(() => {
    // Called when diff has been applied to the editor
    console.log('Diff applied to editor');
  }, []);

  const handleAllDiffsResolved = useCallback((finalContent: string) => {
    // Called when all diff nodes have been accepted/rejected
    setIsDiffModeActive(false);
    setOriginalContent(null);
    setSuggestedContent(null);
    setDocumentContent(finalContent);
  }, []);

  const handleAcceptAllChanges = useCallback(() => {
    // Accept all changes - find all DiffNodes and accept them
    // Note: DiffPlugin operates on plain text for now. Future enhancement:
    // have AI backend return Lexical JSON to preserve formatting.
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
            
            if (diffType === 'addition') {
              const textNode = $createTextNode(text);
              node.replace(textNode);
            } else {
              node.remove();
            }
          }
        });
      });
    }
    setIsDiffModeActive(false);
    setOriginalContent(null);
    setSuggestedContent(null);
  }, [editorRef]);

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
    }
    setIsDiffModeActive(false);
    setOriginalContent(null);
    setSuggestedContent(null);
  }, [editorRef]);

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
      const response = await fetch('http://localhost:8000/api/format', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: documentContent,
          format_type: formatType,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to format document');
      }

      const data = await response.json();

      // Show the formatted content in diff viewer
      setOriginalContent(documentContent);
      setSuggestedContent(data.formatted_content);
      setIsDiffViewerOpen(true);
    } catch (error) {
      console.error('Error formatting document:', error);
      alert('Failed to format document. Please make sure the backend server is running.');
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

  const hasPendingSelection = useMemo(
    () => selectionInfo.text.trim().length > 0 && selectionInfo.rect !== null,
    [selectionInfo]
  );

  const handleDismissSelection = useCallback(() => {
    setSelectionInfo({ text: '', rect: null });
    if (typeof window !== 'undefined') {
      const domSelection = window.getSelection();
      domSelection?.removeAllRanges();
    }
  }, []);

  const aiPanelWidth = isAISidebarOpen ? '380px' : '64px';
  const editorLayoutStyle = { '--ai-panel-width': aiPanelWidth } as CSSProperties;
  const lexicalComposerKey = useMemo(
    () => `lexical-${Math.random().toString(36).slice(2)}`,
    [savedEditorState]
  );

  const initialConfig = useMemo(
    () => createInitialConfig(savedEditorState),
    [savedEditorState]
  );

  if (!isEditorReady) {
    return <div className="document-editor-container">Loading...</div>;
  }

  return (
    <div className="document-editor-container">
      <DocumentHeader
        title={documentTitle}
        onTitleChange={setDocumentTitle}
        lastSaved={lastSaved}
        onSave={handleManualSave}
      />
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
              
              {/* Diff Mode Banner - Shows when AI suggestions are being reviewed */}
              {isDiffModeActive && (
                <div className="diff-mode-banner">
                  <div className="diff-mode-info">
                    <Sparkles size={18} />
                    <span>Reviewing AI suggestions - click buttons on each change to accept or reject</span>
                  </div>
                  <div className="diff-mode-actions">
                    <button onClick={handleRejectAllChanges} className="diff-mode-btn diff-mode-reject-all">
                      <X size={16} />
                      Reject All
                    </button>
                    <button onClick={handleAcceptAllChanges} className="diff-mode-btn diff-mode-accept-all">
                      <Check size={16} />
                      Accept All
                    </button>
                  </div>
                </div>
              )}

              <div className="document-editor-scroll">
                <div className="document-editor-wrapper" style={{ position: 'relative' }}>
                  <div className="document-pages-container">
                    {/* Render all pages */}
                    {Array.from({ length: pageCount }, (_, i) => (
                      <DocumentPage 
                        key={i} 
                        pageNumber={i + 1} 
                        margins={documentMargins}
                        width={currentPageSize.width}
                        height={currentPageSize.height}
                      >
                        {i === 0 && (
                          <div className="document-editor-surface">
                            <RichTextPlugin
                              contentEditable={<ContentEditable className="document-content-editable" />}
                              placeholder={null}
                              ErrorBoundary={LexicalErrorBoundary}
                            />
                          </div>
                        )}
                      </DocumentPage>
                    ))}
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
                    margins={documentMargins}
                    onPageCountChange={setPageCount}
                  />

                  {/* DiffPlugin - Inserts diff nodes directly into the editor */}
                  <DiffPlugin
                    originalContent={originalContent}
                    suggestedContent={suggestedContent}
                    onDiffComplete={handleDiffComplete}
                    onAllResolved={handleAllDiffsResolved}
                  />
                  <SelectionContextPlugin onSelectionChange={setSelectionInfo} />
                  {hasPendingSelection && (
                    <SelectionContextPopover
                      selectionInfo={selectionInfo}
                      onAddToContext={handleAddSelectionToContext}
                      onDismiss={handleDismissSelection}
                    />
                  )}
                </div>
              </div>
            </div>
          </LexicalComposer>
        </div>

        <AIAssistantSidebar
          isOpen={isAISidebarOpen}
          onToggle={() => setIsAISidebarOpen(!isAISidebarOpen)}
          documentContent={documentContent}
          onApplyChanges={handleApplyChanges}
          contextSnippets={contextSnippets}
          onRemoveContextSnippet={handleRemoveContextSnippet}
          onClearContextSnippets={handleClearContextSnippets}
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
