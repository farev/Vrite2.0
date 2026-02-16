'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  File,
  Save,
  Download,
  Printer,
  FileText,
  ChevronDown,
  Image as ImageIcon,
  Table,
} from 'lucide-react';
import Image from 'next/image';
import { getLastModifiedString } from '../lib/storage';
import UserProfile from './auth/UserProfile';

interface MenuBarProps {
  onNewDocument: () => void;
  onSaveDocument: () => void;
  onExportDocument: (format: 'pdf' | 'docx' | 'txt') => void;
  onPrint: () => void;
  onBackToHome?: () => void;
  documentTitle: string;
  onTitleChange: (title: string) => void;
  lastSaved: number | null;
  isAuthenticated: boolean;
  isTemporaryDocument: boolean;
  onInsertImage?: () => void;
  onInsertTable?: (rows: number, columns: number) => void;
  onInsertEquation?: () => void;
}

export default function MenuBar({
  onNewDocument,
  onSaveDocument,
  onExportDocument,
  onPrint,
  onBackToHome,
  documentTitle,
  onTitleChange,
  lastSaved,
  isAuthenticated,
  isTemporaryDocument,
  onInsertImage,
  onInsertTable,
  onInsertEquation,
}: MenuBarProps) {
  type DropdownKey = 'file' | 'export' | 'insert' | 'table';
  const [openDropdown, setOpenDropdown] = useState<DropdownKey | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(documentTitle);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);

  const toggleDropdown = (key: DropdownKey) => {
    setOpenDropdown((prev) => (prev === key ? null : key));
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
    <div className="menu-bar">
      <div className="menu-bar-left">
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
      
      <div className="menu-bar-items">
        <div className="menu-item">
          <button 
            className="menu-button"
            onClick={() => toggleDropdown('file')}
          >
            File <ChevronDown size={14} />
          </button>
          {(openDropdown === 'file' || openDropdown === 'export') && (
            <div className="menu-dropdown">
              <button className="menu-dropdown-item" onClick={onNewDocument}>
                <File size={16} />
                New Document
                <span className="menu-shortcut">Ctrl+N</span>
              </button>
              <button className="menu-dropdown-item" onClick={onSaveDocument}>
                <Save size={16} />
                Save
                <span className="menu-shortcut">Ctrl+S</span>
              </button>
              <div className="menu-dropdown-divider" />
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
                    onClick={() => onExportDocument('pdf')}
                  >
                    PDF Document
                  </button>
                  <button 
                    className="menu-dropdown-item"
                    onClick={() => onExportDocument('docx')}
                  >
                    Word Document
                  </button>
                  <button 
                    className="menu-dropdown-item"
                    onClick={() => onExportDocument('txt')}
                  >
                    Text File
                  </button>
                </div>
              )}
              <div className="menu-dropdown-divider" />
              <button className="menu-dropdown-item" onClick={onPrint}>
                <Printer size={16} />
                Print
                <span className="menu-shortcut">Ctrl+P</span>
              </button>
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
            Insert <ChevronDown size={14} />
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
          <button className="menu-button">Format</button>
        </div>
        
        <div className="menu-item">
          <button className="menu-button">Tools</button>
        </div>
        
        <div className="menu-spacer" style={{ flex: 1 }}></div>
        
        <div className="menu-item">
          <UserProfile />
        </div>
      </div>
    </div>
  );
}
