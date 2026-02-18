'use client';

import {
  DecoratorNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
  $applyNodeReplacement,
} from 'lexical';
import { Suspense, type ReactElement } from 'react';

export type ImageAlignment = 'left' | 'center' | 'right';

export type SerializedImageNode = Spread<
  {
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
  },
  SerializedLexicalNode
>;

export interface ImagePayload {
  src: string;
  altText?: string;
  width?: 'inherit' | number;
  height?: 'inherit' | number;
  maxWidth?: number;
  alignment?: ImageAlignment;
  caption?: string;
  showCaption?: boolean;
  borderWidth?: number;
  borderColor?: string;
  shadowEnabled?: boolean;
  key?: NodeKey;
}

/**
 * ImageNode - Renders images with support for resizing, alignment, captions, and styling
 * Based on the official Lexical playground implementation
 */
export class ImageNode extends DecoratorNode<ReactElement> {
  __src: string;
  __altText: string;
  __width: 'inherit' | number;
  __height: 'inherit' | number;
  __maxWidth: number;
  __alignment: ImageAlignment;
  __caption: string;
  __showCaption: boolean;
  __borderWidth: number;
  __borderColor: string;
  __shadowEnabled: boolean;

  static getType(): string {
    return 'image';
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(
      node.__src,
      node.__altText,
      node.__width,
      node.__height,
      node.__maxWidth,
      node.__alignment,
      node.__caption,
      node.__showCaption,
      node.__borderWidth,
      node.__borderColor,
      node.__shadowEnabled,
      node.__key
    );
  }

  constructor(
    src: string,
    altText: string,
    width: 'inherit' | number,
    height: 'inherit' | number,
    maxWidth: number,
    alignment: ImageAlignment = 'center',
    caption: string = '',
    showCaption: boolean = false,
    borderWidth: number = 0,
    borderColor: string = '#000000',
    shadowEnabled: boolean = false,
    key?: NodeKey
  ) {
    super(key);
    this.__src = src;
    this.__altText = altText;
    this.__width = width;
    this.__height = height;
    this.__maxWidth = maxWidth;
    this.__alignment = alignment;
    this.__caption = caption;
    this.__showCaption = showCaption;
    this.__borderWidth = borderWidth;
    this.__borderColor = borderColor;
    this.__shadowEnabled = shadowEnabled;
  }

  static importJSON(serializedNode: SerializedImageNode): ImageNode {
    const { src, altText, width, height, maxWidth, alignment, caption, showCaption, borderWidth, borderColor, shadowEnabled } =
      serializedNode;
    const node = $createImageNode({
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
    });
    return node;
  }

  exportJSON(): SerializedImageNode {
    return {
      src: this.__src,
      altText: this.__altText,
      width: this.__width === 'inherit' ? 'inherit' : this.__width,
      height: this.__height === 'inherit' ? 'inherit' : this.__height,
      maxWidth: this.__maxWidth,
      alignment: this.__alignment,
      caption: this.__caption,
      showCaption: this.__showCaption,
      borderWidth: this.__borderWidth,
      borderColor: this.__borderColor,
      shadowEnabled: this.__shadowEnabled,
      type: 'image',
      version: 1,
    };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      img: (node: Node) => ({
        conversion: convertImageElement,
        priority: 1,
      }),
    };
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement(this.__showCaption ? 'figure' : 'span');
    element.setAttribute('data-lexical-image', 'true');

    const img = document.createElement('img');
    img.src = this.__src;
    img.alt = this.__altText;

    if (this.__width !== 'inherit') {
      img.style.width = `${this.__width}px`;
    }
    if (this.__height !== 'inherit') {
      img.style.height = `${this.__height}px`;
    }

    element.appendChild(img);

    if (this.__showCaption && this.__caption) {
      const figcaption = document.createElement('figcaption');
      figcaption.textContent = this.__caption;
      element.appendChild(figcaption);
    }

