'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import MenuBar from '@/components/MenuBar';
import { createClient } from '@/lib/supabase/client';
import { loadDocumentById, loadTemporaryDocument, deleteDocument } from '@/lib/storage';
import { deleteTemporaryDocument } from '@/lib/storage-anonymous';
import { DOCUMENT_FORMATS } from '@/lib/document-formats';
import { useAuth } from '@/contexts/AuthContext';

const DocumentEditor = dynamic(() => import('@/components/DocumentEditor'), { 
  ssr: false 
});

const DRIVE_PERMISSION_PROMPT_KEY = 'vrite_drive_permission_prompt_shown';
const PENDING_IMPORT_KEY = 'vrite_import_pending';
const PENDING_AI_PROMPT_KEY = 'vrite_initial_ai_prompt';
const PENDING_AI_PROMPT_MODE_KEY = 'vrite_initial_ai_prompt_mode';
type InitialPromptMode = 'idea' | 'improve_existing';
type PendingImportPayload = { html: string; title: string };
type QueuedInitialPrompt = { prompt: string; mode: InitialPromptMode };

export default function DocumentPage() {
  const [documentTitle, setDocumentTitle] = useState('Untitled Document');
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const saveCallbackRef = useRef<(() => void) | null>(null);
  const insertImageCallbackRef = useRef<(() => void) | null>(null);
  const insertTableCallbackRef = useRef<((rows: number, columns: number) => void) | null>(null);
  const insertEquationCallbackRef = useRef<(() => void) | null>(null);
  const applyFormatCallbackRef = useRef<((formatKey: string) => void) | null>(null);
  const [activeFormatKey, setActiveFormatKey] = useState<string>('default');
  const importCallbackRef = useRef<((html: string, title: string) => void) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [initialAIPrompt, setInitialAIPrompt] = useState<string | null>(null);
  const [initialPromptMode, setInitialPromptMode] = useState<InitialPromptMode | null>(null);
  const [pendingImportPayload, setPendingImportPayload] = useState<PendingImportPayload | null>(null);
  const [queuedInitialPrompt, setQueuedInitialPrompt] = useState<QueuedInitialPrompt | null>(null);
  const [isImportCallbackReady, setIsImportCallbackReady] = useState(false);
  // Guard: sessionStorage is cleared on the first call, so subsequent calls must
  // not overwrite state that was already successfully read.
  const hasAppliedPendingStateRef = useRef(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { showSignupModal } = useAuth();

  const shouldPromptForDrivePermissions = useCallback((session: any) => {
    if (!session?.user || session.user.is_anonymous) {
      return false;
    }

    const provider = session.user.app_metadata?.provider;
    const providers = session.user.app_metadata?.providers;
    const isGoogleUser =
      provider === 'google' || (Array.isArray(providers) && providers.includes('google'));

    return isGoogleUser && !session.provider_token;
  }, []);

  const showDrivePermissionsPromptOnce = useCallback((session: any) => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!shouldPromptForDrivePermissions(session)) {
      return;
    }

    if (sessionStorage.getItem(DRIVE_PERMISSION_PROMPT_KEY) === 'true') {
      return;
    }

    sessionStorage.setItem(DRIVE_PERMISSION_PROMPT_KEY, 'true');
    showSignupModal('permissions-missing');
  }, [showSignupModal, shouldPromptForDrivePermissions]);

  // Define all callbacks at the top level (before any conditional returns)
  const handleSaveCallbackReady = useCallback((callback: () => void) => {
    saveCallbackRef.current = callback;
  }, []);

  const handleInsertImageReady = useCallback((callback: () => void) => {
    insertImageCallbackRef.current = callback;
  }, []);

  const handleInsertTableReady = useCallback((callback: (rows: number, columns: number) => void) => {
    insertTableCallbackRef.current = callback;
  }, []);

  const handleInsertEquationReady = useCallback((callback: () => void) => {
    insertEquationCallbackRef.current = callback;
  }, []);

  const handleApplyFormatReady = useCallback((callback: (formatKey: string) => void) => {
    applyFormatCallbackRef.current = callback;
    const format = searchParams.get('format');
    if (format && DOCUMENT_FORMATS[format]) {
      callback(format);
      setActiveFormatKey(format);
    }
  }, [searchParams]);

  const handleApplyFormat = useCallback((formatKey: string) => {
    setActiveFormatKey(formatKey);
    if (applyFormatCallbackRef.current) {
      applyFormatCallbackRef.current(formatKey);
    }
  }, []);

  const handleImportCallbackReady = useCallback((callback: (html: string, title: string) => void) => {
    importCallbackRef.current = callback;
    setIsImportCallbackReady(true);
  }, []);

  const applyPendingNewDocumentState = useCallback(() => {
    // Prevent a second invocation from clearing state that was already read.
    // sessionStorage keys are removed on the first call, so any subsequent call
    // would incorrectly reset initialAIPrompt back to null.
    if (hasAppliedPendingStateRef.current) {
      return;
    }
    hasAppliedPendingStateRef.current = true;

    setPendingImportPayload(null);
    setQueuedInitialPrompt(null);

    const pendingImport = sessionStorage.getItem(PENDING_IMPORT_KEY);
    let hasQueuedImport = false;
    if (pendingImport) {
      try {
        const { html, title } = JSON.parse(pendingImport) as { html: string; title: string };
        if (typeof html === 'string' && typeof title === 'string') {
          hasQueuedImport = true;
          setPendingImportPayload({ html, title });
        } else {
          sessionStorage.removeItem(PENDING_IMPORT_KEY);
        }
      } catch {
        console.warn('[DocumentPage] Failed to parse pending import data');
        sessionStorage.removeItem(PENDING_IMPORT_KEY);
      }
    }

    const pendingPrompt = sessionStorage.getItem(PENDING_AI_PROMPT_KEY);
    const pendingPromptMode = sessionStorage.getItem(PENDING_AI_PROMPT_MODE_KEY);
    if (pendingPrompt) {
      const trimmedPrompt = pendingPrompt.trim();
      if (trimmedPrompt) {
        const mode =
          pendingPromptMode === 'idea' || pendingPromptMode === 'improve_existing'
            ? pendingPromptMode
            : 'improve_existing';
        if (hasQueuedImport) {
          setQueuedInitialPrompt({ prompt: trimmedPrompt, mode });
        } else {
          setInitialAIPrompt(trimmedPrompt);
          setInitialPromptMode(mode);
          sessionStorage.removeItem(PENDING_AI_PROMPT_KEY);
          sessionStorage.removeItem(PENDING_AI_PROMPT_MODE_KEY);
        }
      } else {
        sessionStorage.removeItem(PENDING_AI_PROMPT_KEY);
        sessionStorage.removeItem(PENDING_AI_PROMPT_MODE_KEY);
      }
    } else {
      sessionStorage.removeItem(PENDING_AI_PROMPT_MODE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!isImportCallbackReady || !pendingImportPayload || !importCallbackRef.current) {
      return;
    }

    importCallbackRef.current(pendingImportPayload.html, pendingImportPayload.title);
    setPendingImportPayload(null);
    sessionStorage.removeItem(PENDING_IMPORT_KEY);

    if (queuedInitialPrompt) {
      setInitialAIPrompt(queuedInitialPrompt.prompt);
      setInitialPromptMode(queuedInitialPrompt.mode);
      setQueuedInitialPrompt(null);
      sessionStorage.removeItem(PENDING_AI_PROMPT_KEY);
      sessionStorage.removeItem(PENDING_AI_PROMPT_MODE_KEY);
    }
  }, [isImportCallbackReady, pendingImportPayload, queuedInitialPrompt]);

  const handleImportDocument = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    setIsImporting(true);
    try {
      let result: { html: string; title: string; warnings: string[] };
      if (ext === 'docx') {
        const { importDocx } = await import('@/lib/import-docx');
        result = await importDocx(file);
      } else if (ext === 'pdf') {
        const { importPdf } = await import('@/lib/import-pdf');
        result = await importPdf(file);
      } else {
        alert('Unsupported file format. Please select a .docx or .pdf file.');
        return;
      }

      if (result.warnings.length > 0) {
        console.warn('[Import] Warnings:', result.warnings);
      }

      if (!result.html?.trim()) {
        throw new Error('Imported file contained no usable text');
      }

      // If the editor import handler is ready (same page), use it directly
      if (importCallbackRef.current) {
        importCallbackRef.current(result.html, result.title);
      } else {
        // Otherwise hand off via sessionStorage and navigate to new doc
        sessionStorage.setItem(PENDING_IMPORT_KEY, JSON.stringify({ html: result.html, title: result.title }));
        router.push('/document/new');
      }
    } catch (error) {
      console.error('[Import] Error:', error);
      alert('Failed to import file. The file may be corrupted or unsupported.');
    } finally {
      setIsImporting(false);
    }
  }, [router]);
  useEffect(() => {
    const id = params.id as string;
    const isTempDoc = id.startsWith('temp-');

    // Check authentication status
    supabase.auth.getSession().then(({ data: { session } }) => {
      const signedIn = !!session && !session.user?.is_anonymous;
      setIsAuthenticated(signedIn);

      // Allow anonymous access for temporary documents
      if (!signedIn) {
        if (isTempDoc) {
          console.log('[DocumentPage] Anonymous mode - temporary document access');
          return;
        } else {
          console.log('[DocumentPage] No session, redirecting to login');
          router.push('/login');
          return;
        }
      }

      // Verify cloud storage access for authenticated users
      if (!session.provider_token) {
        console.error('[DocumentPage] ⚠️ No cloud storage access token!');
        showDrivePermissionsPromptOnce(session);
      } else {
        console.log('[DocumentPage] ✅ User authenticated with cloud storage access');
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const signedIn = !!session && !session.user?.is_anonymous;
      setIsAuthenticated(signedIn);
      if (session) {
        showDrivePermissionsPromptOnce(session);
      }
    });

    return () => subscription.unsubscribe();
  }, [router, supabase, params.id, showDrivePermissionsPromptOnce]);

  // Load document if ID is provided
  useEffect(() => {
    const loadDocumentData = async () => {
      const id = params.id as string;
      const isTempDoc = id.startsWith('temp-');

      if (id === 'new') {
        setDocumentId(null);
        applyPendingNewDocumentState();
        setIsLoading(false);
        return;
      }

      // Load existing document
      setDocumentId(id);

      try {
        if (isTempDoc) {
          // Load temporary document from localStorage
          const tempDoc = loadTemporaryDocument(id);
          if (tempDoc) {
            setInitialAIPrompt(null);
            setDocumentTitle(tempDoc.title);
            setLastSaved(tempDoc.lastModified);
          } else {
            console.log('[DocumentPage] New temporary document');
            // New temporary document - let editor initialize it
            applyPendingNewDocumentState();
          }
        } else if (isAuthenticated) {
          // Load cloud document (requires authentication)
          const doc = await loadDocumentById(id);
          if (doc) {
            setInitialAIPrompt(null);
            setDocumentTitle(doc.title);
            setLastSaved(doc.lastModified);
          } else {
            console.error('[DocumentPage] Document not found');
            router.push('/');
          }
        }
      } catch (error) {
        console.error('[DocumentPage] Failed to load document:', error);
        if (!isTempDoc) {
          router.push('/');
        }
      } finally {
        setIsLoading(false);
      }
    };

    if (isAuthenticated !== null) {
      loadDocumentData();
    }
  }, [applyPendingNewDocumentState, params.id, isAuthenticated, router]);

  // Show loading state while checking authentication or loading document
  if (isAuthenticated === null || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Check if this is a temporary document
  const id = params.id as string;
  const isTempDoc = id.startsWith('temp-');

  // Allow anonymous users for temporary documents only
  if (!isAuthenticated && !isTempDoc) {
    return null;
  }

  const handleNewDocument = () => {
    if (confirm('Create a new document? Any unsaved changes will be lost.')) {
      router.push('/document/new');
    }
  };

  const handleBackToHome = () => {
    router.push('/');
  };

  const handleDeleteDocument = () => {
    setDeleteTarget({ id: params.id as string, title: documentTitle });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      if (deleteTarget.id.startsWith('temp-')) {
        deleteTemporaryDocument(deleteTarget.id);
      } else {
        await deleteDocument(deleteTarget.id);
      }
      router.push('/');
    } catch (err) {
      console.error('[DocumentPage] Delete failed:', err);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleSaveDocument = () => {
    // Trigger the save callback from DocumentEditor
    if (saveCallbackRef.current) {
      saveCallbackRef.current();
    }
  };

  const handleExportDocument = async (format: 'pdf' | 'docx' | 'txt') => {
    try {
      if (format === 'txt') {
        // Export as plain text
        const content = document.querySelector('.document-content-editable')?.textContent || '';
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${documentTitle}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }

      if (format === 'docx') {
        // Get HTML content from editor
        const contentElement = document.querySelector('.document-content-editable');
        const html = contentElement?.innerHTML || '';

        // Call DOCX export API
        const response = await fetch('/api/export/docx', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            html,
            title: documentTitle,
          }),
        });

        if (!response.ok) {
          throw new Error('Export failed');
        }

        // Download the file
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${documentTitle}.docx`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }

      if (format === 'pdf') {
        setIsExporting(true);
        try {
          // 1. Read page settings from data attributes (set by DocumentEditor)
          const wrapper = document.querySelector('.document-editor-wrapper') as HTMLElement | null;
          const pageSize = wrapper?.dataset.pageSize || 'letter';
          const margins = {
            top:    parseFloat(wrapper?.dataset.marginTop    || '72'),
            right:  parseFloat(wrapper?.dataset.marginRight  || '72'),
            bottom: parseFloat(wrapper?.dataset.marginBottom || '72'),
            left:   parseFloat(wrapper?.dataset.marginLeft   || '72'),
          };
          const footerShowPageNumber = wrapper?.dataset.footerShowPageNumber === 'true';

          // 2. Clone the editor content
          const contentEl = document.querySelector('.document-content-editable');
          if (!contentEl) throw new Error('Editor content not found');
          const clone = contentEl.cloneNode(true) as HTMLElement;

          // 3. Extract per-page header/footer HTML from the live DOM and the clone.
          //    Each item's .html is the full Lexical innerHTML — all inline styles
          //    (font-family, font-size, text-align, color, bold, italic, etc.) are
          //    already embedded so Puppeteer renders them pixel-for-pixel as in the editor.
          const getHFHtml = (el: Element | null): string =>
            el?.textContent?.trim() ? (el.innerHTML || '') : '';

          const globalHeaderEl = document.querySelector('.document-header-editor .hf-content-editable');
          const globalFooterEl = document.querySelector('.document-footer-editor .hf-content-editable');

          // Page count is known here: one page per break + 1
          const pageBreakContainers = Array.from(clone.querySelectorAll('.page-break-container'));
          const totalPages = pageBreakContainers.length + 1;

          // Helper: wrap footer HTML with a right-aligned "Page X of Y" if enabled.
          // We bake the page number into the HTML on the client so the server can
          // render it as part of the footer mini-PDF — no separate pdf-lib text overlay needed.
          const withPageNum = (html: string, pageNum: number): string => {
            if (!footerShowPageNumber) return html;
            const numSpan = `<span style="font-size:9pt;color:#9ca3af;white-space:nowrap;` +
              `font-family:'Times New Roman',serif;flex-shrink:0;">` +
              `Page ${pageNum} of ${totalPages}</span>`;
            return `<div style="display:flex;justify-content:space-between;` +
              `align-items:flex-end;width:100%;">` +
              `<div style="flex:1;">${html}</div>` +
              `<div style="padding-left:12pt;">${numSpan}</div></div>`;
          };

          //    Array layout (N pages total):
          //      headerItems[0]   = global header   (page 1)
          //      headerItems[1..] = page-break headers (pages 2..N)
          //      footerItems[0..N-2] = page-break footers (pages 1..N-1)
          //      footerItems[N-1] = global footer    (page N)
          const headerItems: { html: string }[] = [{ html: getHFHtml(globalHeaderEl) }];
          const footerItems: { html: string }[] = [];

          // 4. Replace page-break-containers with simple break divs; collect per-page HTML.
          let pageNum = 1;
          pageBreakContainers.forEach((container) => {
            const breakFooterEl = container.querySelector('.page-break-footer .hf-content-editable');
            const breakHeaderEl = container.querySelector('.page-break-header .hf-content-editable');
            footerItems.push({ html: withPageNum(getHFHtml(breakFooterEl), pageNum) });
            headerItems.push({ html: getHFHtml(breakHeaderEl) });
            pageNum++;

            const breakDiv = document.createElement('div');
            breakDiv.className = 'pdf-page-break';
            container.parentNode!.replaceChild(breakDiv, container);
          });
          footerItems.push({ html: withPageNum(getHFHtml(globalFooterEl), totalPages) });

          // 5. POST to Puppeteer API. The server renders each header/footer HTML as a
          //    mini vector PDF and overlays it on the correct page via pdf-lib.
          const response = await fetch('/api/export/pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              html: clone.innerHTML,
              title: documentTitle,
              pageSize,
              margins,
              headerItems,
              footerItems,
            }),
          });

          if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error((err as { error?: string }).error || 'PDF export failed');
          }

          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${documentTitle || 'document'}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
        } catch (error) {
          console.error('[PDF Export] Error:', error);
          alert('Failed to export PDF. Please try again.');
        } finally {
          setIsExporting(false);
        }
        return;
      }
    } catch (error) {
      setIsExporting(false);
      console.error('Export error:', error);
      alert(`Failed to export as ${format.toUpperCase()}`);
    }
  };

  const handlePrint = () => {
    // Use PDF export instead of browser print
    handleExportDocument('pdf');
  };

  const handleDocumentIdChange = (newId: string) => {
    console.log('[DocumentPage] Document ID changed to:', newId);
    setDocumentId(newId);
    // Update URL without reloading the page
    window.history.replaceState(null, '', `/document/${newId}`);
  };

  return (
    <div className="app-shell">
      {isExporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30">
          <div className="rounded-lg bg-white px-4 py-3 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600"></div>
              <span className="text-sm text-slate-700">Generating PDF...</span>
            </div>
          </div>
        </div>
      )}
      <MenuBar
        onNewDocument={handleNewDocument}
        onSaveDocument={handleSaveDocument}
        onExportDocument={handleExportDocument}
        onPrint={handlePrint}
        onBackToHome={handleBackToHome}
        onDeleteDocument={handleDeleteDocument}
        documentTitle={documentTitle}
        onTitleChange={setDocumentTitle}
        lastSaved={lastSaved}
        isAuthenticated={isAuthenticated}
        isTemporaryDocument={isTempDoc}
        onInsertImage={() => {
          if (insertImageCallbackRef.current) {
            insertImageCallbackRef.current();
          }
        }}
        onInsertTable={(rows, columns) => {
          if (insertTableCallbackRef.current) {
            insertTableCallbackRef.current(rows, columns);
          }
        }}
        onInsertEquation={() => {
          if (insertEquationCallbackRef.current) {
            insertEquationCallbackRef.current();
          }
        }}
        onApplyFormat={handleApplyFormat}
        activeFormatKey={activeFormatKey}
        onImportDocument={handleImportDocument}
        isImporting={isImporting}
      />
      {deleteTarget && (
        <div className="delete-modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="delete-modal-title">Delete document?</h3>
            <p className="delete-modal-body">
              &ldquo;<span className="delete-modal-docname">{deleteTarget.title}</span>&rdquo; will be permanently deleted.
            </p>
            <div className="delete-modal-actions">
              <button className="delete-modal-cancel" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
                Cancel
              </button>
              <button className="delete-modal-confirm" onClick={confirmDelete} disabled={isDeleting}>
                {isDeleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      {isImporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30">
          <div className="rounded-lg bg-white px-4 py-3 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600"></div>
              <span className="text-sm text-slate-700">Importing document...</span>
            </div>
          </div>
        </div>
      )}
      <DocumentEditor
        documentTitle={documentTitle}
        onTitleChange={setDocumentTitle}
        onLastSavedChange={setLastSaved}
        onSaveCallbackReady={handleSaveCallbackReady}
        onInsertImageReady={handleInsertImageReady}
        onInsertTableReady={handleInsertTableReady}
        onInsertEquationReady={handleInsertEquationReady}
        onApplyFormatReady={handleApplyFormatReady}
        onActiveFormatKeyChange={setActiveFormatKey}
        onImportReady={handleImportCallbackReady}
        initialDocumentId={documentId}
        initialAIPrompt={initialAIPrompt}
        initialPromptMode={initialPromptMode}
        onDocumentIdChange={handleDocumentIdChange}
        isAuthenticated={isAuthenticated}
      />
    </div>
  );
}
