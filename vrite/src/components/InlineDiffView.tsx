'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import * as Diff from 'diff';

interface InlineDiffViewProps {
  originalContent: string;
  suggestedContent: string;
  onAcceptAll: (content: string) => void;
  onRejectAll: () => void;
  onAcceptChange: (changeIndex: number) => void;
  onRejectChange: (changeIndex: number) => void;
}

interface DiffChunk {
  index: number;
  type: 'addition' | 'deletion' | 'unchanged';
  content: string;
  accepted?: boolean;
  rejected?: boolean;
}

export default function InlineDiffView({
  originalContent,
  suggestedContent,
  onAcceptAll,
  onRejectAll,
  onAcceptChange,
  onRejectChange,
}: InlineDiffViewProps) {
  const [chunks, setChunks] = useState<DiffChunk[]>(() => {
    const diff = Diff.diffWords(originalContent, suggestedContent);
    const diffChunks: DiffChunk[] = [];
    let index = 0;

    diff.forEach((part) => {
      if (part.added) {
        diffChunks.push({
          index: index++,
          type: 'addition',
          content: part.value,
        });
      } else if (part.removed) {
        diffChunks.push({
          index: index++,
          type: 'deletion',
          content: part.value,
        });
      } else {
        diffChunks.push({
          index: index++,
          type: 'unchanged',
          content: part.value,
        });
      }
    });

    return diffChunks;
  });

  const handleAcceptChange = (changeIndex: number) => {
    setChunks((prev) =>
      prev.map((chunk) =>
        chunk.index === changeIndex
          ? { ...chunk, accepted: true, rejected: false }
          : chunk
      )
    );
    onAcceptChange(changeIndex);
  };

  const handleRejectChange = (changeIndex: number) => {
    setChunks((prev) =>
      prev.map((chunk) =>
        chunk.index === changeIndex
          ? { ...chunk, rejected: true, accepted: false }
          : chunk
      )
    );
    onRejectChange(changeIndex);
  };

  const handleAcceptAll = () => {
    setChunks((prev) =>
      prev.map((chunk) =>
        chunk.type !== 'unchanged'
          ? { ...chunk, accepted: true, rejected: false }
          : chunk
      )
    );
    onAcceptAll(suggestedContent);
  };

  const handleRejectAll = () => {
    setChunks((prev) =>
      prev.map((chunk) =>
        chunk.type !== 'unchanged'
          ? { ...chunk, rejected: true, accepted: false }
          : chunk
      )
    );
    onRejectAll();
  };

  return (
    <div className="inline-diff-container">
      {/* Header with Accept/Reject All */}
      <div className="inline-diff-header">
        <div className="inline-diff-title">
          <span className="inline-diff-icon">✨</span>
          AI Suggestions
        </div>
        <div className="inline-diff-actions">
          <button onClick={handleRejectAll} className="diff-reject-all-btn">
            <X size={16} />
            Reject All
          </button>
          <button onClick={handleAcceptAll} className="diff-accept-all-btn">
            <Check size={16} />
            Accept All
          </button>
        </div>
      </div>

      {/* Inline Diff Content */}
      <div className="inline-diff-content">
        {chunks.map((chunk) => {
          if (chunk.type === 'unchanged') {
            return (
              <span key={chunk.index} className="diff-unchanged">
                {chunk.content}
              </span>
            );
          }

          const isAccepted = chunk.accepted;
          const isRejected = chunk.rejected;
          const isPending = !isAccepted && !isRejected;

          return (
            <span key={chunk.index} className="diff-change-wrapper">
              <span
                className={`diff-change ${
                  chunk.type === 'addition' ? 'diff-addition' : 'diff-deletion'
                } ${isAccepted ? 'diff-accepted' : ''} ${
                  isRejected ? 'diff-rejected' : ''
                }`}
              >
                {chunk.content}
              </span>
              {isPending && (
                <span className="diff-change-actions">
                  <button
                    onClick={() => handleRejectChange(chunk.index)}
                    className="diff-change-btn diff-reject-btn"
                    title="Reject this change"
                  >
                    <X size={12} />
                  </button>
                  <button
                    onClick={() => handleAcceptChange(chunk.index)}
                    className="diff-change-btn diff-accept-btn"
                    title="Accept this change"
                  >
                    <Check size={12} />
                  </button>
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