    return { element };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('span');
    element.className = 'image-node-container';
    return element;
  }

  updateDOM(): false {
    return false;
  }

  getSrc(): string {
    return this.__src;
  }

  getAltText(): string {
    return this.__altText;
  }

  getWidth(): 'inherit' | number {
    return this.__width;
  }

  getHeight(): 'inherit' | number {
    return this.__height;
  }

  getMaxWidth(): number {
    return this.__maxWidth;
  }

  getAlignment(): ImageAlignment {
    return this.__alignment;
  }

  getCaption(): string {
    return this.__caption;
  }

  getShowCaption(): boolean {
    return this.__showCaption;
  }

  getBorderWidth(): number {
    return this.__borderWidth;
  }

  getBorderColor(): string {
    return this.__borderColor;
  }

  getShadowEnabled(): boolean {
    return this.__shadowEnabled;
  }

  setSrc(src: string): void {
    const writable = this.getWritable();
    writable.__src = src;
  }

  setAltText(altText: string): void {
    const writable = this.getWritable();
    writable.__altText = altText;
  }

  setWidthAndHeight(width: 'inherit' | number, height: 'inherit' | number): void {
    const writable = this.getWritable();
    writable.__width = width;
    writable.__height = height;
  }

  setAlignment(alignment: ImageAlignment): void {
    const writable = this.getWritable();
    writable.__alignment = alignment;
  }

  setCaption(caption: string): void {
    const writable = this.getWritable();
    writable.__caption = caption;
  }

  setShowCaption(showCaption: boolean): void {
    const writable = this.getWritable();
    writable.__showCaption = showCaption;
  }

  setBorderWidth(width: number): void {
    const writable = this.getWritable();
    writable.__borderWidth = width;
  }

  setBorderColor(color: string): void {
    const writable = this.getWritable();
    writable.__borderColor = color;
  }

  setShadowEnabled(enabled: boolean): void {
    const writable = this.getWritable();
    writable.__shadowEnabled = enabled;
  }

  isInline(): false {
    return false;
  }

  isIsolated(): true {
    return true;
  }

  decorate(): ReactElement {
    return (
      <Suspense fallback={null}>
        <ImageComponent
          src={this.__src}
          altText={this.__altText}
          width={this.__width}
          height={this.__height}
          maxWidth={this.__maxWidth}
          alignment={this.__alignment}
          caption={this.__caption}
          showCaption={this.__showCaption}
          borderWidth={this.__borderWidth}
          borderColor={this.__borderColor}
          shadowEnabled={this.__shadowEnabled}
          nodeKey={this.__key}
        />
      </Suspense>
    );
  }
}

function convertImageElement(domNode: Node): null | DOMConversionOutput {
  if (domNode instanceof HTMLImageElement) {
    const { src, alt, width, height } = domNode;
    const node = $createImageNode({
      src,
      altText: alt,
      width: width ? Number(width) : 'inherit',
      height: height ? Number(height) : 'inherit',
    });
    return { node };
  }
  return null;
}

export function $createImageNode(payload: ImagePayload): ImageNode {
  return $applyNodeReplacement(
    new ImageNode(
      payload.src,
      payload.altText || '',
      payload.width || 'inherit',
      payload.height || 'inherit',
      payload.maxWidth || 800,
      payload.alignment || 'center',
      payload.caption || '',
      payload.showCaption || false,
      payload.borderWidth || 0,
      payload.borderColor || '#000000',
      payload.shadowEnabled || false,
      payload.key
    )
  );
}

export function $isImageNode(node: LexicalNode | null | undefined): node is ImageNode {
  return node instanceof ImageNode;
}

// Image compression utility
const MAX_IMAGE_WIDTH = 1200;
const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB after base64

export async function compressImageToBase64(
  file: File
): Promise<{ src: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        let { width, height } = img;

        // Scale down if wider than MAX_IMAGE_WIDTH
        if (width > MAX_IMAGE_WIDTH) {
          height = Math.round(height * (MAX_IMAGE_WIDTH / width));
          width = MAX_IMAGE_WIDTH;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);

        // Use JPEG for photos, PNG for images with transparency
        const isTransparent = file.type === 'image/png';
        let quality = 0.85;
        let dataUrl = canvas.toDataURL(isTransparent ? 'image/png' : 'image/jpeg', quality);

        // Reduce quality until under size limit
        while (dataUrl.length > MAX_IMAGE_SIZE_BYTES && quality > 0.3) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        resolve({ src: dataUrl, width, height });
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Lazy load the ImageComponent to avoid SSR issues
const ImageComponent = dynamic(() => import('../ImageComponent'), {
  ssr: false,
});

// Import dynamic from next
import dynamic from 'next/dynamic';
