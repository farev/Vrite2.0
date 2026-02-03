'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Plus, Search, MoreVertical, Trash2, Clock } from 'lucide-react';
import { listAllDocuments, getLastModifiedString, type DocumentData } from '@/lib/storage';
import { createClient } from '@/lib/supabase/client';

export default function HomePage() {
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [isLoadingRef, setIsLoadingRef] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    loadDocuments();
    loadUserInfo();
  }, []);

  const loadDocuments = async () => {
    // Prevent multiple simultaneous loads
    if (isLoadingRef) {
      console.log('[HomePage] Already loading documents, skipping...');
      return;
    }

    setIsLoadingRef(true);
    setIsLoading(true);
    try {
      const docs = await listAllDocuments();

      // Deduplicate documents by ID (keep the most recently modified version)
      const uniqueDocsMap = new Map<string, DocumentData>();
      docs.forEach(doc => {
        if (doc.id) {
          const existing = uniqueDocsMap.get(doc.id);
          if (!existing || doc.lastModified > existing.lastModified) {
            uniqueDocsMap.set(doc.id, doc);
          }
        }
      });

      const uniqueDocs = Array.from(uniqueDocsMap.values());
      console.log(`[HomePage] Loaded ${docs.length} documents, ${uniqueDocs.length} unique after deduplication`);
      setDocuments(uniqueDocs);
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setIsLoading(false);
      setIsLoadingRef(false);
    }
  };

  const loadUserInfo = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.email) {
      setUserEmail(session.user.email);
    }
  };

  const handleCreateDocument = () => {
    router.push('/document/new');
  };

  const handleOpenDocument = (documentId: string) => {
    router.push(`/document/${documentId}`);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const filteredDocuments = documents.filter(doc =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="homepage">
      {/* Header */}
      <header className="homepage-header">
        <div className="homepage-header-left">
          <div className="homepage-logo">
            <FileText size={32} />
            <span className="homepage-logo-text">Vrite</span>
          </div>
        </div>
        
        <div className="homepage-header-center">
          <div className="homepage-search">
            <Search size={20} />
            <input
              type="text"
              placeholder="Search documents"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="homepage-search-input"
            />
          </div>
        </div>

        <div className="homepage-header-right">
          <div className="homepage-user-menu">
            <button className="homepage-user-button" onClick={handleSignOut}>
              <div className="homepage-user-avatar">
                {userEmail.charAt(0).toUpperCase()}
              </div>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="homepage-main">
        {/* New Document Section */}
        <section className="homepage-new-document-section">
          <h2 className="homepage-section-title">Start a new document</h2>
          <div className="homepage-template-gallery">
            <button
              className="homepage-template-card"
              onClick={handleCreateDocument}
            >
              <div className="homepage-template-preview">
                <Plus size={48} />
              </div>
              <span className="homepage-template-label">Blank</span>
            </button>
          </div>
        </section>

        {/* Recent Documents Section */}
        <section className="homepage-documents-section">
          <div className="homepage-documents-header">
            <h2 className="homepage-section-title">Recent documents</h2>
          </div>

          {isLoading ? (
            <div className="homepage-loading">
              <div className="homepage-loading-spinner"></div>
              <p>Loading documents...</p>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="homepage-empty">
              <FileText size={64} />
              <p className="homepage-empty-title">
                {searchQuery ? 'No documents found' : 'No documents yet'}
              </p>
              <p className="homepage-empty-subtitle">
                {searchQuery
                  ? 'Try a different search term'
                  : 'Create your first document to get started'}
              </p>
              {!searchQuery && (
                <button
                  className="homepage-empty-button"
                  onClick={handleCreateDocument}
                >
                  <Plus size={20} />
                  Create Document
                </button>
              )}
            </div>
          ) : (
            <div className="homepage-documents-list">
              {filteredDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="homepage-document-card"
                  onClick={() => handleOpenDocument(doc.id!)}
                >
                  <div className="homepage-document-icon">
                    <FileText size={24} />
                  </div>
                  <div className="homepage-document-info">
                    <h3 className="homepage-document-title">{doc.title}</h3>
                    <div className="homepage-document-meta">
                      <Clock size={14} />
                      <span>Opened {getLastModifiedString(doc.lastModified)}</span>
                    </div>
                  </div>
                  <button
                    className="homepage-document-menu"
                    onClick={(e) => {
                      e.stopPropagation();
                      // TODO: Implement document menu (rename, delete, etc.)
                    }}
                  >
                    <MoreVertical size={20} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
