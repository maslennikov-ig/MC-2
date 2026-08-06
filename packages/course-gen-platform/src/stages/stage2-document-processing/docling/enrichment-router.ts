/**
 * Explainable routing for Docling's advanced enrichments.
 *
 * The baseline conversion through `/mcp` stays the first pass and the accepted
 * artifact. This module decides whether anything more is worth paying for, and
 * it is deliberately three-tiered rather than "baseline, then everything":
 *
 * 1. baseline (MCP) — unchanged, always;
 * 2. a CHEAP classification pass on the baseline Serve, because
 *    `DocumentFigureClassifier` is already in the baseline image and answers in
 *    seconds. It is what turns "this document has a picture" into "this picture
 *    is a bar chart";
 * 3. the advanced Serve, only for capabilities a concrete document item asks
 *    for. MEASURED on 2026-08-06: the advanced pass over one small PDF takes
 *    134s against 4s for baseline, and holds 4.34 GiB. Spending that because a
 *    document merely contains a photograph would be indefensible.
 *
 * Every decision carries the item that caused it, so a log line answers "why
 * did this document cost two minutes" without re-running anything (NFR-005).
 *
 * The advanced result NEVER replaces the accepted baseline document. Only
 * enrichment metadata is merged back, so a failed or partial advanced pass can
 * degrade the extra fields and cannot corrupt what the pipeline already
 * accepted (FR-015).
 *
 * @module stages/stage2-document-processing/docling/enrichment-router
 */

import { logger } from '../../../shared/logger/index.js';
import { normalizeDoclingDocument } from './raw-adapter.js';
import { DoclingError, DoclingErrorCode } from './types.js';
import type { DoclingDocument } from './types.js';

/** Enrichments this pipeline knows how to ask for and normalize. */
export type EnrichmentCapability =
  | 'code'
  | 'formula'
  | 'picture_classification'
  | 'chart'
  | 'picture_description';

/**
 * Picture classes whose numbers a chart extractor can actually recover.
 *
 * A flow chart or an engineering drawing classifies as a picture with
 * structure but has no series to read, and running an 8 GB vision model on one
 * would burn the budget for nothing.
 */
const CHART_CLASSES = new Set([
  'bar_chart',
  'line_chart',
  'pie_chart',
  'scatter_plot',
  'box_plot',
  'stacked_bar_chart',
]);

/** Below this the classifier is guessing, and a guess must not spend the VLM. */
export const CHART_CLASSIFICATION_MIN_CONFIDENCE = 0.5;

/**
 * Capabilities that are wired end to end but must not be requested.
 *
 * `picture_description` is here on evidence, not on caution. MEASURED
 * 2026-08-06 on `enrichment-code-formula-chart.pdf` with
 * `HuggingFaceTB/SmolVLM-256M-Instruct`, the preset this Serve build defaults
 * to: for a chart labelled Альфа/Бета/Гамма the model returned a description
 * titled "Bemma" with the categories "Bemma", "BeTa" and "Rammma" — an invented
 * title and three mangled labels. FR-014 makes invented labels a blocking
 * failure, so the capability stays off and the finding is recorded rather than
 * quietly dropped. The model stays in the advanced image so a larger VLM
 * candidate can be measured against the same fixture later.
 */
export const REJECTED_CAPABILITIES: ReadonlyMap<EnrichmentCapability, string> = new Map([
  [
    'picture_description',
    'SmolVLM-256M invents titles and mangles Cyrillic labels on the control fixture',
  ],
]);

/** One reason the router asked for one capability. */
export interface EnrichmentSignal {
  capability: EnrichmentCapability;
  /** Document items that triggered it, by Docling self_ref. */
  refs: string[];
  /** One clause, meant to be read in a log line. */
  reason: string;
}

export interface EnrichmentDecision {
  /** Capabilities to request from the advanced profile, possibly empty. */
  requested: EnrichmentCapability[];
  signals: EnrichmentSignal[];
  /** Wanted by the document but refused by policy, with the reason. */
  suppressed: Array<{ capability: EnrichmentCapability; reason: string }>;
}

function isMissingLanguage(language: string | undefined): boolean {
  return language === undefined || language.trim().length === 0 || language === 'unknown';
}

