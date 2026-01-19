'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import MenuBar from '@/components/MenuBar';
import { createClient } from '@/lib/supabase/client';
import { loadDocumentById } from '@/lib/storage';

const DocumentEditor = dynamic(() => import('@/components/DocumentEditor'), { 
  ssr: false 
});

export default function DocumentPage() {
  const [documentTitle, setDocumentTitle] = useState('Untitled Document');
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [saveCallback, setSaveCallback] = useState<(() => void) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const router = useRouter();
  const params = useParams();
  const supabase = createClient();

  useEffect(() => {
    // Check authentication status
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
      
      if (!session) {
        console.log('[DocumentPage] No session, redirecting to login');
        router.push('/login');
        return;
      }
      
      // Verify cloud storage access
      if (!session.provider_token) {
        console.error('[DocumentPage] ⚠️ No cloud storage access token!');
        
        setTimeout(() => {
          const shouldReauth = confirm(
            '⚠️ Cloud Storage Access Missing\n\n' +
            'Your session does not have access to cloud storage.\n' +
            'You need to log out and log in again to grant permissions.\n\n' +
            'Click OK to log out now, or Cancel to continue (saving will not work).'
          );
          
          if (shouldReauth) {
            supabase.auth.signOut().then(() => {
              router.push('/login');
            });
          }
        }, 1000);
      } else {
        console.log('[DocumentPage] ✅ User authenticated with cloud storage access');
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
      if (!session) {
        console.log('[DocumentPage] Session lost, redirecting to login');
        router.push('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [router, supabase]);

  // Load document if ID is provided
  useEffect(() => {
    const loadDocument = async () => {
      const id = params.id as string;
      
      if (id === 'new') {
        // New document
        setDocumentId(null);
        setIsLoading(false);
        return;
      }

      // Load existing document
      setDocumentId(id);
      try {
        const doc = await loadDocumentById(id);
        if (doc) {
          setDocumentTitle(doc.title);
          setLastSaved(doc.lastModified);
        } else {
          console.error('[DocumentPage] Document not found');
          router.push('/');
        }
      } catch (error) {
        console.error('[DocumentPage] Failed to load document:', error);
        router.push('/');
      } finally {
        setIsLoading(false);
      }
    };

    if (isAuthenticated) {
      loadDocument();
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

  // Don't render if not authenticated (will redirect)
  if (!isAuthenticated) {
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
    if (saveCallback) {
      saveCallback();
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
        // Get HTML content from editor (clean version without UI elements)
        const contentElement = document.querySelector('.document-content-editable');
        const html = contentElement?.innerHTML || '';

        // Call PDF export API
        const response = await fetch('/api/export/pdf', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            html,
            title: documentTitle,
            pageSize: 'letter', // Could be made configurable later
          }),
        });

        if (!response.ok) {
          throw new Error('PDF export failed');
        }

        // Download the PDF
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${documentTitle}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
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
      <MenuBar 
        onNewDocument={handleNewDocument}
        onSaveDocument={handleSaveDocument}
        onExportDocument={handleExportDocument}
        onPrint={handlePrint}
        onBackToHome={handleBackToHome}
        documentTitle={documentTitle}
        onTitleChange={setDocumentTitle}
        lastSaved={lastSaved}
      />
      <DocumentEditor
        documentTitle={documentTitle}
        onTitleChange={setDocumentTitle}
        onLastSavedChange={setLastSaved}
        onSaveCallbackReady={setSaveCallback}
        initialDocumentId={documentId}
        onDocumentIdChange={handleDocumentIdChange}
      />
    </div>
  );
}
