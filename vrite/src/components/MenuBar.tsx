'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { usePostHog } from 'posthog-js/react';
import {
  File,
  Save,
  Download,
  Printer,
  FileText,
  ChevronDown,
  Image as ImageIcon,
  Table,
  Layout,
  Trash2,
  MessageSquare,
  Upload,
} from 'lucide-react';
import Image from 'next/image';
import { getLastModifiedString } from '../lib/storage';
import UserProfile from './auth/UserProfile';
import { DOCUMENT_FORMATS } from '../lib/document-formats';

interface MenuBarProps {
  onNewDocument: () => void;
  onSaveDocument: () => void;
  onExportDocument: (format: 'pdf' | 'docx' | 'txt') => void;
  onPrint: () => void;
  onBackToHome?: () => void;
  onDeleteDocument?: () => void;
  documentTitle: string;
  onTitleChange: (title: string) => void;
  lastSaved: number | null;
  isAuthenticated: boolean;
  isTemporaryDocument: boolean;
  onInsertImage?: () => void;
  onInsertTable?: (rows: number, columns: number) => void;
  onInsertEquation?: () => void;
  onApplyFormat?: (formatKey: string) => void;
  activeFormatKey?: string;
  onImportDocument?: (file: File) => void;
  isImporting?: boolean;
}

