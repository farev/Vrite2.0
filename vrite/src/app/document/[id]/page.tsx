'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import MenuBar from '@/components/MenuBar';
import { createClient } from '@/lib/supabase/client';
import { loadDocumentById, loadTemporaryDocument } from '@/lib/storage';
import { useAuth } from '@/contexts/AuthContext';

const DocumentEditor = dynamic(() => import('@/components/DocumentEditor'), { 
  ssr: false 
});

const DRIVE_PERMISSION_PROMPT_KEY = 'vrite_drive_permission_prompt_shown';

export default function DocumentPage() {
  const [documentTitle, setDocumentTitle] = useState('Untitled Document');
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const saveCallbackRef = useRef<(() => void) | null>(null);
  const insertImageCallbackRef = useRef<(() => void) | null>(null);
  const insertTableCallbackRef = useRef<((rows: number, columns: number) => void) | null>(null);
  const insertEquationCallbackRef = useRef<(() => void) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const router = useRouter();
  const params = useParams();
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
        // New document
        setDocumentId(null);
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
            setDocumentTitle(tempDoc.title);
            setLastSaved(tempDoc.lastModified);
          } else {
            console.log('[DocumentPage] New temporary document');
            // New temporary document - let editor initialize it
          }
        } else if (isAuthenticated) {
          // Load cloud document (requires authentication)
          const doc = await loadDocumentById(id);
          if (doc) {
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
  }, [params.id, isAuthenticated, router]);

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
        // Inject @page size dynamically — CSS custom properties don't resolve
        // inside @page rules, so we read the current page dimensions and inject
        // a <style> element with the correct physical size.
        const wrapper = document.querySelector('.document-editor-wrapper') as HTMLElement | null;
        const widthPx = wrapper ? parseFloat(getComputedStyle(wrapper).getPropertyValue('--page-width')) : 816;
        const heightPx = wrapper ? parseFloat(getComputedStyle(wrapper).getPropertyValue('--page-height')) : 1056;
        const pageGap = wrapper
          ? parseFloat(getComputedStyle(wrapper).getPropertyValue('--page-gap')) || 24
          : 24;
        const widthIn = (widthPx / 96).toFixed(4);
        const heightIn = (heightPx / 96).toFixed(4);

        const printStyle = document.createElement('style');
        printStyle.id = 'print-page-size';
        printStyle.textContent = `@page { size: ${widthIn}in ${heightIn}in; margin: 0; }`;
        document.head.appendChild(printStyle);

        // ── Whitespace correction ────────────────────────────────────────────
        // PaginationPlugin places page-break-containers based on screen layout.
        // In @media print we apply box-sizing:border-box to .document-header-editor,
        // shrinking it from ~144px (height:96px + padding-top:48px, content-box)
        // to exactly 96px. This shifts every container ~48px upward in print.
        // CSS alone can't reliably reposition the inline-height whitespace blocks,
        // so we measure here and set the correct heights directly before printing.
        const FOOTER_H = 96; // page-break-footer height (border-box, matches CSS)
        const HEADER_PRINT_H = 96; // .document-header-editor height after border-box fix

        const docPage = document.querySelector('.document-page') as HTMLElement | null;
        const headerEl = document.querySelector('.document-header-editor') as HTMLElement | null;
        // Actual rendered height of the header in screen mode (content-box = ~144px)
        const headerScreenH = headerEl ? headerEl.getBoundingClientRect().height : 144;
        // How much higher containers sit in print than screen (print header is shorter)
        const headerDelta = Math.round(headerScreenH - HEADER_PRINT_H);

        type Saved = {
          container: HTMLElement;
          origVar: string;
          topEl: HTMLElement | null;
          origTopHeight: string;
          origTopPriority: string;
        };
        let saved: Saved[] = [];

        const restoreCorrections = () => {
          saved.forEach(({ container, origVar, topEl, origTopHeight, origTopPriority }) => {
            origVar
              ? container.style.setProperty('--corrected-whitespace', origVar)
              : container.style.removeProperty('--corrected-whitespace');

            if (!topEl) return;
            if (origTopHeight) {
              topEl.style.setProperty('height', origTopHeight, origTopPriority);
            } else {
              topEl.style.removeProperty('height');
            }
          });
          saved = [];
        };

        const applyCorrections = () => {
          restoreCorrections();

          document.querySelectorAll<HTMLElement>('.page-break-container').forEach((container, i) => {
            if (!docPage) return;

            const topEl = container.querySelector<HTMLElement>('.page-break-top');
            const originalWhitespace = topEl ? parseFloat(topEl.style.height || '0') || 0 : 0;

            // Container's top edge relative to .document-page in screen coordinates.
            // Subtracting both rects cancels out any scroll offset.
            const containerScreenTop =
              container.getBoundingClientRect().top - docPage.getBoundingClientRect().top;

            // Convert to print coordinates:
            // - headerDelta: print header is border-box (96px), screen may differ
            // - i * pageGap: each previous break's gap is display:none in print,
            //   so screen positions are i * pageGap too large vs. print positions
            const containerPrintTop = containerScreenTop - headerDelta - (i * pageGap);

            // The footer for page-break i should end at the (i+1)-th page boundary.
            const footerEnd = (i + 1) * heightPx;
            // floor() and -2px so footer ends BEFORE the boundary, not AT it.
            // Chrome pushes content landing exactly on the boundary to the next page.
            const computedWhitespace = Math.floor(footerEnd - FOOTER_H - containerPrintTop) - 2;

            // Guard against bad measurements that can move a footer to its own page.
            // If computed whitespace collapses to <= 0, fall back to near-screen spacing.
            const newWhitespace =
              computedWhitespace > 0
                ? Math.max(0, Math.min(computedWhitespace, originalWhitespace || computedWhitespace))
                : Math.max(originalWhitespace - 2, 0);

            // Set both the CSS variable and an inline !important height on .page-break-top.
            // This survives print-media transitions where React can re-apply inline styles.
            saved.push({
              container,
              origVar: container.style.getPropertyValue('--corrected-whitespace'),
              topEl,
              origTopHeight: topEl ? topEl.style.getPropertyValue('height') : '',
              origTopPriority: topEl ? topEl.style.getPropertyPriority('height') : '',
            });

            container.style.setProperty('--corrected-whitespace', `${newWhitespace}px`);
            if (topEl) {
              topEl.style.setProperty('height', `${newWhitespace}px`, 'important');
            }
          });
        };
        applyCorrections();
        // ────────────────────────────────────────────────────────────────────

        // Let the browser commit style changes before opening print preview.
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
          });
        });

        // Keep print styles/variables applied until print flow fully finishes.
        // Some Chrome versions return from window.print() before capture completes.
        const mediaQueryList = window.matchMedia('print');
        let cleanedUp = false;
        const handleBeforePrint = () => {
          applyCorrections();
        };

        const cleanupAfterPrint = () => {
          if (cleanedUp) return;
          cleanedUp = true;

          mediaQueryList.removeEventListener('change', handlePrintMediaChange);
          window.removeEventListener('beforeprint', handleBeforePrint);

          restoreCorrections();

          if (printStyle.parentNode) {
            printStyle.parentNode.removeChild(printStyle);
          }
        };

        const handlePrintMediaChange = (e: MediaQueryListEvent) => {
          if (!e.matches) {
            cleanupAfterPrint();
          }
        };

        window.addEventListener('beforeprint', handleBeforePrint);
        window.addEventListener('afterprint', cleanupAfterPrint, { once: true });
        mediaQueryList.addEventListener('change', handlePrintMediaChange);

        window.print();
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
      />
      <DocumentEditor
        documentTitle={documentTitle}
        onTitleChange={setDocumentTitle}
        onLastSavedChange={setLastSaved}
        onSaveCallbackReady={handleSaveCallbackReady}
        onInsertImageReady={handleInsertImageReady}
        onInsertTableReady={handleInsertTableReady}
        onInsertEquationReady={handleInsertEquationReady}
        initialDocumentId={documentId}
        onDocumentIdChange={handleDocumentIdChange}
        isAuthenticated={isAuthenticated}
      />
    </div>
  );
}
