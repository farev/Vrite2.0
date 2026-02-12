'use client';

import React, { useState, useRef } from 'react';
import { X, Upload, Link as LinkIcon } from 'lucide-react';
import { compressImageToBase64 } from './nodes/ImageNode';
import type { InsertImagePayload } from './plugins/ImagePlugin';

interface ImageInsertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (payload: InsertImagePayload) => void;
}

// Scale image dimensions to reasonable display size while preserving aspect ratio
function scaleToDisplaySize(width: number, height: number): { width: number; height: number } {
  const MAX_DISPLAY_WIDTH = 600; // Maximum initial display width
  const MAX_DISPLAY_HEIGHT = 600; // Maximum initial display height

  // If image fits within bounds, use actual size
  if (width <= MAX_DISPLAY_WIDTH && height <= MAX_DISPLAY_HEIGHT) {
    return { width, height };
  }

  // Calculate scale factor to fit within bounds while preserving aspect ratio
  const widthScale = MAX_DISPLAY_WIDTH / width;
  const heightScale = MAX_DISPLAY_HEIGHT / height;
  const scale = Math.min(widthScale, heightScale);

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

export default function ImageInsertModal({ isOpen, onClose, onInsert }: ImageInsertModalProps): React.ReactElement | null {
  const [activeTab, setActiveTab] = useState<'upload' | 'link'>('upload');
  const [urlInput, setUrlInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    setActiveTab('upload');
    setUrlInput('');
    onClose();
  };

  // File upload handlers - insert immediately
  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith('image/')) {
      return;
    }

    setIsProcessing(true);

    try {
      const result = await compressImageToBase64(file);
      const displaySize = scaleToDisplaySize(result.width, result.height);
      onInsert({
        src: result.src,
        width: displaySize.width,
        height: displaySize.height,
      });
      handleClose();
    } catch (err) {
      console.error('Failed to process image:', err);
    }

    setIsProcessing(false);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
  };

  // URL insertion handler - insert immediately
  const handleEmbedImage = async () => {
    if (!urlInput.trim()) return;

    setIsProcessing(true);

    try {
      // Validate URL by loading the image
      const img = new window.Image();
      img.crossOrigin = 'anonymous';

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = urlInput;
      });

      // Convert to base64
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }
      ctx.drawImage(img, 0, 0);
      const src = canvas.toDataURL('image/png');

      const displaySize = scaleToDisplaySize(img.width, img.height);
      onInsert({
        src,
        width: displaySize.width,
        height: displaySize.height,
      });
      handleClose();
    } catch (err) {
      console.error('Failed to load image from URL:', err);
    }

    setIsProcessing(false);
  };

  const handleUrlKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEmbedImage();
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="image-modal-overlay" onClick={handleClose}>
      <div className="image-modal-notion" onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button className="image-modal-close" onClick={handleClose}>
          <X size={20} />
        </button>

        {/* Tabs */}
        <div className="image-modal-tabs-notion">
          <button
            className={`image-modal-tab-notion ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            Upload
          </button>
          <button
            className={`image-modal-tab-notion ${activeTab === 'link' ? 'active' : ''}`}
            onClick={() => setActiveTab('link')}
          >
            Embed link
          </button>
        </div>

        {/* Content */}
        <div className="image-modal-content-notion">
          {activeTab === 'upload' ? (
            <div className="image-upload-section">
              <button
                className="image-upload-button-notion"
                onClick={handleUploadClick}
                disabled={isProcessing}
              >
                <Upload size={20} />
                Upload file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={handleFileInputChange}
              />
            </div>
          ) : (
            <div className="image-link-section">
              <input
                type="text"
                className="image-link-input-notion"
                placeholder="Paste the image link..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={handleUrlKeyDown}
                autoFocus
              />
              <button
                className="image-embed-button-notion"
                onClick={handleEmbedImage}
                disabled={!urlInput.trim() || isProcessing}
              >
                Embed image
              </button>
              <p className="image-help-text">Works with any image from the web</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
