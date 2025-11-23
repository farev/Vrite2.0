'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import * as Diff from 'diff';

interface DiffViewerProps {
  isOpen: boolean;
  onClose: () => void;
  originalContent: string;
  suggestedContent: string;
  onAccept: (content: string) => void;
  onReject: () => void;
  title?: string;
}

export default function DiffViewer({
  isOpen,
  onClose,
  originalContent,
  suggestedContent,
  onAccept,
  onReject,
  title = 'Review AI Changes',
}: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Compute diff
  const diff = Diff.diffWords(originalContent, suggestedContent);

  const handleAccept = () => {
    onAccept(suggestedContent);
    onClose();
  };

  const handleReject = () => {
    onReject();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-[90%] h-[85%] max-w-6xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500 mt-1">
              Review the changes suggested by AI
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('unified')}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  viewMode === 'unified'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Unified
              </button>
              <button
                onClick={() => setViewMode('split')}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  viewMode === 'split'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Split
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Diff Content */}
        <div className="flex-1 overflow-auto p-6">
          {viewMode === 'unified' ? (
            <UnifiedDiffView diff={diff} />
          ) : (
            <SplitDiffView
              originalContent={originalContent}
              suggestedContent={suggestedContent}
            />
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
          <div className="text-sm text-gray-600">
            {diff.filter((part) => part.added).length > 0 && (
              <span className="mr-4">
                <span className="inline-block w-3 h-3 bg-green-200 rounded mr-1"></span>
                {diff.filter((part) => part.added).length} addition(s)
              </span>
            )}
            {diff.filter((part) => part.removed).length > 0 && (
              <span>
                <span className="inline-block w-3 h-3 bg-red-200 rounded mr-1"></span>
                {diff.filter((part) => part.removed).length} deletion(s)
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleReject}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Reject Changes
            </button>
            <button
              onClick={handleAccept}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Accept All Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Unified Diff View Component
function UnifiedDiffView({ diff }: { diff: Diff.Change[] }) {
  return (
    <div className="font-mono text-sm leading-relaxed bg-gray-50 rounded-lg p-4 border">
      {diff.map((part, index) => {
        if (part.added) {
          return (
            <span
              key={index}
              className="bg-green-100 text-green-900 px-0.5 rounded"
            >
              {part.value}
            </span>
          );
        }
        if (part.removed) {
          return (
            <span
              key={index}
              className="bg-red-100 text-red-900 line-through px-0.5 rounded"
            >
              {part.value}
            </span>
          );
        }
        return (
          <span key={index} className="text-gray-700">
            {part.value}
          </span>
        );
      })}
    </div>
  );
}

// Split Diff View Component
function SplitDiffView({
  originalContent,
  suggestedContent,
}: {
  originalContent: string;
  suggestedContent: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Original Content */}
      <div className="flex flex-col">
        <div className="text-sm font-medium text-gray-700 mb-2 pb-2 border-b">
          Original
        </div>
        <div className="font-mono text-sm leading-relaxed bg-gray-50 rounded-lg p-4 border whitespace-pre-wrap flex-1">
          {originalContent}
        </div>
      </div>

      {/* Suggested Content */}
      <div className="flex flex-col">
        <div className="text-sm font-medium text-gray-700 mb-2 pb-2 border-b">
          AI Suggestion
        </div>
        <div className="font-mono text-sm leading-relaxed bg-green-50 rounded-lg p-4 border border-green-200 whitespace-pre-wrap flex-1">
          {suggestedContent}
        </div>
      </div>
    </div>
  );
}
