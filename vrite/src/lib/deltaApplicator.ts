export interface DeltaChange {
  old_text: string;
  new_text: string;
}

export class DeltaApplicator {
  /**
   * Apply text replacement changes to original content.
   * Uses simple string replacement - no position calculations needed!
   */
  static applyDeltas(originalContent: string, changes: DeltaChange[]): string {
    let result = originalContent;

    // Apply each replacement
    for (const change of changes) {
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
               new_text +
               result.substring(position + old_text.length);

      console.log(`Replaced text at position ${position}`);
    }

    return result;
  }
}
