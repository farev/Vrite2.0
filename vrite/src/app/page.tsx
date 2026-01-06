'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import MenuBar from '@/components/MenuBar';

const DocumentEditor = dynamic(() => import('@/components/DocumentEditor'), { 
  ssr: false 
});

export default function Home() {
  const [documentTitle, setDocumentTitle] = useState('Untitled Document');
  const [lastSaved, setLastSaved] = useState<number | null>(null);

  const handleNewDocument = () => {
    if (confirm('Create a new document? Any unsaved changes will be lost.')) {
      window.location.reload();
    }
  };

  const handleSaveDocument = () => {
    // For now, just show a message - you can implement actual saving later
    alert('Save functionality will be implemented with backend storage');
  };

  const handleExportDocument = (format: 'pdf' | 'docx' | 'txt') => {
    alert(`Export as ${format.toUpperCase()} functionality will be implemented`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="app-shell">
      <MenuBar 
        onNewDocument={handleNewDocument}
        onSaveDocument={handleSaveDocument}
        onExportDocument={handleExportDocument}
        onPrint={handlePrint}
        documentTitle={documentTitle}
        onTitleChange={setDocumentTitle}
        lastSaved={lastSaved}
      />
      <DocumentEditor
        documentTitle={documentTitle}
        onTitleChange={setDocumentTitle}
        onLastSavedChange={setLastSaved}
      />
    </div>
  );
}