/**
 * Decides which capabilities a document actually justifies.
 *
 * `classified` is the outcome of the cheap classification pass when it has
 * run. Without it the router cannot tell a chart from a photograph, so it does
 * not ask for chart extraction at all — guessing here is what an 8 GB model
 * costs.
 */
export function decideEnrichments(
  document: DoclingDocument,
  options: { allowRejected?: boolean } = {}
): EnrichmentDecision {
  const signals: EnrichmentSignal[] = [];

  // Docling labels a code block without running any model, but leaves the
  // language `unknown`. That gap is the signal, not the presence of code.
  const unlabelledCode = document.texts
    .filter(text => text.type === 'code' && isMissingLanguage(text.code_language))
    .map(text => text.id);
  if (unlabelledCode.length > 0) {
    signals.push({
      capability: 'code',
      refs: unlabelledCode,
      reason: `${unlabelledCode.length} code block(s) with no language`,
    });
  }

  // A formula region that the text layer could not read comes back EMPTY, which
  // is precisely the case the model exists for. A formula that already carries
  // text needs nothing.
  const emptyFormulas = document.texts
    .filter(text => text.type === 'formula' && text.text.trim().length === 0)
    .map(text => text.id);
  if (emptyFormulas.length > 0) {
    signals.push({
      capability: 'formula',
      refs: emptyFormulas,
      reason: `${emptyFormulas.length} formula region(s) with no recovered text`,
    });
  }

  const chartPictures = document.pictures.filter(picture => {
    const classification = picture.enrichment?.classification;
    if (!classification || !CHART_CLASSES.has(classification.class_name)) return false;
    if ((classification.confidence ?? 1) < CHART_CLASSIFICATION_MIN_CONFIDENCE) return false;
    // A PPTX or XLSX declares its series in the source file and Docling reads
    // them with no model at all. Paying a vision model to re-read numbers we
    // already have exactly would be strictly worse than free.
    return picture.enrichment?.chart === undefined;
  });
  if (chartPictures.length > 0) {
    signals.push({
      capability: 'chart',
      refs: chartPictures.map(picture => picture.id),
      reason: `${chartPictures.length} chart picture(s) without source-declared series`,
    });
  }

  const suppressed: EnrichmentDecision['suppressed'] = [];
  const requested: EnrichmentCapability[] = [];
  for (const signal of signals) {
    const rejection = REJECTED_CAPABILITIES.get(signal.capability);
    if (rejection && !options.allowRejected) {
      suppressed.push({ capability: signal.capability, reason: rejection });
      continue;
    }
    requested.push(signal.capability);
  }

  return { requested, signals, suppressed };
}

/** Whether the cheap classification pass would tell the router anything new. */
export function needsClassificationPass(document: DoclingDocument): boolean {
  return document.pictures.some(picture => picture.enrichment?.classification === undefined);
}

/** Maps a capability to the Serve request field that turns it on. */
const CAPABILITY_FIELD: Record<EnrichmentCapability, string> = {
  code: 'do_code_enrichment',
  formula: 'do_formula_enrichment',
  picture_classification: 'do_picture_classification',
  chart: 'do_chart_extraction',
  picture_description: 'do_picture_description',
};

export interface EnricherConfig {
  /** Baseline Serve, which already carries the picture classifier. */
  baseUrl: string;
  /** Advanced Serve, which carries the code/formula and chart models. */
  advancedUrl: string;
  timeoutMs?: number;
}

export interface EnrichmentPassResult {
  document: DoclingDocument;
  capabilities: EnrichmentCapability[];
  durationMs: number;
  /** Which service answered, so the profile is visible in evidence. */
  profile: 'baseline' | 'advanced';
}

/**
 * Runs one enrichment pass against Docling Serve and normalizes the answer.
 *
 * Internal-network only, exactly like the native chunker: `/mcp` remains the
 * conversion boundary for the pipeline, and this typed adapter is the only
 * place that speaks to Serve directly.
 */
export class DoclingServeEnricher {
  private readonly timeoutMs: number;

  constructor(private readonly config: EnricherConfig) {
    this.timeoutMs = config.timeoutMs ?? 1_800_000;
  }

