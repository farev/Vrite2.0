'use client';

import { useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import MenuBar from '@/components/MenuBar';

const DocumentEditor = dynamic(() => import('@/components/DocumentEditor'), { 
  ssr: false 
});

export default function Home() {
  const [documentTitle, setDocumentTitle] = useState('Untitled Document');
  const editorRef = useRef<any>(null);

  const handleNewDocument = () => {
    if (confirm('Create a new document? Any unsaved changes will be lost.')) {
      window.location.reload();
    }
  };

  const handleSaveDocument = () => {
    // Auto-save is already implemented in DocumentEditor
    alert('Document is auto-saved to local storage');
  };

  const handleExportDocument = async (format: 'pdf' | 'docx' | 'txt') => {
    try {
      if (format === 'pdf') {
        // For PDF, use browser print
        window.print();
        return;
      }

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
      }
    } catch (error) {
      console.error('Export error:', error);
      alert(`Failed to export as ${format.toUpperCase()}`);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-white">
      <MenuBar 
        onNewDocument={handleNewDocument}
        onSaveDocument={handleSaveDocument}
        onExportDocument={handleExportDocument}
        onPrint={handlePrint}
      />
      <DocumentEditor />
    </div>
  );
}