export default function MenuBar({
  onNewDocument,
  onSaveDocument,
  onExportDocument,
  onPrint,
  onBackToHome,
  onDeleteDocument,
  documentTitle,
  onTitleChange,
  lastSaved,
  isAuthenticated,
  isTemporaryDocument,
  onInsertImage,
  onInsertTable,
  onInsertEquation,
  onApplyFormat,
  activeFormatKey,
  onImportDocument,
  isImporting,
}: MenuBarProps) {
  type DropdownKey = 'file' | 'export' | 'import' | 'insert' | 'table' | 'format' | 'feedback';
  const [openDropdown, setOpenDropdown] = useState<DropdownKey | null>(null);
  const posthog = usePostHog();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(documentTitle);
  const menuBarRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);

  const toggleDropdown = (key: DropdownKey) => {
    setOpenDropdown((prev) => {
      const nextOpen = prev === key ? null : key;
      if (nextOpen === 'feedback') {
        window.dispatchEvent(
          new CustomEvent('topbar-dropdown-opened', { detail: { source: 'feedback' } })
        );
      }
      return nextOpen;
    });
  };

  useEffect(() => {
    setDraftTitle(documentTitle);
  }, [documentTitle]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
        setHoveredCell(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, []);

  useEffect(() => {
    const handleOtherDropdownOpened = (event: Event) => {
      const customEvent = event as CustomEvent<{ source?: string }>;
      if (customEvent.detail?.source !== 'feedback' && openDropdown === 'feedback') {
        setOpenDropdown(null);
      }
    };

    window.addEventListener('topbar-dropdown-opened', handleOtherDropdownOpened);
    return () => {
      window.removeEventListener('topbar-dropdown-opened', handleOtherDropdownOpened);
    };
  }, [openDropdown]);

  const commitTitleChange = () => {
    const trimmed = draftTitle.trim();
    setIsEditingTitle(false);
    if (trimmed && trimmed !== documentTitle) {
      onTitleChange(trimmed);
      return;
    }
    setDraftTitle(documentTitle);
  };

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitTitleChange();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDraftTitle(documentTitle);
      setIsEditingTitle(false);
    }
  };

  return (
    <div className="menu-bar" ref={menuBarRef}>
      <div className="menu-bar-logo-slot">
        {onBackToHome ? (
          <button
            className="menu-bar-brand menu-bar-brand-button"
            onClick={onBackToHome}
            title="Back to home"
          >
            <Image
              src="/vrite-icon.png"
              alt="Vrite Logo"
              width={32}
              height={32}
              className="menu-brand-icon"
            />
          </button>
        ) : (
          <div className="menu-bar-brand">
            <FileText className="menu-brand-icon" />
            <span className="menu-brand-text">Vrite</span>
          </div>
        )}
      </div>

      <div className="menu-bar-center">
        <div className="menu-bar-top">
          <div className="menu-bar-title">
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                onBlur={commitTitleChange}
                onKeyDown={handleTitleKeyDown}
                className="document-title-input menu-title-input"
                maxLength={100}
              />
            ) : (
              <h1
                className="document-title menu-bar-title-text"
                onClick={() => setIsEditingTitle(true)}
                title="Click to edit title"
              >
                {documentTitle}
              </h1>
            )}
            {lastSaved && (
              <span className="last-saved-text">
                {isTemporaryDocument && !isAuthenticated ? (
                  <>
                    <span className="text-amber-600">Not saved to cloud</span>
                    {' '}&middot;{' '}
                    Saved locally {getLastModifiedString(lastSaved)}
                  </>
                ) : (
                  <>Last saved {getLastModifiedString(lastSaved)}</>
                )}
              </span>
            )}
          </div>
        </div>

        <div className="menu-bar-bottom">
          <div className="menu-bar-items">
            <div className="menu-item">
              <button
                className="menu-button"
                onClick={() => toggleDropdown('file')}
              >
                File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && onImportDocument) {
                    onImportDocument(file);
                  }
                  // Reset so the same file can be re-selected
                  e.target.value = '';
                  setOpenDropdown(null);
                }}
              />
              {(openDropdown === 'file' || openDropdown === 'export' || openDropdown === 'import') && (
                <div className="menu-dropdown">
                  <button className="menu-dropdown-item" onClick={onNewDocument}>
                    <File size={16} />
                    New Document
                    <span className="menu-shortcut">Ctrl+N</span>
                  </button>
                  <button className="menu-dropdown-item" onClick={() => {
                    posthog.capture('document_saved', { is_autosave: false });
                    onSaveDocument();
                  }}>
                    <Save size={16} />
                    Save
                    <span className="menu-shortcut">Ctrl+S</span>
                  </button>
                  {onImportDocument && (
                    <div style={{ position: 'relative' }}>
                      <button
                        className="menu-dropdown-item"
                        onClick={() => toggleDropdown('import')}
                      >
                        <Upload size={16} />
                        Import from...
                        <ChevronDown size={14} style={{ marginLeft: 'auto', transform: 'rotate(-90deg)' }} />
                      </button>
                      {openDropdown === 'import' && (
                        <div className="menu-dropdown-submenu import-dropdown-submenu">
                          <button
                            className="menu-dropdown-item"
                            onClick={() => {
                              if (fileInputRef.current) {
                                fileInputRef.current.accept = '.docx';
                                fileInputRef.current.click();
                              }
                            }}
                            disabled={isImporting}
                          >
                            Word Document (.docx)
                          </button>
                          <button
                            className="menu-dropdown-item"
                            onClick={() => {
                              if (fileInputRef.current) {
                                fileInputRef.current.accept = '.pdf';
                                fileInputRef.current.click();
                              }
                            }}
                            disabled={isImporting}
                          >
                            PDF Document (.pdf)
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    className="menu-dropdown-item"
                    onClick={() => toggleDropdown('export')}
                  >
                    <Download size={16} />
                    Export as...
                  </button>
                  {openDropdown === 'export' && (
                    <div className="menu-dropdown-submenu">
                      <button
                        className="menu-dropdown-item"
                        onClick={() => { posthog.capture('document_exported', { format: 'pdf' }); onExportDocument('pdf'); }}
                      >
                        PDF Document
                      </button>
                      <button
                        className="menu-dropdown-item"
                        onClick={() => { posthog.capture('document_exported', { format: 'docx' }); onExportDocument('docx'); }}
                      >
                        Word Document
                      </button>
                      <button
                        className="menu-dropdown-item"
                        onClick={() => { posthog.capture('document_exported', { format: 'txt' }); onExportDocument('txt'); }}
                      >
                        Text File
                      </button>
                    </div>
                  )}
                  <button className="menu-dropdown-item" onClick={onPrint}>
                    <Printer size={16} />
                    Print
                    <span className="menu-shortcut">Ctrl+P</span>
                  </button>
                  {onDeleteDocument && (
                    <>
                      <div className="menu-dropdown-divider" />
                      <button className="menu-dropdown-item menu-dropdown-item-danger" onClick={() => { onDeleteDocument(); setOpenDropdown(null); }}>
                        <Trash2 size={16} />
                        Delete document
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="menu-item">
              <button className="menu-button">Edit</button>
            </div>

            <div className="menu-item">
              <button
                className="menu-button"
                onClick={() => toggleDropdown('insert')}
              >
                Insert
              </button>
              {(openDropdown === 'insert' || openDropdown === 'table') && (
                <div className="menu-dropdown">
                  {onInsertImage && (
                    <button className="menu-dropdown-item" onClick={() => {
                      onInsertImage();
                      setOpenDropdown(null);
                    }}>
                      <ImageIcon size={16} />
                      Image
                    </button>
                  )}
                  {onInsertTable && (
                    <button
                      className="menu-dropdown-item"
                      onClick={() => toggleDropdown('table')}
                      onMouseEnter={() => toggleDropdown('table')}
                    >
                      <Table size={16} />
                      Table
                      <ChevronDown size={14} style={{ marginLeft: 'auto', transform: 'rotate(-90deg)' }} />
                    </button>
                  )}
                  {openDropdown === 'table' && onInsertTable && (
                    <div className="menu-dropdown-submenu table-grid-submenu">
                      <div className="table-grid-header">Insert Table</div>
                      <div className="table-grid-selector">
                        {Array.from({ length: 8 }, (_, row) => (
                          <div key={row} className="table-grid-row">
                            {Array.from({ length: 10 }, (_, col) => (
                              <div
                                key={col}
                                className={`table-grid-cell ${
                                  hoveredCell && row <= hoveredCell.row && col <= hoveredCell.col
                                    ? 'table-grid-cell-hover'
                                    : ''
                                }`}
                                onMouseEnter={() => setHoveredCell({ row, col })}
                                onClick={() => {
                                  onInsertTable(row + 1, col + 1);
                                  setOpenDropdown(null);
                                  setHoveredCell(null);
                                }}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                      <div className="table-grid-label">
                        {hoveredCell
                          ? `${hoveredCell.row + 1} × ${hoveredCell.col + 1} Table`
                          : '1 × 1 Table'
                        }
                      </div>
                    </div>
                  )}
                  {onInsertEquation && (
                    <button className="menu-dropdown-item" onClick={() => {
                      onInsertEquation();
                      setOpenDropdown(null);
                    }}>
                      <span style={{ fontFamily: 'serif', fontWeight: 'bold', fontSize: '16px', marginRight: '8px' }}>∑</span>
                      Equation
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="menu-item">
              <button
                className={`menu-button${openDropdown === 'format' ? ' active' : ''}`}
                onClick={() => toggleDropdown('format')}
              >
                Format
              </button>
              {openDropdown === 'format' && (
                <div className="menu-dropdown">
                  <div className="menu-dropdown-section-label">Document Format</div>
                  {Object.entries(DOCUMENT_FORMATS).map(([key, preset]) => (
                    <button
                      key={key}
                      className={`menu-dropdown-item format-preset-item${activeFormatKey === key ? ' active' : ''}`}
                      onClick={() => {
                        onApplyFormat?.(key);
                        setOpenDropdown(null);
                      }}
                    >
                      <Layout size={14} className="menu-dropdown-item-icon" />
                      <span className="format-preset-label">
                        <span className="format-preset-name">{preset.label}</span>
                        <span className="format-preset-desc">{preset.description}</span>
                      </span>
                      {preset.columns === 2 && (
                        <span className="format-preset-badge">2 col</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="menu-item">
              <button className="menu-button">Tools</button>
            </div>
          </div>
        </div>
      </div>

      <div className="menu-bar-actions">
        <div className="menu-item menu-feedback-item">
          <button
            className="menu-button menu-feedback-button"
            onClick={() => toggleDropdown('feedback')}
            aria-haspopup="menu"
            aria-expanded={openDropdown === 'feedback'}
          >
            <MessageSquare size={14} />
            Feedback
          </button>
          {openDropdown === 'feedback' && (
            <div className="menu-dropdown menu-feedback-dropdown" role="menu">
              <div className="menu-feedback-title">Share Feedback</div>
              <a
                className="menu-dropdown-item menu-feedback-link"
                href="mailto:fabian@vibewrite.work"
              >
                fabian@vibewrite.work
              </a>
              <a
                className="menu-dropdown-item menu-feedback-link"
                href="mailto:carlos@vibewrite.work"
              >
                carlos@vibewrite.work
              </a>
              <a
                className="menu-dropdown-item menu-feedback-link"
                href="https://calendly.com/fabiareor/30min"
                target="_blank"
                rel="noopener noreferrer"
              >
                Book a call
              </a>
            </div>
          )}
        </div>

        <div className="menu-bar-profile-slot">
          <UserProfile />
        </div>
      </div>
    </div>
  );
}
