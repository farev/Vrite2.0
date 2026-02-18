'use client';

import React, { useRef } from 'react';

type DirectionType = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

interface ImageResizerProps {
  imageRef: { current: null | HTMLImageElement };
  maxWidth?: number;
  onResizeStart: () => void;
  onResizeEnd: (width: number, height: number) => void;
}

// Bitwise direction constants
const DirectionBits = {
  east: 1 << 0,
  north: 1 << 3,
  south: 1 << 1,
  west: 1 << 2,
};

function calculateZoomLevel(element: HTMLElement | null): number {
  if (!element) return 1;
  let zoom = 1;
  let current: HTMLElement | null = element;
  while (current) {
    const style = window.getComputedStyle(current);
    const transform = style.transform;
    if (transform && transform !== 'none') {
      const matrix = new DOMMatrix(transform);
      zoom *= matrix.a;
    }
    current = current.parentElement;
  }
  return zoom;
}

export default function ImageResizer({
  imageRef,
  maxWidth,
  onResizeStart,
  onResizeEnd,
}: ImageResizerProps): React.ReactElement {
  const controlWrapperRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (direction: DirectionType) => {
    return (event: React.PointerEvent) => {
      const image = imageRef.current;
      if (!image) return;

      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startY = event.clientY;

      const { width: startWidth, height: startHeight } = image.getBoundingClientRect();
      const aspectRatio = startWidth / startHeight;
      const zoom = calculateZoomLevel(image);

      let isResizing = true;
      onResizeStart();

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (!isResizing) return;

        const deltaX = (moveEvent.clientX - startX) / zoom;
        const deltaY = (moveEvent.clientY - startY) / zoom;

        const directionBits = getDirectionBits(direction);
        let newWidth = startWidth;
        let newHeight = startHeight;

        // Apply deltas based on direction
        if (directionBits & DirectionBits.east) {
          newWidth = Math.max(100, startWidth + deltaX);
        }
        if (directionBits & DirectionBits.west) {
          newWidth = Math.max(100, startWidth - deltaX);
        }
        if (directionBits & DirectionBits.south) {
          newHeight = Math.max(50, startHeight + deltaY);
        }
        if (directionBits & DirectionBits.north) {
          newHeight = Math.max(50, startHeight - deltaY);
        }

        // Maintain aspect ratio for corner handles
        if (isCornerHandle(direction)) {
          newHeight = newWidth / aspectRatio;
        }

        // Apply max width constraint
        if (maxWidth && newWidth > maxWidth) {
          newWidth = maxWidth;
          newHeight = newWidth / aspectRatio;
        }

        // Update image dimensions
        image.style.width = `${newWidth}px`;
        image.style.height = `${newHeight}px`;
      };

      const handlePointerUp = () => {
        if (!isResizing) return;
        isResizing = false;

        const { width, height } = image.getBoundingClientRect();
        onResizeEnd(Math.round(width), Math.round(height));

        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);

        // Restore user selection
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };

      // Disable user selection during resize
      document.body.style.userSelect = 'none';
      document.body.style.cursor = getCursor(direction);

      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    };
  };

  return (
    <div ref={controlWrapperRef} className="image-resize-handles">
      {(['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'] as DirectionType[]).map((dir) => (
        <div
          key={dir}
          className={`image-resize-handle image-resize-handle-${dir}`}
          onPointerDown={handlePointerDown(dir)}
          style={{ cursor: getCursor(dir) }}
        />
      ))}
    </div>
  );
}

function getDirectionBits(direction: DirectionType): number {
  switch (direction) {
    case 'n':
      return DirectionBits.north;
    case 's':
      return DirectionBits.south;
    case 'e':
      return DirectionBits.east;
    case 'w':
      return DirectionBits.west;
    case 'nw':
      return DirectionBits.north | DirectionBits.west;
    case 'ne':
      return DirectionBits.north | DirectionBits.east;
    case 'sw':
      return DirectionBits.south | DirectionBits.west;
    case 'se':
      return DirectionBits.south | DirectionBits.east;
    default:
      return 0;
  }
}

function isCornerHandle(direction: DirectionType): boolean {
  return direction === 'nw' || direction === 'ne' || direction === 'sw' || direction === 'se';
}

function getCursor(direction: DirectionType): string {
  switch (direction) {
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    case 'nw':
    case 'se':
      return 'nwse-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    default:
      return 'default';
  }
}
