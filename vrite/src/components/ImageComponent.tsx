'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection';
import { $getNodeByKey, $getSelection, $isNodeSelection, $setSelection, $createNodeSelection, type NodeKey } from 'lexical';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type,
  Trash2,
  MessageSquare,
} from 'lucide-react';
import ImageResizer from './ui/ImageResizer';
import { $isImageNode, type ImageAlignment } from './nodes/ImageNode';

interface ImageComponentProps {
  src: string;
  altText: string;
  width: 'inherit' | number;
  height: 'inherit' | number;
  maxWidth: number;
  alignment: ImageAlignment;
  caption: string;
  showCaption: boolean;
  borderWidth: number;
  borderColor: string;
  shadowEnabled: boolean;
  nodeKey: NodeKey;
}

export default function ImageComponent({
  src,
  altText,
  width,
  height,
  maxWidth,
  alignment,
  caption,
  showCaption,
  borderWidth,
  borderColor,
  shadowEnabled,
  nodeKey,
}: ImageComponentProps): React.ReactElement {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);
  const [isResizing, setIsResizing] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [isEditingAlt, setIsEditingAlt] = useState(false);
  const [captionValue, setCaptionValue] = useState(caption);
  const [altValue, setAltValue] = useState(altText);
  const imageRef = useRef<HTMLImageElement>(null);
  const captionInputRef = useRef<HTMLInputElement>(null);
  const altInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCaptionValue(caption);
  }, [caption]);

  useEffect(() => {
    setAltValue(altText);
  }, [altText]);

  // Show toolbar when selected
  useEffect(() => {
    setShowToolbar(isSelected && !isResizing);
  }, [isSelected, isResizing]);

  // Click handler to select image
  const onClick = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      editor.update(() => {
        // Get the current selection
        const selection = $getSelection();

        // Create a new NodeSelection with this node
        if (!$isNodeSelection(selection) || !selection.has(nodeKey)) {
          const nodeSelection = $createNodeSelection();
          nodeSelection.add(nodeKey);
          $setSelection(nodeSelection);
        }
      });
    },
    [editor, nodeKey]
  );

  // Keyboard handlers
  useEffect(() => {
    if (!isSelected) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        editor.update(() => {
          const node = $getNodeByKey(nodeKey);
          if ($isImageNode(node)) {
            node.remove();
          }
        });
      } else if (event.key === 'Escape') {
        clearSelection();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSelected, editor, nodeKey, clearSelection]);

  // Resize handlers
  const onResizeStart = useCallback(() => {
    setIsResizing(true);
  }, []);

  const onResizeEnd = useCallback(
    (newWidth: number, newHeight: number) => {
      setTimeout(() => setIsResizing(false), 200);

      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isImageNode(node)) {
          node.setWidthAndHeight(newWidth, newHeight);
        }
      });
    },
    [editor, nodeKey]
  );

  // Alignment handler
  const handleAlignment = (newAlignment: ImageAlignment) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isImageNode(node)) {
        node.setAlignment(newAlignment);
      }
    });
  };

  // Caption handlers
  const handleToggleCaption = () => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isImageNode(node)) {
        const newShowCaption = !showCaption;
        node.setShowCaption(newShowCaption);
        if (newShowCaption) {
          setIsEditingCaption(true);
        }
      }
    });
  };

  const handleCaptionSave = () => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isImageNode(node)) {
        node.setCaption(captionValue);
      }
    });
    setIsEditingCaption(false);
  };

  const handleCaptionKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      handleCaptionSave();
    } else if (e.key === 'Escape') {
      setCaptionValue(caption);
      setIsEditingCaption(false);
    }
  };

  // Alt text handlers
  const handleAltTextSave = () => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isImageNode(node)) {
        node.setAltText(altValue);
      }
    });
    setIsEditingAlt(false);
  };

  const handleAltKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      handleAltTextSave();
    } else if (e.key === 'Escape') {
      setAltValue(altText);
      setIsEditingAlt(false);
    }
  };

  // Delete handler
  const handleDelete = () => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isImageNode(node)) {
        node.remove();
      }
    });
  };

  // Focus caption input when editing starts
  useEffect(() => {
    if (isEditingCaption && captionInputRef.current) {
      captionInputRef.current.focus();
    }
  }, [isEditingCaption]);

  // Focus alt input when editing starts
  useEffect(() => {
    if (isEditingAlt && altInputRef.current) {
      altInputRef.current.focus();
    }
  }, [isEditingAlt]);

  // Preserve aspect ratio: if width/height are numbers, use them; otherwise constrain by maxWidth
  const computedWidth = width === 'inherit' ? maxWidth : width;
  const computedHeight = height === 'inherit' ? 'auto' : height;

  return (
    <div className={`image-wrapper image-align-${alignment}`}>
      <div
        className={`image-container ${isSelected ? 'image-selected' : ''}`}
        onClick={onClick}
        contentEditable={false}
        style={{
          border: borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : undefined,
          boxShadow: shadowEnabled ? '0 4px 12px rgba(0,0,0,0.15)' : undefined,
          maxWidth: maxWidth,
        }}
      >
        {/* Floating toolbar */}
        {showToolbar && (
          <div className="image-toolbar">
            <button
              className={alignment === 'left' ? 'active' : ''}
              onClick={() => handleAlignment('left')}
              title="Align Left"
            >
              <AlignLeft size={16} />
            </button>
            <button
              className={alignment === 'center' ? 'active' : ''}
              onClick={() => handleAlignment('center')}
              title="Align Center"
            >
              <AlignCenter size={16} />
            </button>
            <button
              className={alignment === 'right' ? 'active' : ''}
              onClick={() => handleAlignment('right')}
              title="Align Right"
            >
              <AlignRight size={16} />
            </button>

            <div className="image-toolbar-divider" />

            <button
              className={showCaption ? 'active' : ''}
              onClick={handleToggleCaption}
              title="Toggle Caption"
            >
              <MessageSquare size={16} />
            </button>

            <button onClick={() => setIsEditingAlt(true)} title="Edit Alt Text">
              <Type size={16} />
            </button>

            <div className="image-toolbar-divider" />

            <button onClick={handleDelete} title="Delete Image">
              <Trash2 size={16} />
            </button>
          </div>
        )}

        {/* Image */}
        <img
          ref={imageRef}
          src={src}
          alt={altText}
          draggable={false}
          style={{
            width: computedWidth,
            height: computedHeight,
          }}
        />

        {/* Resize handles */}
        {isSelected && !isResizing && (
          <ImageResizer
            imageRef={imageRef}
            maxWidth={maxWidth}
            onResizeStart={onResizeStart}
            onResizeEnd={onResizeEnd}
          />
        )}

        {/* Alt text edit overlay */}
        {isEditingAlt && (
          <div className="image-alt-edit">
            <input
              ref={altInputRef}
              type="text"
              value={altValue}
              onChange={(e) => setAltValue(e.target.value)}
              onKeyDown={handleAltKeyDown}
              onBlur={handleAltTextSave}
              placeholder="Alt text..."
            />
          </div>
        )}
      </div>

      {/* Caption */}
      {showCaption && (
        <div className="image-caption">
          {isEditingCaption ? (
            <input
              ref={captionInputRef}
              className="image-caption-input"
              type="text"
              value={captionValue}
              onChange={(e) => setCaptionValue(e.target.value)}
              onKeyDown={handleCaptionKeyDown}
              onBlur={handleCaptionSave}
              placeholder="Add caption..."
            />
          ) : (
            <span
              className={caption ? '' : 'image-caption-placeholder'}
              onClick={() => setIsEditingCaption(true)}
            >
              {caption || 'Add caption...'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
