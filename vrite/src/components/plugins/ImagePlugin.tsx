'use client';

import React, { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  type LexicalCommand,
} from 'lexical';
import { $insertNodeToNearestRoot, mergeRegister } from '@lexical/utils';
import { $createImageNode, ImageNode, type ImagePayload, compressImageToBase64 } from '../nodes/ImageNode';

export type InsertImagePayload = Readonly<ImagePayload>;

// Scale image dimensions to reasonable display size while preserving aspect ratio
function scaleToDisplaySize(width: number, height: number): { width: number; height: number } {
  const MAX_DISPLAY_WIDTH = 600;
  const MAX_DISPLAY_HEIGHT = 600;

  if (width <= MAX_DISPLAY_WIDTH && height <= MAX_DISPLAY_HEIGHT) {
    return { width, height };
  }

  const widthScale = MAX_DISPLAY_WIDTH / width;
  const heightScale = MAX_DISPLAY_HEIGHT / height;
  const scale = Math.min(widthScale, heightScale);

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

export const INSERT_IMAGE_COMMAND: LexicalCommand<InsertImagePayload> = createCommand('INSERT_IMAGE_COMMAND');

export default function ImagePlugin(): React.ReactElement | null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([ImageNode])) {
      throw new Error('ImagePlugin: ImageNode not registered on editor');
    }

    const handleDragOver = (event: DragEvent) => {
      const hasFiles = event.dataTransfer?.types.includes('Files');
      if (hasFiles) {
        event.preventDefault();
        event.dataTransfer!.dropEffect = 'copy';
      }
    };

    const handleDrop = (event: DragEvent) => {
      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
      if (imageFiles.length === 0) return;

      event.preventDefault();
      event.stopPropagation();

      // Process each dropped image
      imageFiles.forEach(async (file) => {
        try {
          const { src, width, height } = await compressImageToBase64(file);
          const displaySize = scaleToDisplaySize(width, height);
          editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
            src,
            altText: file.name.replace(/\.[^/.]+$/, ''), // Remove file extension
            width: displaySize.width,
            height: displaySize.height,
          });
        } catch (err) {
          console.error('Failed to process dropped image:', err);
        }
      });
    };

    return mergeRegister(
      // Register INSERT_IMAGE_COMMAND
      editor.registerCommand<InsertImagePayload>(
        INSERT_IMAGE_COMMAND,
        (payload) => {
          const imageNode = $createImageNode(payload);
          $insertNodeToNearestRoot(imageNode);
          return true;
        },
        COMMAND_PRIORITY_EDITOR
      ),

      // Register drag-drop handlers
      editor.registerRootListener((rootElement, prevRootElement) => {
        if (prevRootElement) {
          prevRootElement.removeEventListener('dragover', handleDragOver);
          prevRootElement.removeEventListener('drop', handleDrop);
        }
        if (rootElement) {
          rootElement.addEventListener('dragover', handleDragOver);
          rootElement.addEventListener('drop', handleDrop);
        }
      })
    );
  }, [editor]);

  return null;
}
