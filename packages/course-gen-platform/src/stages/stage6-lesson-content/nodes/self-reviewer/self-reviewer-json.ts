/**
 * Self-Reviewer JSON Processing
 * @module stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-json
 *
 * JSON repair and LLM response parsing utilities for the self-reviewer node.
 */

import { logger } from '@/shared/logger';
import type { SelfReviewerLLMResponse } from './self-reviewer-constants';

// ============================================================================
// JSON REPAIR
// ============================================================================

/**
 * Attempt to repair truncated JSON
 *
 * Handles common truncation patterns:
 * - Unterminated strings: add closing quote
 * - Unclosed arrays: add ]
 * - Unclosed objects: add }
 * - Truncated patched_content: remove incomplete field and set to null
 *
 * @param jsonString - Potentially truncated JSON string
 * @returns Repaired JSON string or original if repair fails
 */
export function repairTruncatedJson(jsonString: string): string {
  let repaired = jsonString.trim();

  // Strategy 1: If patched_content is truncated, remove it entirely
  // Pattern: "patched_content": { or "patched_content": "
  // followed by incomplete content until end
  const patchedContentMatch = repaired.match(/"patched_content"\s*:\s*[{\["]/);
  if (patchedContentMatch) {
    const startIndex = patchedContentMatch.index!;
    // Check if this is at the end and truncated (no proper closing)
    const afterPatchedContent = repaired.slice(startIndex);
    // If there's no complete JSON structure after patched_content, truncate it
    try {
      // Try to find if patched_content is complete by checking bracket balance
      let depth = 0;
      let inStr = false;
      let esc = false;
      let foundStart = false;
      let endIndex = -1;

      for (let i = 0; i < afterPatchedContent.length; i++) {
        const c = afterPatchedContent[i];
        if (esc) {
          esc = false;
          continue;
        }
        if (c === '\\') {
          esc = true;
          continue;
        }
        if (c === '"' && !esc) {
          inStr = !inStr;
          continue;
        }
        if (inStr) continue;

        if (c === '{' || c === '[') {
          if (!foundStart) foundStart = true;
          depth++;
        } else if (c === '}' || c === ']') {
          depth--;
          if (foundStart && depth === 0) {
            endIndex = i;
            break;
          }
        }
      }

      // If we didn't find a complete patched_content, remove it
      if (endIndex === -1) {
        repaired = repaired.slice(0, startIndex) + '"patched_content": null';
        logger.debug({ msg: 'Removed truncated patched_content field' });
      }
    } catch {
      // On any error, just remove patched_content
      repaired = repaired.slice(0, startIndex) + '"patched_content": null';
    }
  }

  // Strategy 2: Remove trailing incomplete key-value pairs
  repaired = repaired.replace(/,\s*"[^"]*":\s*$/, '');
  repaired = repaired.replace(/,\s*"[^"]*"\s*$/, '');
  repaired = repaired.replace(/,\s*$/, '');

  // Strategy 3: Count and close brackets/braces
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < repaired.length; i++) {
    const char = repaired[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') openBraces++;
      else if (char === '}') openBraces--;
      else if (char === '[') openBrackets++;
      else if (char === ']') openBrackets--;
    }
  }

  // If we're still in a string, close it
  if (inString) {
    repaired += '"';
  }

  // Close any unclosed brackets and braces
  while (openBrackets > 0) {
    repaired += ']';
    openBrackets--;
  }
  while (openBraces > 0) {
    repaired += '}';
    openBraces--;
  }

  return repaired;
}

// ============================================================================
// LLM RESPONSE PARSING
// ============================================================================

/**
 * Parse LLM response from self-reviewer
 *
 * Extracts JSON from response and validates structure.
 * Includes JSON repair for truncated responses from models that stop early.
 *
 * @param responseContent - Raw LLM response content
 * @returns Parsed response or null if invalid
 */
export function parseSelfReviewerResponse(responseContent: string): SelfReviewerLLMResponse | null {
  try {
    // Strip markdown code block wrapper if present
    // Uses greedy matching and explicit boundary detection to handle nested code blocks
    let jsonContent = responseContent.trim();

    // Pattern 1: Response wrapped in ```json ... ``` or ``` ... ```
    // Use greedy match to get the OUTERMOST block (handles nested code blocks in content)
    if (jsonContent.startsWith('```')) {
      // Find the opening line (```json or just ```)
      const firstNewline = jsonContent.indexOf('\n');
      if (firstNewline > 0) {
        // Strip opening ``` line
        jsonContent = jsonContent.slice(firstNewline + 1);
      }
      // Find the closing ``` - it should be at the END of the response
      // Look for ``` that's on its own line at the end
      const closingMatch = jsonContent.match(/\n```\s*$/);
      if (closingMatch) {
        jsonContent = jsonContent.slice(0, closingMatch.index);
      } else if (jsonContent.endsWith('```')) {
        // Closing ``` without newline
        jsonContent = jsonContent.slice(0, -3);
      }
    }

    // Pattern 2: Response has ``` somewhere in the middle but JSON is before it
    // This can happen if model adds explanation after JSON
    // Try to find a complete JSON object
    jsonContent = jsonContent.trim();

    // Try direct parse first
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonContent);
    } catch (parseError) {
      // Try to repair truncated JSON
      logger.debug({
        msg: 'Attempting JSON repair for truncated response',
        originalError: parseError instanceof Error ? parseError.message : String(parseError),
        contentPreview: jsonContent.slice(-100),
      });

      const repairedJson = repairTruncatedJson(jsonContent);
      try {
        parsed = JSON.parse(repairedJson);
        logger.info({ msg: 'Successfully repaired truncated JSON response' });
      } catch {
        // Repair failed
        return null;
      }
    }

    // Validate structure - at minimum need status and reasoning
    if (parsed && typeof parsed === 'object' && 'status' in parsed && 'reasoning' in parsed) {
      // Ensure issues array exists (may be truncated/missing)
      const result = parsed as SelfReviewerLLMResponse;
      if (!result.issues) {
        result.issues = [];
      }
      // patched_content may be null or truncated - that's OK
      return result;
    }

    return null;
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to parse self-reviewer LLM response'
    );
    return null;
  }
}
