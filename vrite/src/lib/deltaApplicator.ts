export interface DeltaChange {
  type?: 'replace' | 'bold' | 'italic' | 'heading';
  old_text?: string;
  new_text?: string;
  text?: string;
  level?: number;
}

export interface FormattingOperation {
  type: 'bold' | 'italic' | 'heading';
  text: string;
  level?: number;
}

export class DeltaApplicator {
  /**
   * Apply text replacement changes to original content.
   * Returns both the modified content and any formatting operations.
   *
   * Formatting operations do NOT modify the text content - they are just collected
   * and will be applied to DiffNodes in the diff preview.
   */
  static applyDeltas(originalContent: string, changes: DeltaChange[]): {
    content: string;
    formattingOps: FormattingOperation[];
  } {
    let result = originalContent;
    const formattingOps: FormattingOperation[] = [];

    // Process each change
    for (const change of changes) {
      const changeType = change.type || 'replace';

      if (changeType === 'replace') {
        // Text replacement
        const { old_text, new_text } = change;

        if (!old_text) {
          console.warn('Skipping change with no old_text:', change);
          continue;
        }

        // Find the text to replace
        const position = result.indexOf(old_text);

        if (position === -1) {
          console.warn(`Could not find text to replace: "${old_text.substring(0, 50)}..."`);
          continue;
        }

        // Replace the text
        result = result.substring(0, position) +
                 (new_text || '') +
                 result.substring(position + old_text.length);

        console.log(`Replaced text at position ${position}`);
      } else if (changeType === 'bold' || changeType === 'italic' || changeType === 'heading') {
        // Formatting operation - just collect it, don't modify text
        const targetText = change.text || '';

        if (!targetText) {
          console.warn('Skipping formatting change with no text:', change);
          continue;
        }

        // Queue the formatting operation (will be applied to DiffNodes)
        formattingOps.push({
          type: changeType,
          text: targetText,
          level: change.level
        });

        console.log(`Queued ${changeType} formatting for: "${targetText.substring(0, 30)}..."`);
      }
    }

    return {
      content: result,
      formattingOps
    };
  }
}
