/**
 * Spell Check Web Worker
 * Runs SymSpell algorithm in background thread
 */

import { SymSpell, type SpellCheckResult } from '../lib/symspell';

const symspell = new SymSpell();
let isReady = false;

// Message types
type LoadDictionaryMessage = {
  type: 'load-dictionary';
  words: string[];
};

type CheckTextMessage = {
  type: 'check-text';
  text: string;
  id: string;
};

type WorkerMessage = LoadDictionaryMessage | CheckTextMessage;

type CheckTextResponse = {
  type: 'check-result';
  id: string;
  errors: SpellCheckResult[];
  processingTime: number;
};

type ReadyResponse = {
  type: 'ready';
};

type WorkerResponse = CheckTextResponse | ReadyResponse;

// Handle incoming messages
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  switch (message.type) {
    case 'load-dictionary': {
      const startTime = performance.now();
      symspell.loadDictionary(message.words);
      isReady = true;
      const loadTime = performance.now() - startTime;
      console.log(`[SpellCheckWorker] Dictionary loaded in ${loadTime.toFixed(2)}ms`);

      self.postMessage({
        type: 'ready',
      } as ReadyResponse);
      break;
    }

    case 'check-text': {
      if (!isReady) {
        console.warn('[SpellCheckWorker] Not ready - dictionary not loaded');
        return;
      }

      const startTime = performance.now();

      // Split text into words (preserving position information)
      const words = message.text.split(/\s+/);
      const errors = symspell.checkWords(words);

      const processingTime = performance.now() - startTime;

      self.postMessage({
        type: 'check-result',
        id: message.id,
        errors,
        processingTime,
      } as CheckTextResponse);
      break;
    }

    default:
      console.warn('[SpellCheckWorker] Unknown message type:', (message as {type: string}).type);
  }
};

// Export for TypeScript (won't actually be used in worker context)
export type { WorkerMessage, WorkerResponse, CheckTextResponse };
