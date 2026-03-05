'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Plus, Search, MoreVertical, Trash2, Clock } from 'lucide-react';
import { listAllDocuments, loadDocumentById, getLastModifiedString, type DocumentData } from '@/lib/storage';
import { createClient } from '@/lib/supabase/client';

import React from 'react';

// Maps basic lexical node properties to inline styles or elements
function renderLexicalNodes(editorStateStr: string): React.ReactNode[] {
  try {
    const state = JSON.parse(editorStateStr);
    const elements: React.ReactNode[] = [];
    let keyCounter = 0;

    const renderNode = (node: any): React.ReactNode => {
      const key = `node-${keyCounter++}`;

      if (node.type === 'text') {
        let style: React.CSSProperties = {};
        // Lexical formats are bitwise, but let's just handle exact bold format roughly if possible, 
        // 1=bold, 2=italic, 8=underline (simplified).
        if (node.format === 1 || node.format === 3) style.fontWeight = 'bold';
        if (node.format === 2 || node.format === 3) style.fontStyle = 'italic';
        if (node.format === 8) style.textDecoration = 'underline';

        return <span key={key} style={style}>{node.text}</span>;
      }

      if (node.type === 'heading') {
        const children = (node.children || []).map(renderNode);
        const tag = (node.tag as string) || 'h1'; // h1, h2, etc
        const style: React.CSSProperties = { margin: '0 0 8px 0' };
        if (node.format) style.textAlign = node.format; // center, right, etc

        switch (tag) {
          case 'h1': style.fontSize = '24px'; style.fontWeight = 'bold'; break;
          case 'h2': style.fontSize = '20px'; style.fontWeight = 'bold'; break;
          case 'h3': style.fontSize = '16px'; style.fontWeight = 'bold'; break;
          default: style.fontWeight = 'bold';
        }

        return React.createElement(tag || 'h1', { key, style }, children);
      }

      if (node.type === 'paragraph') {
        const children = (node.children || []).map(renderNode);
        const style: React.CSSProperties = { margin: '0 0 8px 0', minHeight: '1em' };
        if (node.format) style.textAlign = node.format; // center, right, etc

        return <div key={key} style={style}>{children}</div>;
      }

      // Fallback for root or unknown grouping nodes
      if (node.children) {
        return <React.Fragment key={key}>{(node.children as any[]).map(renderNode)}</React.Fragment>;
      }

      return null;
    };

    if (state.root) {
      elements.push(renderNode(state.root));
    }
    return elements;
  } catch (e) {
    return [];
  }
}

function DocumentPreviewContent({ doc }: { doc: DocumentData }) {
  const [content, setContent] = useState<React.ReactNode[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Known empty state we use for lists
    const emptyState = '{"root":{"children":[],"direction":null,"format":"","indent":0,"type":"root","version":1}}';

    if (doc.editorState && doc.editorState !== emptyState) {
      setContent(renderLexicalNodes(doc.editorState));
      setIsLoading(false);
    } else if (doc.id) {
      // It's empty (likely Google Drive list optimization), fetch it!
      let isMounted = true;
      loadDocumentById(doc.id).then(fullDoc => {
        if (isMounted) {
          if (fullDoc && fullDoc.editorState && fullDoc.editorState !== emptyState) {
            setContent(renderLexicalNodes(fullDoc.editorState));
          } else {
            setContent([]);
          }
          setIsLoading(false);
        }
      }).catch(() => {
        if (isMounted) setIsLoading(false);
      });
      return () => { isMounted = false; };

    } else {
      setContent([]);
      setIsLoading(false);
    }
  }, [doc]);

  if (isLoading || content === null) {
    return (
      <div className="doc-preview-content">
        <div className="doc-preview-line"></div>
        <div className="doc-preview-line"></div>
        <div className="doc-preview-line short"></div>
      </div>
    );
  }

  return (
    <div className="doc-preview-text-container">
      <div className="doc-preview-text">
        {content.length > 0 ? content : (
          <div className="doc-preview-content">
            <div className="doc-preview-line"></div>
            <div className="doc-preview-line"></div>
            <div className="doc-preview-line short"></div>
          </div>
        )}
      </div>
    </div>
  );
}

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
            <img src="/vibewrite-logo.png" alt="VibeWrite Logo" className="h-8 object-contain" />
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
              <div className="homepage-template-preview blank-template">
                <Plus size={48} className="text-blue-500" />
              </div>
              <span className="homepage-template-label">Blank document</span>
            </button>
            <button
              className="homepage-template-card"
              onClick={() => handleCreateDocument()}
            >
              <div className="homepage-template-preview document-template">
                <div className="template-lines">
                  <div className="tl-title"></div>
                  <div className="tl-line"></div>
                  <div className="tl-line"></div>
                  <div className="tl-line short"></div>
                </div>
              </div>
              <span className="homepage-template-label">IEEE Format</span>
            </button>
            <button
              className="homepage-template-card"
              onClick={() => handleCreateDocument()}
            >
              <div className="homepage-template-preview document-template">
                <div className="template-lines">
                  <div className="tl-title"></div>
                  <div className="tl-line"></div>
                  <div className="tl-line"></div>
                  <div className="tl-line"></div>
                </div>
              </div>
              <span className="homepage-template-label">APA Format</span>
            </button>
            <button
              className="homepage-template-card"
              onClick={() => handleCreateDocument()}
            >
              <div className="homepage-template-preview document-template">
                <div className="template-lines">
                  <div className="tl-title"></div>
                  <div className="tl-line"></div>
                  <div className="tl-line"></div>
                  <div className="tl-line"></div>
                </div>
              </div>
              <span className="homepage-template-label">MLA Format</span>
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
                  <div className="homepage-document-preview">
                    <DocumentPreviewContent doc={doc} />
                  </div>
                  <div className="homepage-document-info-bottom">
                    <h3 className="homepage-document-title">{doc.title || 'Untitled Document'}</h3>
                    <div className="homepage-document-meta-row">
                      <div className="homepage-document-icon-small">
                        <FileText size={16} color="#2563eb" />
                      </div>
                      <div className="homepage-document-meta">
                        <span>Opened {getLastModifiedString(doc.lastModified)}</span>
                      </div>
                      <button
                        className="homepage-document-menu"
                        onClick={(e) => {
                          e.stopPropagation();
                          // implement menu later
                        }}
                      >
                        <MoreVertical size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
