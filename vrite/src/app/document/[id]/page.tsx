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

  const getCurrentPageSize = () => {
    const wrapper = document.querySelector('.document-editor-wrapper') as HTMLElement | null;
    const size = wrapper?.dataset.pageSize;
    return size === 'a4' ? 'a4' : 'letter';
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
        // Get HTML content from editor (clean version without UI elements)
        const contentElement = document.querySelector('.document-content-editable');
        if (!contentElement) {
          throw new Error('Document content not found');
        }

        setIsExporting(true);

        const pageWrapper = document.querySelector('.document-editor-wrapper') as HTMLElement | null;
        const pageContentElement = document.querySelector('.document-page-content') as HTMLElement | null;
        const pageWidth = pageWrapper
          ? getComputedStyle(pageWrapper).getPropertyValue('--page-width').trim()
          : '';
        const pageSize = getCurrentPageSize();
        const pageContentStyles = pageContentElement ? getComputedStyle(pageContentElement) : null;

        const exportRoot = document.createElement('div');
        exportRoot.className = 'pdf-export-root';
        exportRoot.style.position = 'fixed';
        exportRoot.style.left = '-99999px';
        exportRoot.style.top = '0';
        exportRoot.style.background = '#ffffff';
        exportRoot.style.color = '#0f172a';
        if (pageWidth) {
          exportRoot.style.width = pageWidth;
        }

        const exportPage = document.createElement('div');
        exportPage.className = 'document-page';
        if (pageWidth) {
          exportPage.style.width = pageWidth;
        }

        const exportPageContent = document.createElement('div');
        exportPageContent.className = 'document-page-content';
        exportPageContent.style.boxSizing = 'border-box';
        if (pageContentStyles) {
          exportPageContent.style.paddingTop = pageContentStyles.paddingTop;
          exportPageContent.style.paddingRight = pageContentStyles.paddingRight;
          exportPageContent.style.paddingBottom = pageContentStyles.paddingBottom;
          exportPageContent.style.paddingLeft = pageContentStyles.paddingLeft;
        }

        const exportContent = document.createElement('div');
        exportContent.className = 'document-content-editable';
        exportContent.innerHTML = contentElement.innerHTML;
        exportContent.style.width = '100%';

        exportPageContent.appendChild(exportContent);
        exportPage.appendChild(exportPageContent);
        exportRoot.appendChild(exportPage);
        document.body.appendChild(exportRoot);

        try {
          const html2pdfModule = await import('html2pdf.js');
          const html2pdf =
            (html2pdfModule as { default?: typeof import('html2pdf.js') }).default ??
            html2pdfModule;

          await html2pdf()
            .set({
              margin: 0,
              filename: `${documentTitle}.pdf`,
              pagebreak: { mode: ['css', 'legacy'] },
              image: { type: 'jpeg', quality: 0.98 },
              html2canvas: {
                scale: 3,
                useCORS: true,
                backgroundColor: '#ffffff',
                letterRendering: true,
              },
              jsPDF: {
                unit: 'pt',
                format: pageSize,
                orientation: 'portrait',
              },
            })
            .from(exportPage)
            .save();
        } finally {
          document.body.removeChild(exportRoot);
          setIsExporting(false);
        }
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
      />
      <DocumentEditor
        documentTitle={documentTitle}
        onTitleChange={setDocumentTitle}
        onLastSavedChange={setLastSaved}
        onSaveCallbackReady={handleSaveCallbackReady}
        onInsertImageReady={handleInsertImageReady}
        initialDocumentId={documentId}
        onDocumentIdChange={handleDocumentIdChange}
        isAuthenticated={isAuthenticated}
      />
    </div>
  );
}
