'use client';

import { useState } from 'react';

interface AICommandModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (command: string) => void;
  documentContent: string;
}

export default function AICommandModal({ isOpen, onClose, onSubmit, documentContent }: AICommandModalProps) {
  const [command, setCommand] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;
    
    setIsLoading(true);
    await onSubmit(command);
    setIsLoading(false);
    setCommand('');
    onClose();
  };

  const quickCommands = [
    'Format this document according to APA standards',
    'Make this more concise',
    'Expand on this topic',
    'Fix grammar and spelling',
    'Improve the flow and structure',
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 max-w-[90vw]">
        <h2 className="text-xl font-semibold mb-4">AI Assistant</h2>
        
        <form onSubmit={handleSubmit}>
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Tell me what you'd like to do with your document..."
            className="w-full h-24 p-3 border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          
          <div className="mt-4">
            <p className="text-sm text-gray-600 mb-2">Quick commands:</p>
            <div className="space-y-1">
              {quickCommands.map((cmd, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setCommand(cmd)}
                  className="block w-full text-left px-2 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!command.trim() || isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
            >
              {isLoading ? 'Processing...' : 'Apply'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}