'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  X,
  RefreshCw,
  Copy,
  Check,
  Bot,
  User
} from 'lucide-react';
import { DeltaApplicator } from '@/lib/deltaApplicator';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

export interface ContextSnippet {
  id: string;
  text: string;
}

interface AIAssistantSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  documentContent: string;
  onApplyChanges?: (content: string) => void;
  isDiffModeActive?: boolean;
  onAcceptAllChanges?: () => void;
  onRejectAllChanges?: () => void;
  contextSnippets?: ContextSnippet[];
  onRemoveContextSnippet?: (id: string) => void;
  onClearContextSnippets?: () => void;
}

export default function AIAssistantSidebar({ 
  isOpen, 
  onToggle, 
  documentContent,
  onApplyChanges,
  isDiffModeActive = false,
  onAcceptAllChanges,
  onRejectAllChanges,
  contextSnippets = [],
  onRemoveContextSnippet,
  onClearContextSnippets
}: AIAssistantSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'assistant',
      content: 'Hi! I\'m your AI writing assistant. I can help you format your document, improve your writing, generate content, and more. What would you like to work on?',
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const truncateContext = (text: string, limit = 160) => {
    if (text.length <= limit) return text;
    return `${text.slice(0, limit - 1)}…`;
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    const loadingMessage: Message = {
      id: (Date.now() + 1).toString(),
      type: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true
    };

    setMessages(prev => [...prev, userMessage, loadingMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Build conversation history (exclude loading messages and current user message)
      const conversationHistory = messages
        .filter(msg => !msg.isLoading && msg.id !== userMessage.id)
        .map(msg => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.content,
        }));

      const requestBody: {
        content: string;
        instruction: string;
        conversation_history: { role: string; content: string }[];
        context_snippets?: string[];
      } = {
        content: documentContent,
        instruction: inputMessage,
        conversation_history: conversationHistory,
      };

      if (contextSnippets.length > 0) {
        requestBody.context_snippets = contextSnippets.map((snippet) => snippet.text);
      }

      const response = await fetch('http://localhost:8000/api/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const data = await response.json();

      // Handle tool-based changes or fall back to full document
      if (data.type === 'tool_based' && data.changes && data.changes.length > 0) {
        // Apply tool-based text replacements
        console.log('Received tool-based changes:', data.changes);

        const suggestedContent = DeltaApplicator.applyDeltas(
          documentContent,
          data.changes
        );

        console.log('Content changed:', suggestedContent !== documentContent);

        if (onApplyChanges) {
          onApplyChanges(suggestedContent);
        }
      } else if (onApplyChanges && data.processed_content) {
        // Fallback: full document mode
        console.log('Using full document fallback mode');
        onApplyChanges(data.processed_content);
      } else {
        console.warn('No changes to apply:', data);
      }

      // Display reasoning + summary if available
      const displayMessage = data.reasoning
        ? `**Reasoning:** ${data.reasoning}\n\n${data.summary || 'Changes applied.'}`
        : data.summary || 'Changes applied successfully.';

      setMessages(prev =>
        prev.map(msg =>
          msg.id === loadingMessage.id
            ? { ...msg, content: displayMessage, isLoading: false }
            : msg
        )
      );
    } catch (error) {
      console.error('Error getting AI response:', error);
      setMessages(prev => 
        prev.map(msg => 
          msg.id === loadingMessage.id 
            ? { 
                ...msg, 
                content: 'Sorry, I encountered an error. Please make sure the backend server is running and you have configured your OpenAI API key.',
                isLoading: false
              }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const copyToClipboard = async (content: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const clearChat = () => {
    setMessages([{
      id: '1',
      type: 'assistant',
      content: 'Hi! I\'m your AI writing assistant. I can help you format your document, improve your writing, generate content, and more. What would you like to work on?',
      timestamp: new Date()
    }]);
  };

  return (
    <div className="ai-sidebar-shell">
      {!isOpen && (
        <button
          onClick={onToggle}
          className="ai-sidebar-toggle"
          title="Open AI Assistant"
        >
          <Sparkles size={20} />
        </button>
      )}

      <div className={`ai-sidebar ${isOpen ? 'ai-sidebar-open' : 'ai-sidebar-closed'}`}>
        <div className="ai-sidebar-header">
          <div className="ai-sidebar-title">
            <Bot size={20} />
            <span>AI Assistant</span>
          </div>
          <div className="ai-sidebar-controls">
            <button
              onClick={clearChat}
              className="ai-sidebar-control-btn"
              title="Clear Chat"
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={onToggle}
              className="ai-sidebar-control-btn"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="ai-sidebar-content">
          <div className="ai-messages">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`ai-message ai-message-${message.type}`}
              >
                <div className="ai-message-icon">
                  {message.type === 'user' ? (
                    <User size={16} />
                  ) : (
                    <Bot size={16} />
                  )}
                </div>
                <div className="ai-message-content">
                  {message.isLoading ? (
                    <div className="ai-message-loading">
                      <div className="ai-loading-dots">
                        <div></div>
                        <div></div>
                        <div></div>
                      </div>
                      <span>Thinking...</span>
                    </div>
                  ) : (
                    <>
                      <div className="ai-message-text">
                        {message.content}
                      </div>
                      {message.type === 'assistant' && !message.isLoading && (
                        <div className="ai-message-actions">
                          <button
                            onClick={() => copyToClipboard(message.content, message.id)}
                            className="ai-message-action-btn"
                            title="Copy to clipboard"
                          >
                            {copiedMessageId === message.id ? (
                              <Check size={14} />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Context Panel */}
          <div className="ai-context-panel">
            <div className="ai-context-panel-header">
              <span>Context ({contextSnippets.length})</span>
              {contextSnippets.length > 0 && (
                <button
                  type="button"
                  className="ai-context-clear-btn"
                  onClick={() => onClearContextSnippets?.()}
                >
                  Clear all
                </button>
              )}
            </div>
            {contextSnippets.length === 0 ? (
              <p className="ai-context-panel-note">
                Highlight text in the editor and choose &quot;Add to AI context&quot; to pin it here for your next prompt.
              </p>
            ) : (
              <>
                <div className="ai-context-chip-list">
                  {contextSnippets.map((snippet) => (
                    <div key={snippet.id} className="ai-context-chip">
                      <span>{truncateContext(snippet.text)}</span>
                      <button
                        type="button"
                        className="ai-context-chip-remove"
                        onClick={() => onRemoveContextSnippet?.(snippet.id)}
                        aria-label="Remove context"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="ai-context-panel-note">
                  These snippets are sent with your prompt and prioritized by the assistant.
                </p>
              </>
            )}
          </div>

          {isDiffModeActive && (
            <div className="ai-diff-actions">
              <div className="diff-mode-actions">
                <button
                  onClick={() => onRejectAllChanges?.()}
                  className="diff-mode-btn diff-mode-reject-all"
                  title="Reject all changes"
                >
                  <X size={16} />
                  Reject All
                </button>
                <button
                  onClick={() => onAcceptAllChanges?.()}
                  className="diff-mode-btn diff-mode-accept-all"
                  title="Accept all changes"
                >
                  <Check size={16} />
                  Accept All
                </button>
              </div>
            </div>
          )}

          {/* Input */}
          <div className="ai-input-container">
            <textarea
              ref={inputRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me anything about your document..."
              className="ai-input"
              rows={3}
              disabled={isLoading}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isLoading}
              className="ai-send-btn"
              title="Send message"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
