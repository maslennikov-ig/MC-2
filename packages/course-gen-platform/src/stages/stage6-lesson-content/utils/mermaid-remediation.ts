/**
 * Mermaid Adaptive Remediation Helpers
 * @module stages/stage6-lesson-content/utils/mermaid-remediation
 *
 * Stage 5 of the Mermaid fix pipeline: adaptive remediation.
 * Extracted from mermaid-fix-pipeline.ts to comply with max-lines rule.
 */

// ============================================================================
// PATTERNS
// ============================================================================

const MERMAID_EDGE_PATTERN = /-->|-\.->|==>|---|~~~/;
const MERMAID_CONTROL_LINE_PATTERN =
  /^\s*(?:%%\{.*\}%%|classDef\b|class\b|style\b|linkStyle\b|click\b)/i;

// ============================================================================
// HELPERS
// ============================================================================

export function wrapMermaidBlock(code: string): string {
  return `\`\`\`mermaid\n${code}\n\`\`\``;
}

function normalizeSingleArrows(line: string): string {
  let normalized = '';

  for (let i = 0; i < line.length; i++) {
    if (line[i] === '-' && line[i + 1] === '>') {
      const before = i > 0 ? line[i - 1] : '';
      const after = i + 2 < line.length ? line[i + 2] : '';

      // Keep valid sequence arrows (->>) and existing flow arrows (-->, -.->)
      const isSequenceArrow = after === '>';
      const isAlreadyFlowArrow = before === '-' || before === '.';
      if (!isSequenceArrow && !isAlreadyFlowArrow && after !== '-') {
        normalized += '-->';
        i += 1;
        continue;
      }
    }

    normalized += line[i];
  }

  return normalized;
}

export function simplifyMermaidDiagram(code: string): string {
  const lines = code
    .split('\n')
    .map(line => line.trimEnd())
    .filter((line, index) => !(index === 0 && line.trim().length === 0));

  if (lines.length === 0) {
    return code;
  }

  const [header, ...bodyLines] = lines;

  const simplifiedBody = bodyLines
    .map(line => line.replace(/<br\s*\/?>/gi, ' '))
    .map(line => line.replace(/`/g, ''))
    .map(line => normalizeSingleArrows(line))
    .filter(line => !MERMAID_CONTROL_LINE_PATTERN.test(line))
    .map(line => line.replace(/\s{2,}/g, ' ').trimEnd())
    .filter(line => line.trim().length > 0);

  if (simplifiedBody.length === 0) {
    return header.trim();
  }

  return [header.trim(), ...simplifiedBody].join('\n').trim();
}

function isFlowchartHeader(line: string): boolean {
  return /^(flowchart|graph)\b/i.test(line.trim());
}

function isEdgeLine(line: string): boolean {
  return MERMAID_EDGE_PATTERN.test(line);
}

export function splitMermaidDiagramIntoTwo(
  code: string
): { firstDiagram: string; secondDiagram: string } | null {
  const lines = code
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.trim().length > 0);

  if (lines.length < 3) {
    return null;
  }

  const header = lines[0].trim();
  if (!isFlowchartHeader(header)) {
    return null;
  }

  const bodyLines = lines.slice(1).filter(line => !MERMAID_CONTROL_LINE_PATTERN.test(line));
  const edgeLines = bodyLines.filter(isEdgeLine);

  if (edgeLines.length < 2) {
    return null;
  }

  const midpoint = Math.ceil(edgeLines.length / 2);
  const firstEdges = edgeLines.slice(0, midpoint);
  const secondEdges = edgeLines.slice(midpoint);

  if (firstEdges.length === 0 || secondEdges.length === 0) {
    return null;
  }

  const sharedNodeLines = bodyLines.filter(line => !isEdgeLine(line));
  const firstDiagram = [header, ...sharedNodeLines, ...firstEdges].join('\n').trim();
  const secondDiagram = [header, ...sharedNodeLines, ...secondEdges].join('\n').trim();

  return { firstDiagram, secondDiagram };
}
