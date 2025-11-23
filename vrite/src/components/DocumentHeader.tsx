'use client';

import { useState, useRef, useEffect } from 'react';
import { Save, Check } from 'lucide-react';
import { getLastModifiedString } from '../lib/storage';

interface DocumentHeaderProps {
  title: string;
  onTitleChange: (title: string) => void;
  lastSaved: number | null;
  onSave: () => void;
}

export default function DocumentHeader({
  title,
  onTitleChange,
  lastSaved,
  onSave,
}: DocumentHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(title);
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditedTitle(title);
  }, [title]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleTitleClick = () => {
    setIsEditing(true);
  };

  const handleTitleBlur = () => {
    setIsEditing(false);
    if (editedTitle.trim() !== title && editedTitle.trim() !== '') {
      onTitleChange(editedTitle.trim());
    } else {
      setEditedTitle(title);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTitleBlur();
    } else if (e.key === 'Escape') {
      setEditedTitle(title);
      setIsEditing(false);
    }
  };

  const handleSave = () => {
    onSave();
    setShowSaveConfirmation(true);
    setTimeout(() => setShowSaveConfirmation(false), 2000);
  };

  return (
    <div className="document-header">
      <div className="document-header-left">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            className="document-title-input"
            maxLength={100}
          />
        ) : (
          <h1
            className="document-title"
            onClick={handleTitleClick}
            title="Click to edit title"
          >
            {title}
          </h1>
        )}
        {lastSaved && (
          <span className="last-saved-text">
            {showSaveConfirmation ? (
              <span className="save-confirmation">
                <Check size={14} /> Saved
              </span>
            ) : (
              `Last saved ${getLastModifiedString(lastSaved)}`
            )}
          </span>
        )}
      </div>

      <div className="document-header-right">
        <button
          onClick={handleSave}
          className="save-button"
          title="Save document (Cmd/Ctrl+S)"
        >
          <Save size={18} />
          <span>Save</span>
        </button>
      </div>
    </div>
  );
}
