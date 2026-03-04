export type DiffSegment =
  | { kind: 'equal'; text: string }
  | { kind: 'delete'; text: string }
  | { kind: 'insert'; text: string };

export type PhraseChunk =
  | { kind: 'equal'; text: string }
  | { kind: 'change'; deleted: string; inserted: string };

/**
 * Tokenize a string into words and whitespace tokens.
 * Splits on whitespace boundaries, keeping whitespace as separate tokens.
 */
function tokenize(text: string): string[] {
  return text.split(/(\s+)/);
}

/**
 * Compute a word-level diff between two strings using LCS.
 * Returns an array of DiffSegments with kind 'equal', 'delete', or 'insert'.
 *
 * Falls back to a single delete+insert pair when:
 * - Either token array exceeds 500 tokens (performance guard)
 * - The texts have almost nothing in common (similarity < 15%)
 */
export function computeWordDiff(original: string, revised: string): DiffSegment[] {
  const tokensA = tokenize(original);
  const tokensB = tokenize(revised);

  const lenA = tokensA.length;
  const lenB = tokensB.length;

  // Length guard: skip DP for very long token arrays
  if (lenA > 500 || lenB > 500) {
    return [
      { kind: 'delete', text: original },
      { kind: 'insert', text: revised },
    ];
  }

  // Build LCS DP table
  const dp: number[][] = Array.from({ length: lenA + 1 }, () => new Array(lenB + 1).fill(0));

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      if (tokensA[i - 1] === tokensB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const lcsLength = dp[lenA][lenB];
  const maxLen = Math.max(lenA, lenB);

  // Fallback for near-completely-rewritten paragraphs
  if (maxLen > 0 && lcsLength / maxLen < 0.15) {
    return [
      { kind: 'delete', text: original },
      { kind: 'insert', text: revised },
    ];
  }

  // Backtrack through DP table to produce raw segments
  const raw: DiffSegment[] = [];
  let i = lenA;
  let j = lenB;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && tokensA[i - 1] === tokensB[j - 1]) {
      raw.push({ kind: 'equal', text: tokensA[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.push({ kind: 'insert', text: tokensB[j - 1] });
      j--;
    } else {
      raw.push({ kind: 'delete', text: tokensA[i - 1] });
      i--;
    }
  }

  raw.reverse();

  // Merge consecutive same-kind segments and apply whitespace filter
  const merged: DiffSegment[] = [];
  for (const seg of raw) {
    // Convert invisible (whitespace-only) non-equal segments to equal
    const effective: DiffSegment =
      seg.kind !== 'equal' && seg.text.trim() === ''
        ? { kind: 'equal', text: seg.text }
        : seg;

    const last = merged[merged.length - 1];
    if (last && last.kind === effective.kind) {
      last.text += effective.text;
    } else {
      merged.push({ ...effective });
    }
  }

  return merged;
}

/**
 * Groups flat diff segments into phrase-level chunks.
 *
 * Consecutive changed segments separated only by whitespace-only equal tokens
 * are merged into a single change chunk showing [deleted phrase] vs [inserted phrase].
 * Non-whitespace equal segments act as boundaries between change groups.
 *
 * Example:
 *   "The cat sat" → "The dog ran"
 *   segments: equal("The "), delete("cat"), equal(" "), delete("sat"), insert("dog"), insert(" ran")
 *   chunks: equal("The "), change(deleted:"cat sat", inserted:"dog ran")
 */
export function groupIntoPhraseChunks(segments: DiffSegment[]): PhraseChunk[] {
  const chunks: PhraseChunk[] = [];
  let i = 0;

  while (i < segments.length) {
    const seg = segments[i];

    if (seg.kind === 'equal') {
      // Merge consecutive equal segments into one equal chunk
      let text = seg.text;
      i++;
      while (i < segments.length && segments[i].kind === 'equal') {
        text += segments[i].text;
        i++;
      }
      chunks.push({ kind: 'equal', text });
      continue;
    }

    // Start a change group (non-equal segment encountered)
    let deleted = '';
    let inserted = '';

    while (i < segments.length) {
      const s = segments[i];

      if (s.kind === 'delete') {
        deleted += s.text;
        i++;
      } else if (s.kind === 'insert') {
        inserted += s.text;
        i++;
      } else {
        // Equal segment: absorb if it's whitespace-only AND more changes follow
        if (s.text.trim() === '') {
          // Look ahead past consecutive whitespace-only equals
          let j = i + 1;
          while (j < segments.length && segments[j].kind === 'equal' && segments[j].text.trim() === '') {
            j++;
          }
          if (j < segments.length && segments[j].kind !== 'equal') {
            // More changes after this whitespace — absorb the whitespace into both sides
            while (i < j) {
              deleted += segments[i].text;
              inserted += segments[i].text;
              i++;
            }
          } else {
            // Only equal segments (or end) follow — close the change group
            break;
          }
        } else {
          // Non-whitespace equal — boundary, close the change group
          break;
        }
      }
    }

    if (deleted || inserted) {
      chunks.push({ kind: 'change', deleted, inserted });
    }
  }

  return chunks;
}
