import { describe, it, expect } from 'vitest';
import { mergeContinuationContent } from '@/stages/stage6-lesson-content/nodes/generator/generator-single-call';

describe('mergeContinuationContent', () => {
  describe('empty continuation', () => {
    it('should return existing content unchanged when continuation is empty string', () => {
      expect(mergeContinuationContent('Hello world', '')).toBe('Hello world');
    });

    it('should return existing content unchanged when continuation is whitespace only', () => {
      expect(mergeContinuationContent('Hello world', '   ')).toBe('Hello world');
    });

    it('should return existing content unchanged when continuation is newlines only', () => {
      expect(mergeContinuationContent('Hello world', '\n\n\t\n')).toBe('Hello world');
    });
  });

  describe('no overlap — appends with double newline', () => {
    it('should append continuation with double newline when there is no overlap', () => {
      const result = mergeContinuationContent('Existing text.', 'New continuation.');
      expect(result).toBe('Existing text.\n\nNew continuation.');
    });

    it('should trim trailing whitespace from existing before appending', () => {
      const result = mergeContinuationContent('Existing text.   ', 'New continuation.');
      expect(result).toBe('Existing text.\n\nNew continuation.');
    });

    it('should trim leading whitespace from continuation append part', () => {
      // No overlap case — continuation.slice(overlap) has leading whitespace stripped by trimStart()
      const result = mergeContinuationContent('Existing.', '   New part.');
      // continuation.trim() = 'New part.' (no overlap) → appendPart = 'New part.'.trimStart()
      expect(result).toBe('Existing.\n\nNew part.');
    });
  });

  describe('full overlap — returns existing unchanged', () => {
    it('should return existing when continuation is exact tail of existing (50 chars)', () => {
      const tail = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwx'; // exactly 50 chars
      expect(tail.length).toBe(50);
      const existing = `Some long preamble content here. ${tail}`;
      // continuation is exactly the tail — appendPart will be empty
      const result = mergeContinuationContent(existing, tail);
      expect(result).toBe(existing);
    });

    it('should return existing when continuation equals exact tail (100 chars overlap)', () => {
      const tail = 'A'.repeat(100);
      const existing = `Preamble. ${tail}`;
      const result = mergeContinuationContent(existing, tail);
      expect(result).toBe(existing);
    });
  });

  describe('overlap at exactly 40-char boundary (minimum)', () => {
    it('should detect 40-char overlap and append only the new text', () => {
      const overlap40 = '1234567890123456789012345678901234567890'; // exactly 40 chars
      expect(overlap40.length).toBe(40);
      const existing = `Prior content here. ${overlap40}`;
      const continuation = `${overlap40} and here is the new tail text.`;

      const result = mergeContinuationContent(existing, continuation);

      // appendPart = ' and here is the new tail text.'.trimStart()
      expect(result).toBe(`${existing.trimEnd()}\n\nand here is the new tail text.`);
    });

    it('should detect 40-char overlap even when existing is exactly 40 chars', () => {
      const overlap40 = 'abcdefghijklmnopqrstuvwxyz1234567890abcd'; // exactly 40 chars
      expect(overlap40.length).toBe(40);
      // existing IS the 40 chars (so tail of existing == existing)
      const continuation = `${overlap40}NEW_CONTENT`;

      const result = mergeContinuationContent(overlap40, continuation);

      expect(result).toBe(`${overlap40}\n\nNEW_CONTENT`);
    });
  });

  describe('overlap at 39 chars (below minimum) — treated as no overlap', () => {
    it('should not detect overlap at 39 chars and append full continuation', () => {
      const overlap39 = '123456789012345678901234567890123456789'; // exactly 39 chars
      expect(overlap39.length).toBe(39);
      const existing = `Prior content. ${overlap39}`;
      const newText = ' appended after overlap.';
      const continuation = `${overlap39}${newText}`;

      const result = mergeContinuationContent(existing, continuation);

      // No overlap detected (39 < 40 minimum), so full continuation is appended
      expect(result).toBe(`${existing.trimEnd()}\n\n${continuation.trim()}`);
    });
  });

  describe('overlap near 400-char cap', () => {
    it('should detect overlap of exactly 400 chars', () => {
      const overlap400 = 'X'.repeat(400);
      expect(overlap400.length).toBe(400);
      const existing = `Start content. ${overlap400}`;
      const continuation = `${overlap400}EXTRA_TAIL`;

      const result = mergeContinuationContent(existing, continuation);

      expect(result).toBe(`${existing.trimEnd()}\n\nEXTRA_TAIL`);
    });

    it('should cap overlap detection at 400 chars when actual overlap is 401', () => {
      // maxOverlap = Math.min(400, existingContent.length, continuation.length)
      // With overlap of 401 chars, the loop starts at 400 and can never find the 401-char overlap.
      // The 400-char slice of existing tail != 400-char slice of continuation start
      // because existing tail[0..399] != continuation[0..399] (they share 401 chars,
      // so existing[-400:] == continuation[0:400] — the loop WILL find 400-char overlap).
      //
      // Actually: if overlap is 401, then existing[-400:] === continuation[0:400] is true,
      // so the 400-char overlap is still detected. Verify the cap works correctly.
      const overlap401 = 'Y'.repeat(401);
      const existing = `Preamble. ${overlap401}`;
      const continuation = `${overlap401}TAIL`;

      const result = mergeContinuationContent(existing, continuation);

      // maxOverlap = min(400, existing.length, continuation.length)
      // existing.length = 10 + 401 = 411, continuation.length = 401 + 4 = 405
      // maxOverlap = min(400, 411, 405) = 400
      // Loop: size=400 → existing[-400:] = 'Y'*400, continuation[0:400] = 'Y'*400 → match at 400
      // appendPart = continuation.slice(400).trimStart() = 'Y' + 'TAIL' = 'YTAIL'
      expect(result).toBe(`${existing.trimEnd()}\n\nYTAIL`);
    });

    it('should not detect overlap larger than 400 chars even if present', () => {
      // Build a 500-char repeated sequence as overlap
      const overlap500 = 'Z'.repeat(500);
      const existing = `${overlap500}`;
      // continuation starts with the same 500 chars + new text
      const continuation = `${overlap500}NEW`;

      // maxOverlap = min(400, 500, 503) = 400
      // existing[-400:] = 'Z'*400, continuation[0:400] = 'Z'*400 → overlap = 400
      // appendPart = continuation.slice(400).trimStart() = 'Z'*100 + 'NEW'
      const result = mergeContinuationContent(existing, continuation);

      expect(result).toBe(`${existing.trimEnd()}\n\n${'Z'.repeat(100)}NEW`);
    });
  });

  describe('edge cases', () => {
    it('should handle empty existing content with non-empty continuation', () => {
      const result = mergeContinuationContent('', 'New content.');
      // existing.trimEnd() = '', appendPart = 'New content.'
      expect(result).toBe('\n\nNew content.');
    });

    it('should handle continuation that matches middle of existing (no overlap since loop checks tail)', () => {
      // The function only checks existing TAIL vs continuation START
      // If continuation matches something in the middle of existing, no overlap is detected
      const existing = 'ABC DEF GHI';
      const continuation = 'DEF new stuff'; // 'DEF' is in middle of existing, not at tail
      const result = mergeContinuationContent(existing, continuation);
      expect(result).toBe('ABC DEF GHI\n\nDEF new stuff');
    });

    it('should handle multiline content with overlap', () => {
      const tailLines = '## Summary\n\nThis lesson covered the basics well.';
      expect(tailLines.length).toBeGreaterThanOrEqual(40);
      const existing = `# Lesson Title\n\nSome content here.\n\n${tailLines}`;
      const continuation = `${tailLines}\n\n## More Content\n\nExtra paragraph.`;

      const result = mergeContinuationContent(existing, continuation);

      expect(result).toContain('## More Content');
      expect(result).not.toContain(`${tailLines}\n\n## Summary`);
    });
  });
});
