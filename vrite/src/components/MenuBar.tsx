'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  File,
  Save,
  Download,
  Printer,
  FileText,
  ChevronDown
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
}: MenuBarProps) {
  type DropdownKey = 'file' | 'export';
  const [openDropdown, setOpenDropdown] = useState<DropdownKey | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(documentTitle);
  const titleInputRef = useRef<HTMLInputElement>(null);

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
              Last saved {getLastModifiedString(lastSaved)}
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
          <button className="menu-button">Insert</button>
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
