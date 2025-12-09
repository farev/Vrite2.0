'use client';

import { useState } from 'react';
import { 
  File, 
  Save, 
  Download, 
  Printer, 
  FileText,
  Settings,
  ChevronDown 
} from 'lucide-react';

interface MenuBarProps {
  onNewDocument: () => void;
  onSaveDocument: () => void;
  onExportDocument: (format: 'pdf' | 'docx' | 'txt') => void;
  onPrint: () => void;
}

export default function MenuBar({
  onNewDocument,
  onSaveDocument,
  onExportDocument,
  onPrint
}: MenuBarProps) {
  type DropdownKey = 'file' | 'export';
  const [openDropdown, setOpenDropdown] = useState<DropdownKey | null>(null);

  const toggleDropdown = (key: DropdownKey) => {
    setOpenDropdown((prev) => (prev === key ? null : key));
  };

  return (
    <div className="menu-bar">
      <div className="menu-bar-brand">
        <FileText className="menu-brand-icon" />
        <span className="menu-brand-text">Vrite</span>
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
      </div>
    </div>
  );
}
