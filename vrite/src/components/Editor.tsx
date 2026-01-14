'use client';

import { useState, useEffect, useCallback } from 'react';
import { $getRoot, $getSelection, $createParagraphNode, $createTextNode, type EditorState } from 'lexical';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import AICommandModal from './AICommandModal';
import { createClient } from '../lib/supabase/client';

const theme = {
  root: 'editor-root',
  paragraph: 'editor-paragraph',
};

function onError(error: Error) {
  console.error(error);
}

const initialConfig = {
  namespace: 'VriteEditor',
  theme,
  onError,
};

function KeyboardShortcutPlugin({ onCommandK }: { onCommandK: () => void }) {
  const [editor] = useLexicalComposerContext();
  
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        onCommandK();
      }
    };

    return editor.registerRootListener((rootElement, prevRootElement) => {
      if (prevRootElement !== null) {
        prevRootElement.removeEventListener('keydown', handleKeyDown);
      }
      if (rootElement !== null) {
        rootElement.addEventListener('keydown', handleKeyDown);
      }
    });
  }, [editor, onCommandK]);

  return null;
}

function MyOnChangePlugin({ onChange }: { onChange: (editorState: EditorState, content: string) => void }) {
  const [editor] = useLexicalComposerContext();

  return (
    <OnChangePlugin
      onChange={(editorState) => {
        editorState.read(() => {
          const root = $getRoot();
          const textContent = root.getTextContent();
          onChange(editorState, textContent);
        });
      }}
    />
  );
}

function Placeholder() {
  return <div className="editor-placeholder">Start writing... (Press Cmd/Ctrl + K for AI assistance)</div>;
}

export default function Editor() {
  const [documentContent, setDocumentContent] = useState('');
  const [isCommandModalOpen, setIsCommandModalOpen] = useState(false);

  const handleEditorChange = (editorState: EditorState, content: string) => {
    setDocumentContent(content);
  };

  const handleCommandK = useCallback(() => {
    setIsCommandModalOpen(true);
  }, []);

  const handleAICommand = async (command: string) => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke('ai-command', {
        body: {
          content: documentContent,
          instruction: command,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to process AI command');
      }

      console.log('AI processed content:', data?.processed_content);
    } catch (error) {
      console.error('Error processing AI command:', error);
      alert('Failed to process AI command. Please try again.');
    }
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="editor-container">
        <div className="editor-inner">
          <PlainTextPlugin
            contentEditable={<ContentEditable className="editor-input" />}
            placeholder={<Placeholder />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <MyOnChangePlugin onChange={handleEditorChange} />
          <HistoryPlugin />
          <KeyboardShortcutPlugin onCommandK={handleCommandK} />
        </div>
      </div>
      
      <AICommandModal
        isOpen={isCommandModalOpen}
        onClose={() => setIsCommandModalOpen(false)}
        onSubmit={handleAICommand}
        documentContent={documentContent}
      />
    </LexicalComposer>
  );
}