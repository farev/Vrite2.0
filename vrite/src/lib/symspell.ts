/**
 * SymSpell Algorithm - Fast spell checking
 * Based on: https://github.com/wolfgarbe/SymSpell
 */

export type SpellCheckResult = {
  word: string;
  position: number;
  suggestions: string[];
};

export class SymSpell {
  private dictionary: Map<string, number> = new Map();
  private maxEditDistance = 2;
  private prefixLength = 7;

  constructor() {
    // Constructor - dictionary will be loaded separately
  }

  /**
   * Load dictionary from word list
   */
  loadDictionary(words: string[]): void {
    this.dictionary.clear();

    for (const word of words) {
      const normalized = word.toLowerCase().trim();
      if (normalized.length > 0) {
        this.dictionary.set(normalized, (this.dictionary.get(normalized) || 0) + 1);
      }
    }

    console.log(`[SymSpell] Loaded ${this.dictionary.size} words into dictionary`);
  }

  /**
   * Check if a word is spelled correctly
   */
  isCorrect(word: string): boolean {
    const normalized = word.toLowerCase();
    return this.dictionary.has(normalized);
  }

  /**
   * Get suggestions for a misspelled word
   */
  getSuggestions(word: string, maxSuggestions = 3): string[] {
    const normalized = word.toLowerCase();

    // If word is correct, no suggestions needed
    if (this.dictionary.has(normalized)) {
      return [];
    }

    const suggestions: Array<{ word: string; distance: number; frequency: number }> = [];
    const candidates = this.getEditCandidates(normalized);

    for (const candidate of candidates) {
      if (this.dictionary.has(candidate)) {
        const distance = this.levenshteinDistance(normalized, candidate);
        const frequency = this.dictionary.get(candidate) || 0;
        suggestions.push({ word: candidate, distance, frequency });
      }
    }

    // Sort by distance (ascending) then frequency (descending)
    suggestions.sort((a, b) => {
      if (a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      return b.frequency - a.frequency;
    });

    return suggestions
      .slice(0, maxSuggestions)
      .map((s) => s.word)
      .map((w) => {
        // Match capitalization of original word
        if (word[0] === word[0].toUpperCase()) {
          return w[0].toUpperCase() + w.slice(1);
        }
        return w;
      });
  }

  /**
   * Check multiple words and return errors
   */
  checkWords(words: string[]): SpellCheckResult[] {
    const results: SpellCheckResult[] = [];
    let position = 0;

    for (const word of words) {
      // Skip if word is empty, a number, or contains special characters
      if (
        !word.trim() ||
        /^\d+$/.test(word) ||
        /^[^a-zA-Z]+$/.test(word)
      ) {
        position += word.length + 1;
        continue;
      }

      if (!this.isCorrect(word)) {
        const suggestions = this.getSuggestions(word);
        if (suggestions.length > 0) {
          results.push({
            word,
            position,
            suggestions,
          });
        }
      }

      position += word.length + 1;
    }

    return results;
  }

  /**
   * Generate edit candidates for a word
   */
  private getEditCandidates(word: string): Set<string> {
    const candidates = new Set<string>();

    // Add the word itself
    candidates.add(word);

    // Generate edits within maxEditDistance
    for (let distance = 1; distance <= this.maxEditDistance; distance++) {
      const edits = this.generateEdits(word, distance);
      edits.forEach((edit) => candidates.add(edit));
    }

    return candidates;
  }

  /**
   * Generate all possible edits at a given distance
   */
  private generateEdits(word: string, distance: number): Set<string> {
    if (distance === 0) {
      return new Set([word]);
    }

    const edits = new Set<string>();

    // Deletions
    for (let i = 0; i < word.length; i++) {
      const deleted = word.slice(0, i) + word.slice(i + 1);
      edits.add(deleted);
      if (distance > 1) {
        this.generateEdits(deleted, distance - 1).forEach((e) => edits.add(e));
      }
    }

    // Transpositions
    for (let i = 0; i < word.length - 1; i++) {
      const transposed = word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2);
      edits.add(transposed);
    }

    // Replacements
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    for (let i = 0; i < word.length; i++) {
      for (const char of alphabet) {
        const replaced = word.slice(0, i) + char + word.slice(i + 1);
        edits.add(replaced);
      }
    }

    // Insertions
    for (let i = 0; i <= word.length; i++) {
      for (const char of alphabet) {
        const inserted = word.slice(0, i) + char + word.slice(i);
        edits.add(inserted);
      }
    }

    return edits;
  }

  /**
   * Calculate Damerau-Levenshtein distance (handles transpositions)
   */
  private levenshteinDistance(a: string, b: string): number {
    const lenA = a.length;
    const lenB = b.length;
    const maxDist = lenA + lenB;

    // Create matrix with extra row/column for handling transpositions
    const H: number[][] = [];
    for (let i = 0; i < lenA + 2; i++) {
      H[i] = new Array(lenB + 2).fill(0);
    }

    H[0][0] = maxDist;
    for (let i = 0; i <= lenA; i++) {
      H[i + 1][0] = maxDist;
      H[i + 1][1] = i;
    }
    for (let j = 0; j <= lenB; j++) {
      H[0][j + 1] = maxDist;
      H[1][j + 1] = j;
    }

    const da: Map<string, number> = new Map();

    for (let i = 1; i <= lenA; i++) {
      let db = 0;
      for (let j = 1; j <= lenB; j++) {
        const k = da.get(b[j - 1]) || 0;
        const l = db;
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        if (cost === 0) db = j;

        H[i + 1][j + 1] = Math.min(
          H[i][j] + cost,           // substitution
          H[i + 1][j] + 1,          // insertion
          H[i][j + 1] + 1,          // deletion
          H[k][l] + (i - k - 1) + 1 + (j - l - 1) // transposition
        );
      }

      da.set(a[i - 1], i);
    }

    return H[lenA + 1][lenB + 1];
  }
}