  async run(
    file: { name: string; bytes: Uint8Array },
    capabilities: readonly EnrichmentCapability[],
    profile: 'baseline' | 'advanced'
  ): Promise<EnrichmentPassResult> {
    if (capabilities.length === 0) {
      throw new DoclingError(
        DoclingErrorCode.PROCESSING_ERROR,
        'Refusing an enrichment pass with no capabilities: it would pay a conversion for nothing'
      );
    }

    const startedAt = Date.now();
    const form = new FormData();
    form.append('files', new Blob([file.bytes as BlobPart]), file.name);
    form.append('to_formats', 'json');
    form.append('include_images', 'true');
    form.append('images_scale', '2.0');
    for (const capability of capabilities) {
      form.append(CAPABILITY_FIELD[capability], 'true');
    }

    const url = `${profile === 'advanced' ? this.config.advancedUrl : this.config.baseUrl}/v1/convert/file`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: form,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      // Serve answers a missing model with 404 and the body "Task result not
      // found. Please wait for a completion status.", putting the real cause
      // only in its own log. Repeating that verbatim would hand the pipeline a
      // message that actively misdirects, so the capability set and profile are
      // named here — they are what actually differs between a working request
      // and this one.
      const body = await response.text().catch(() => '');
      throw new DoclingError(
        DoclingErrorCode.PROCESSING_ERROR,
        `Docling Serve ${profile} enrichment failed (${response.status}) for ` +
          `[${capabilities.join(', ')}]. Serve says: ${body.slice(0, 200)}. ` +
          'A 404 here usually means the profile lacks a model for one of those capabilities.'
      );
    }

    const payload = (await response.json()) as {
      document?: { json_content?: unknown };
    };
    const json = payload.document?.json_content;
    if (json === undefined) {
      throw new DoclingError(
        DoclingErrorCode.PROCESSING_ERROR,
        `Docling Serve ${profile} enrichment returned no json_content`
      );
    }

    return {
      document: normalizeDoclingDocument(json),
      capabilities: [...capabilities],
      durationMs: Date.now() - startedAt,
      profile,
    };
  }
}

/**
 * Copies enrichment metadata from an enrichment pass onto the accepted
 * document, matching items by Docling `self_ref`.
 *
 * Matching by ref and not by position is the consistency guard: a second
 * conversion can legitimately produce a different number of items, and pairing
 * the fifth picture of one run with the fifth of another would silently attach
 * a chart's series to an unrelated photograph. Anything the accepted document
 * does not contain is dropped, and everything it already had is preserved.
 */
export function mergeEnrichment(
  accepted: DoclingDocument,
  enriched: DoclingDocument
): { document: DoclingDocument; matched: number; unmatched: number } {
  const picturesByRef = new Map(enriched.pictures.map(picture => [picture.id, picture]));
  const textsByRef = new Map(enriched.texts.map(text => [text.id, text]));
  let matched = 0;
  let unmatched = 0;

  const pictures = accepted.pictures.map(picture => {
    const source = picturesByRef.get(picture.id);
    if (!source) {
      unmatched += 1;
      return picture;
    }
    if (source.enrichment === undefined) return picture;
    matched += 1;
    return {
      ...picture,
      enrichment: { ...picture.enrichment, ...source.enrichment },
    };
  });

  const texts = accepted.texts.map(text => {
    const source = textsByRef.get(text.id);
    if (!source) {
      unmatched += 1;
      return text;
    }
    // A recovered formula arrives as the item's own text, and an empty accepted
    // text is exactly the hole the pass was asked to fill. Never overwrite text
    // the baseline already read.
    const filledText =
      text.text.trim().length === 0 && source.text.trim().length > 0 ? source.text : text.text;
    const language = isMissingLanguage(text.code_language)
      ? source.code_language
      : text.code_language;
    if (filledText === text.text && language === text.code_language) return text;
    matched += 1;
    return { ...text, text: filledText, code_language: language };
  });

  return { document: { ...accepted, pictures, texts }, matched, unmatched };
}

/** Logs a decision so the cost of a document is explainable after the fact. */
export function logEnrichmentDecision(
  decision: EnrichmentDecision,
  context: { documentKey: string }
): void {
  logger.info(
    {
      documentKey: context.documentKey,
      requested: decision.requested,
      suppressed: decision.suppressed,
      reasons: decision.signals.map(signal => `${signal.capability}: ${signal.reason}`),
    },
    decision.requested.length > 0
      ? 'Advanced Docling enrichment justified'
      : 'Advanced Docling enrichment not justified; baseline artifact is final'
  );
}
