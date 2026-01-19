'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  X,
  RefreshCw,
  Copy,
  Check,
  User
} from 'lucide-react';
import type { SimplifiedDocument } from '@/lib/lexicalSerializer';
import type { LexicalChange } from '@/lib/lexicalChangeApplicator';
import { createClient } from '@/lib/supabase/client';

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
  getSimplifiedDocument: () => SimplifiedDocument;
  onApplyLexicalChanges?: (changes: LexicalChange[]) => void;
  // Legacy props for backward compatibility with Delta-based changes
  documentContent?: string;
  onApplyChanges?: (content: string, changes?: any[]) => void;
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
  getSimplifiedDocument,
  onApplyLexicalChanges,
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
      console.log('[AIAssistant] Starting AI command request...');
      
      const supabase = createClient();
      
      console.log('[AIAssistant] Getting Supabase session...');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.error('[AIAssistant] ❌ Auth Session Missing:', sessionError);
        throw new Error('Not authenticated. Please log in again.');
      }

      // DEBUG: Inspect the token before sending
      try {
        const payload = JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        console.log('[AIAssistant] Token Debug Info:');
        console.log('  - Role:', payload.role);
        console.log('  - Email:', payload.email);
        console.log('  - Exp:', new Date(payload.exp * 1000).toLocaleString());
        
        if (payload.role === 'anon') {
          console.error('[AIAssistant] ❌ CRITICAL: Access token has "anon" role! This will be rejected by Edge Functions.');
        }
      } catch (e) {
        console.warn('[AIAssistant] Could not parse token payload for debug');
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const endpoint = `${supabaseUrl}/functions/v1/ai-command`;
      
      console.log('[AIAssistant] Sending POST to:', endpoint);
      
      // Build conversation history (exclude loading messages and current user message)
      const conversationHistory = messages
        .filter(msg => !msg.isLoading && msg.id !== userMessage.id)
        .map(msg => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.content,
        }));

      // Get the document as simplified Lexical JSON
      const simplifiedDocument = getSimplifiedDocument();

      // Send the document in V2 Lexical JSON format
      const requestBody = {
        document: simplifiedDocument,
        instruction: inputMessage,
        conversation_history: conversationHistory,
        context_snippets: contextSnippets.length > 0
          ? contextSnippets.map((snippet) => snippet.text)
          : undefined,
      };

      console.log('Sending to V2 API:', {
        blockCount: simplifiedDocument.blocks.length,
        instruction: inputMessage,
      });

      // Check if anon key is available
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!anonKey) {
        console.warn('[AIAssistant] ⚠️ NEXT_PUBLIC_SUPABASE_ANON_KEY is missing!');
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': anonKey || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('[AIAssistant] Response Status:', response.status);
      
      // Log headers for debugging (careful with sensitive info)
      console.log('[AIAssistant] Request headers sent:', {
        'Authorization': `Bearer ${session.access_token.substring(0, 10)}...`,
        'apikey': anonKey ? `${anonKey.substring(0, 10)}...` : 'MISSING',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[AIAssistant] ❌ Request failed with status:', response.status);
        console.error('[AIAssistant] Error response text:', errorText);
        
        // Extract x-request-id for Supabase support
        const requestId = response.headers.get('x-request-id');
        if (requestId) console.log('[AIAssistant] Supabase Request ID:', requestId);
        
        throw new Error(`Edge Function returned ${response.status}: ${errorText}`);
      }

      console.log('[AIAssistant] ✅ Response received, parsing...');
      const data = await response.json();
      console.log('[AIAssistant] Response type:', data.type);
      console.log('[AIAssistant] Changes count:', data.changes?.length || 0);

      // Handle V2 Lexical changes from Supabase Edge Function
      if (data.type === 'lexical_changes' && data.changes && data.changes.length > 0) {
        console.log('Received lexical changes:', data.changes);

        // Apply Lexical changes using the V2 format
        if (onApplyLexicalChanges) {
          onApplyLexicalChanges(data.changes);
        } else {
          console.warn('[AIAssistant] onApplyLexicalChanges callback not provided');
        }
      } else if (data.type === 'no_changes') {
        console.log('No changes needed');
      } else {
        console.warn('No changes or unexpected response type:', data.type);
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
      console.error('=== [AIAssistant] Error Getting AI Response ===');
      console.error('[AIAssistant] ❌ Error:', error);
      
      let errorMessage = 'Sorry, I encountered an error processing your request.';
      
      // Try to extract more details from Supabase FunctionsHttpError
      if (error && typeof error === 'object' && 'context' in error) {
        try {
          // FunctionsHttpError often has context.json() or similar
          const errorDetails = error as any;
          console.error('[AIAssistant] Error context:', errorDetails.context);
          if (errorDetails.message) {
            console.error('[AIAssistant] Error message from context:', errorDetails.message);
          }
        } catch (e) {
          console.error('[AIAssistant] Could not parse error context');
        }
      }
      
      if (error instanceof Error) {
        if (error.message.includes('Not authenticated') || error.message.includes('Unauthorized')) {
          errorMessage = '🔒 Authentication error. Please log out and log in again.';
        } else if (error.message.includes('Rate limit')) {
          errorMessage = '⏱️ Rate limit exceeded. Please wait a moment before trying again.';
        } else if (error.message.includes('OpenAI')) {
          errorMessage = '🤖 AI service error. Please try again in a moment.';
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          errorMessage = '🌐 Network error. Please check your connection and try again.';
        } else {
          errorMessage = `❌ Error: ${error.message}`;
        }
      }
      
      console.error('[AIAssistant] Displaying error to user:', errorMessage);
      
      setMessages(prev => 
        prev.map(msg => 
          msg.id === loadingMessage.id 
            ? { 
                ...msg, 
                content: errorMessage,
                isLoading: false
              }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
      console.log('[AIAssistant] Request completed');
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
      <div className={`ai-sidebar ${isOpen ? 'ai-sidebar-open' : 'ai-sidebar-closed'}`}>
        <div className="ai-sidebar-header">
          <div className="ai-sidebar-title">
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
                {message.type === 'user' && (
                  <div className="ai-message-icon">
                    <User size={16} />
                  </div>
                )}
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
