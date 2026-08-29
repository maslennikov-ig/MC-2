/**
 * Single catalogue of every model the platform can route to or has ever billed.
 *
 * Before 2026-08-12 this lived in four places that disagreed: two live pricing
 * tables (`shared/llm/cost-calculator.ts`, `shared/metrics/cost-tracker.ts`), a
 * local copy inside Stage 4 observability, and a dead `shared/llm/model-pricing.ts`
 * still quoting GPT-4 Turbo. Four of the seven models actually in production were
 * absent from every one of them, so their cost silently resolved to a $1/$3
 * default and reported a plausible wrong number.
 *
 * Prices are the current OpenRouter /models base per-token list prices at the
 * verification date below, not historical snapshots. Provider threshold
 * overrides are not representable by this flat catalogue and require a
 * model-specific routing guard (see Qwen 3 Max in cost-calculator.ts). A call is
 * priced once and the USD amount is persisted in generation_trace, so changing
 * this catalogue does not reprice old reports. Retired-but-still-listed models
 * stay current so re-enabling one cannot silently revive an obsolete tariff. A
 * `delisted` model has no current price; its last observed rate is retained only
 * as an explicitly marked fallback.
 *
 * Pricing verified against https://openrouter.ai/api/v1/models on 2026-08-14.
 * Keep it that way: a hand-typed price is indistinguishable from a correct one
 * until an invoice disagrees.
 *
 * Refs mc2-a2j1x, mc2-0a47t
 */

/**
 * The value a text rate takes when the provider publishes none.
 *
 * It is zero, and zero is the wrong word for it — which is the whole reason it
 * has a name. `sourceful/riverflow-v2.5-fast` charges per frame; its entire
 * OpenRouter `pricing` array is one `output_image` entry, so there is no prompt
 * or completion rate to quote. Written as a bare `0` it reads as "free", and a
 * reader scanning this table has no way to tell that apart from a rate somebody
 * forgot to fill in — which is exactly the sort of number that has gone 6.4x
 * wrong here before (mc2-f4n3q).
 *
 * Using it is not free either: `model-catalog-coverage` requires that an entry
 * quoting it also declares `billedPerImage` and a positive per-image rate, so
 * "no text rate" can never stand in for "no rate at all". A model with nothing
 * to charge it at still fails.
 */
export const NO_PUBLISHED_TEXT_RATE = 0;

export interface ModelCapabilities {
  /** USD per 1M input tokens */
  inputPricePerMillion: number;
  /** USD per 1M output tokens */
  outputPricePerMillion: number;
  /** Total context window, or null when the provider does not publish one */
  contextLength: number | null;
  /** Provider ceiling on a single completion, or null when unpublished */
  maxOutputTokens: number | null;
  /**
   * Whether the provider honours `temperature`. OpenAI's GPT-5.6 series does
   * not — it exposes reasoning controls instead — and sending it anyway makes
   * the configured value a lie rather than an error.
   */
  supportsTemperature: boolean;
  /** Whether the provider accepts the OpenRouter `reasoning` parameter */
  supportsReasoning: boolean;
  /**
   * Whether the provider refuses to switch deliberation off. Accepting
   * `reasoning` and allowing `reasoning: {enabled: false}` are different
   * questions, and OpenRouter's `supported_parameters` only answers the first:
   * it lists `reasoning` for every model below, and five of them answer
   * `400 Reasoning is mandatory for this endpoint and cannot be disabled`.
   *
   * Measured against the live API on 2026-08-15 for the whole catalogue.
   */
  requiresReasoning?: true;
  /** Unified rate for models that charge the same for input and output */
  combinedPricePerMillion?: number;
  /**
   * Billed per generated image upstream, at {@link imageOutputPricePerMillion}
   * rather than at `outputPricePerMillion`.
   */
  billedPerImage?: boolean;
  /**
   * USD per 1M **image output** tokens — OpenRouter's `pricing.image_output`.
   *
   * This rate existed all along and nothing read it. Image prices lived in a
   * second table inside `image-generation-service.ts`, which is exactly what the
   * header of `shared/metrics/llm-cost.ts` forbids, and it drifted: one 1024x1024
   * `openai/gpt-5-image-mini` card was booked at that table's $0.007 against a
   * real $0.045080 on 2026-08-21 — 6.4x low, and the entire residual of that
   * run's reconciliation (mc2-5mhlb).
   *
   * An image call's output tokens are image tokens, so the estimate is the same
   * arithmetic as any other call, with this rate in place of the text one. The
   * estimate only has to hold for the ~10s until `GET /api/v1/generation`
   * answers with the charge itself.
   */
  imageOutputPricePerMillion?: number;
  /**
   * USD for one generated image, flat, for models that charge by the picture
   * rather than by its tokens.
   *
   * Both halves of the image catalogue exist and they are not convertible. 17 of
   * the 48 quote a per-token rate, which {@link imageOutputPricePerMillion}
   * covers; 26 quote a flat per-frame or per-megapixel price and report no
   * output tokens at all, so the token arithmetic yields `undefined` for them
   * however good the rate is. Modelling a flat price as a token rate would mean
   * inventing a token count, which is how the private price table this catalogue
   * replaced went 6.4x wrong.
   *
   * Where both are present the flat price wins: it is what the provider charges.
   */
  imagePriceFlatUsd?: number;
  /**
   * No longer offered by OpenRouter.
   *
   * It marks an entry the nightly price gate must not compare, because there is
   * no published rate left to compare against — without it the gate named all
   * five of them every night as "delisted, or the id is misspelled".
   *
   * No entry carries it today: on 2026-08-29 the five that did were deleted
   * instead, because a delisted model is only worth keeping if some report
   * actually needs its rate, and none of the five had ever been charged for
   * (mc2-11jn5). Kept because the next delisting is a matter of time, and the
   * gate already knows what to do with it.
   */
  delisted?: true;
}

export const MODEL_CATALOG: Record<string, ModelCapabilities> = {
  // --- On the live routing path ---
  'google/gemini-2.5-flash-image': {
    inputPricePerMillion: 0.3,
    outputPricePerMillion: 2.5,
    contextLength: 32768,
    maxOutputTokens: 8192,
    supportsTemperature: true,
    supportsReasoning: false,
    billedPerImage: true,
    imageOutputPricePerMillion: 30,
  },
  /**
   * The lesson banner, from 2026-08-27.
   *
   * Chosen by measurement across every 16:9-capable model on OpenRouter: it
   * billed $0.013954 against gemini-2.5-flash-image's $0.038725, and against
   * $0.019247 for that model once the flex endpoint is pinned. The picture is
   * the better one too — asked for layered translucent planes with a node
   * cluster left of centre, it produced exactly that, in the requested palette,
   * with no text.
   *
   * Priced per image, not per token, which is why `imagePriceFlatUsd` had to
   * exist. `input`/`output` per million are the endpoint's text rates and are
   * not what a banner is charged at.
   *
   * The $0.019 here is the **published** base rate, which is what the drift gate
   * compares against, and it is deliberately not the $0.013954 that was billed:
   * the 1K frame came in under list. An estimate that undercuts the receipt
   * would be the more dangerous error, and either way it stands for about ten
   * seconds before `GET /api/v1/generation` replaces it with the charge itself.
   *
   * It is Images-API only — not one of the nine image models chat completions
   * carries — which is what `usesImagesApi` had to be corrected for, and it
   * publishes no `quality`.
   */
  'sourceful/riverflow-v2.5-fast': {
    // Its whole `pricing` array is one `output_image` entry; there is no text
    // leg to quote. The model is only ever reached through the image path,
    // which prices from `imagePriceFlatUsd` below.
    inputPricePerMillion: NO_PUBLISHED_TEXT_RATE,
    outputPricePerMillion: NO_PUBLISHED_TEXT_RATE,
    contextLength: 4096,
    maxOutputTokens: 4096,
    supportsTemperature: false,
    supportsReasoning: false,
    billedPerImage: true,
    imagePriceFlatUsd: 0.019,
  },
  /**
   * The banner's fallback, and the reason it is not the card's model.
   *
   * `gpt-5-image-mini` and `gpt-image-1-mini` publish `1:1, 3:2, 2:3, auto` and
   * nothing wider, so neither could have drawn a 16:9 banner had the old
   * fallback ever been reached. `gpt-image-2` is the only OpenAI image model
   * that publishes 16:9 — and 9:16, if vertical banners are ever wanted.
   *
   * Priced per token like the rest of the OpenAI line, at 3.75x the mini rate:
   * measured $0.032775 for one square card against the incumbent's $0.009085.
   * Acceptable for a hop that is only taken when the primary is down.
   */
  'openai/gpt-image-2': {
    inputPricePerMillion: 5,
    outputPricePerMillion: 30,
    contextLength: 32768,
    maxOutputTokens: 8192,
    supportsTemperature: false,
    supportsReasoning: false,
    billedPerImage: true,
    imageOutputPricePerMillion: 30,
  },
  /**
   * The ordinary tariff, which is twice what this entry used to hold — and
   * Google did not raise anything. The model publishes three tiers from each of
   * two providers: `/flex` at $0.375/$1.875, the plain tag at $0.75/$3.75, and
   * `/priority` at $1.35/$6.75. The entry had been filled from the flex row
   * while `GET /api/v1/models` quotes the plain one, so the nightly sync read a
   * permanent 2x drift it could never settle.
   *
   * The plain tier is the right one to freeze even though most phases request
   * flex: `provider.max_price` is this figure times 1.5, and flex refuses rather
   * than falling back, so the retry that follows runs at the ordinary tariff. At
   * the flex rate that ceiling was $0.5625 — under the price of the call it was
   * about to make (mc2-rhyac).
   */
  'google/gemini-3.7-flash': {
    inputPricePerMillion: 0.75,
    outputPricePerMillion: 3.75,
    contextLength: 1048576,
    maxOutputTokens: 65536,
    supportsTemperature: true,
    supportsReasoning: true,
    requiresReasoning: true,
  },
  /** Async Batch API tariff; never substitute this ID into the synchronous endpoint. */
  'google/gemini-3.7-flash:batch': {
    inputPricePerMillion: 0.1875,
    outputPricePerMillion: 0.9375,
    contextLength: 1048576,
    maxOutputTokens: 65536,
    supportsTemperature: false,
    supportsReasoning: true,
    requiresReasoning: true,
  },
  'minimax/minimax-m3': {
    inputPricePerMillion: 0.3,
    outputPricePerMillion: 1.2,
    contextLength: 1048576,
    maxOutputTokens: 512000,
    supportsTemperature: true,
    supportsReasoning: true,
  },
  /**
   * Re-read 2026-08-21: $0.30/$1.20 — identical to the base rate above, not half
   * it. The entry had carried $0.15/$0.60 on the same wrong "half the base
   * tariff" premise as `z-ai/glm-5.2:batch` (mc2-hc91g).
   */
  'minimax/minimax-m3:batch': {
    inputPricePerMillion: 0.3,
    outputPricePerMillion: 1.2,
    contextLength: 524288,
    maxOutputTokens: null,
    supportsTemperature: true,
    supportsReasoning: true,
  },
  'openai/gpt-5-image-mini': {
    inputPricePerMillion: 2.5,
    outputPricePerMillion: 2,
    contextLength: 400000,
    maxOutputTokens: 128000,
    supportsTemperature: true,
    supportsReasoning: true,
    billedPerImage: true,
    imageOutputPricePerMillion: 8,
  },
  /**
   * Re-read from `/api/v1/models` on 2026-08-21: $0.20/$1.20. The entry had
   * carried $0.10/$0.60 — exactly the Batch tariff below, so the synchronous
   * rate had been recorded at half its real value. Every luna call in the
   * 2026-08-20 run was therefore under-counted by half, and because luna is the
   * primary for the Career Playbook's spec and proofreading phases, that
   * mispricing was the single largest catalogue contribution to the $0.066839
   * gap against the invoice (mc2-v1pn2).
   */
  'openai/gpt-5.6-luna': {
    inputPricePerMillion: 0.2,
    outputPricePerMillion: 1.2,
    contextLength: 1050000,
    maxOutputTokens: 128000,
    supportsTemperature: false,
    supportsReasoning: true,
  },
  /** Async Batch API tariff: half the synchronous rate above, confirmed 2026-08-21. */
  'openai/gpt-5.6-luna:batch': {
    inputPricePerMillion: 0.1,
    outputPricePerMillion: 0.6,
    contextLength: 1050000,
    maxOutputTokens: 128000,
    supportsTemperature: false,
    supportsReasoning: true,
  },
  /**
   * The `/models` base rate, re-read 2026-08-21: $0.966/$3.036. The entry had
   * carried $1.19/$3.74, which is 1.23x too dear — an overstatement, and
   * therefore one that hid the luna understatement above rather than adding to
   * it, which is why the invoice gap looked smaller than its causes (mc2-156kg).
   *
   * This model is served by many providers and they disagree widely — the
   * endpoint list has run from $0.49/$1.54 to $1.40/$4.40 — so the base rate is
   * the catalogue default, not a guarantee of what a call is charged. Since
   * 2026-08-21 the charge itself is read back from `/api/v1/generation`, and
   * this figure is what a price ceiling and a budget estimate are built from.
   */
  'z-ai/glm-5.2': {
    // Re-read live 2026-08-25: 0.966/3.036 had drifted to 1.19/3.74 (0.81x).
    inputPricePerMillion: 1.19,
    outputPricePerMillion: 3.74,
    contextLength: 1048576,
    maxOutputTokens: 262144,
    supportsTemperature: true,
    supportsReasoning: true,
  },
  /**
   * Read live 2026-08-26, the day the model was published (mc2-r8shw).
   *
   * Two endpoints only — `z-ai` at exactly this rate and `novita` at twice it —
   * so unlike `glm-5.2` above there is no wide provider spread to hedge
   * against, and equally little to reroute to if z-ai goes down. No `:batch`
   * sibling exists.
   *
   * `requiresReasoning` here is not inherited from the family, it is measured:
   * both endpoints answer `400 Reasoning is mandatory for this endpoint and
   * cannot be disabled`. That costs real tokens — 791 of them on a prompt whose
   * answer was three sentences — and the rate still comes out ahead of luna's
   * $0.20/$1.20 per call.
   *
   * Not recorded here because the catalogue has no field for it: this model
   * ignores a strict `json_schema` and answers with a shape of its own, so the
   * three call sites that ask for one stay on luna. `supported_parameters` omits
   * `structured_outputs`, which turned out to be the truth rather than an
   * oversight.
   */
  'z-ai/glm-5.3-flash': {
    inputPricePerMillion: 0.075,
    outputPricePerMillion: 0.25,
    contextLength: 1048576,
    maxOutputTokens: 131072,
    supportsTemperature: true,
    supportsReasoning: true,
    requiresReasoning: true,
  },
  /**
   * Re-read 2026-08-21: $1.40/$4.40. The entry had carried $0.70/$2.20 on the
   * belief that the Batch tariff is half the base rate — true for luna, false
   * here. This id is *dearer* than the synchronous `z-ai/glm-5.2` above, not
   * cheaper, so the halving was not a rounding error but a wrong premise
   * (mc2-hc91g).
   */
  'z-ai/glm-5.2:batch': {
    inputPricePerMillion: 1.4,
    outputPricePerMillion: 4.4,
    contextLength: 512000,
    maxOutputTokens: null,
    supportsTemperature: true,
    supportsReasoning: true,
  },
  /**
   * The pinned snapshot that replaced the `~...-latest` alias on 2026-08-21.
   *
   * Chosen from measurement, not from its date. On 2026-08-21 the alias resolved
   * to exactly this snapshot — same 1310720 context window — so pinning changed
   * nothing about what runs; it only stopped it moving again. It carries 30
   * endpoints against 18 for the undated `deepseek/deepseek-v4-flash` id, and
   * its cheapest endpoint (Sail Research, $0.065/$0.180) is the same one the
   * alias was reaching, so the cheapest route is unchanged.
   *
   * $0.08/$0.18 is the published list rate for the snapshot, which is what the
   * 1.5x ceiling is built from: $0.12/$0.27 keeps the cheap end of the pool —
   * Sail Research, Relace, DeepInfra, StreamLake — and removes only the 6.8x
   * tail. A ceiling under every endpoint is a refusal, not a saving (mc2-qch4w).
   */
  'deepseek/deepseek-v4-flash-0731': {
    // Re-read 2026-08-26: $0.06/$0.12. It read $0.14/$0.28 the day before, and
    // $0.08/$0.18 the day before that — this one moved 2.33x within two hours on
    // 2026-08-25. Chasing it by hand is not the plan: the ceiling reads the
    // published list live, and this figure is what it falls back on when it
    // cannot. Being high there costs an overstated estimate; being low refuses
    // the call.
    inputPricePerMillion: 0.045,
    outputPricePerMillion: 0.09,
    contextLength: 1310720,
    maxOutputTokens: 384000,
    supportsTemperature: true,
    supportsReasoning: true,
  },
  /**
   * Re-read 2026-08-21: $0.065/$0.140. The entry had carried $0.08/$0.252, over
   * by 1.23x on input and 1.80x on output (mc2-156kg).
   *
   * Retired from routing on 2026-08-21 in favour of the pinned snapshot above,
   * and kept only so the rows it already wrote still resolve. A `~` alias is a
   * redirect, not a model: it follows its family to whatever snapshot is
   * current, and on 2026-08-17 07:03 it followed DeepSeek V4 Flash to
   * `-20260731`, taking median latency from 8.7s to 102s without a single
   * configuration change on our side. Its price can move the same way. That is
   * the root cause of the 12-20 August failures and the reason nothing
   * downstream treats this number as the charge (mc2-qch4w).
   */
  '~deepseek/deepseek-v4-flash-latest': {
    // Re-read 2026-08-23 by the first run of the nightly drift check: $0.05/
    // $0.13. The entry was 1.30x/1.38x over — an alias following its family to
    // a cheaper snapshot, which is the same mechanism that made it unsafe to
    // route on.
    inputPricePerMillion: 0.03,
    outputPricePerMillion: 0.1,
    contextLength: 1048576,
    maxOutputTokens: null,
    supportsTemperature: true,
    supportsReasoning: true,
  },

  // --- Retired from routing; kept so historical cost reports still resolve ---
  //
  // Every entry below has been paid for at least once. Eleven others were
  // removed on 2026-08-29 because they had not: five carried `delisted: true`
  // with the words "retained so old cost reports still resolve", and there were
  // no such reports to resolve. Checked against both ledgers, which is the part
  // that is easy to get wrong — a playbook's spend is in
  // `career_playbooks.cost_breakdown`, not in `generation_trace`, and
  // `deepseek-v4-pro` reads as never-used in the second while holding 189 calls
  // in the first (mc2-11jn5).
  /**
   * Re-read twice on 2026-08-21: $0.14/$0.28 was 1.7x over, and the $0.0826/
   * $0.1652 that replaced it was still 1.04x over. It matters more than a
   * retired entry normally would, because `normalizeModelId` prices every dated
   * V4 Flash snapshot from here when the snapshot has no entry of its own
   * (mc2-hc91g).
   */
  'deepseek/deepseek-v4-flash': {
    // Re-read 2026-08-26: $0.088606/$0.177212. The entry held $0.05306/$0.10612
    // — 40% UNDER, which is the dangerous direction. `provider.max_price` is
    // built from this number, and a ceiling below every endpoint is answered
    // with a refusal rather than a cheaper route (mc2-a6qxc). Fourth correction
    // to this one entry; the value moves faster than anybody re-reads it, which
    // is why the frozen figure is only a fallback for when the live list cannot
    // be read, and why too high is the safe way to be wrong.
    inputPricePerMillion: 0.08512,
    outputPricePerMillion: 0.17024,
    contextLength: 1048576,
    maxOutputTokens: 384000,
    supportsTemperature: true,
    supportsReasoning: true,
  },
  'deepseek/deepseek-v4-pro': {
    // Re-read 2026-08-23: $0.396894/$0.793788, against $1.60/$3.20 here — 4.03x
    // over, the largest gap the catalogue has held. Not on a live route, so it
    // cost nothing; had it been, `provider.max_price` would have been built four
    // times too high and bought nothing.
    inputPricePerMillion: 0.680862,
    outputPricePerMillion: 1.361724,
    contextLength: 1048576,
    maxOutputTokens: 393216,
    supportsTemperature: true,
    supportsReasoning: true,
  },
  /**
   * Superseded by `google/gemini-3.7-flash` on 2026-08-14: same context window
   * and output ceiling, less money. Kept so cost reports written while this was
   * routed still resolve to a price.
   */
  'google/gemini-3-flash-preview': {
    inputPricePerMillion: 0.5,
    outputPricePerMillion: 3,
    contextLength: 1048576,
    maxOutputTokens: 65536,
    supportsTemperature: true,
    supportsReasoning: true,
  },
  'minimax/minimax-m2.1': {
    inputPricePerMillion: 0.3,
    outputPricePerMillion: 1.2,
    contextLength: 204800,
    maxOutputTokens: 131072,
    supportsTemperature: true,
    supportsReasoning: true,
    requiresReasoning: true,
  },
  'moonshotai/kimi-k2-thinking': {
    inputPricePerMillion: 0.6,
    outputPricePerMillion: 2.5,
    contextLength: 262144,
    maxOutputTokens: 100352,
    supportsTemperature: true,
    supportsReasoning: true,
    requiresReasoning: true,
  },
  'qwen/qwen3-235b-a22b-2507': {
    inputPricePerMillion: 0.0875,
    outputPricePerMillion: 0.35,
    contextLength: 262144,
    maxOutputTokens: 16384,
    supportsTemperature: true,
    supportsReasoning: false,
  },
  'qwen/qwen3.7-plus': {
    inputPricePerMillion: 0.32,
    outputPricePerMillion: 1.28,
    contextLength: 1000000,
    maxOutputTokens: 131072,
    supportsTemperature: true,
    supportsReasoning: true,
  },
  'z-ai/glm-5': {
    inputPricePerMillion: 0.6,
    outputPricePerMillion: 1.92,
    contextLength: 204800,
    maxOutputTokens: 131072,
    supportsTemperature: true,
    supportsReasoning: true,
  },
};

/** Price fallback for a model absent from the catalogue. Deliberately pessimistic. */
export const UNKNOWN_MODEL_PRICING: ModelCapabilities = {
  inputPricePerMillion: 1.0,
  outputPricePerMillion: 3.0,
  contextLength: null,
  maxOutputTokens: null,
  supportsTemperature: true,
  supportsReasoning: false,
};

/**
 * The catalogue key a served model id belongs to.
 *
 * A price follows the model the provider actually served, and that is not always
 * what was asked for: OpenRouter answers `deepseek/deepseek-v4-flash` with
 * `deepseek/deepseek-v4-flash-0731`, and a router alias arrives as
 * `~vendor/model-latest`. Neither is a catalogue key, so the call was traced
 * with no price at all (mc2-b7olk.6).
 *
 * Only shapes that are certainly the same model are stripped: a leading `~`
 * router marker, a trailing `-latest`, a trailing `:batch` suffix, and a
 * trailing date. Anything else is left alone — a differently named model is a
 * different model, not a spelling of this one.
 */
export function normalizeModelId(modelId: string): string {
  return modelId
    .replace(/^~/u, '')
    .replace(/:batch$/u, '')
    .replace(/-latest$/u, '')
    .replace(/-\d{4,8}$/u, '');
}

/**
 * What is known about a model, by exact id or by the id it is a variant of.
 *
 * A variant's tariff can differ from its base — the 0731 snapshot costs 1.7× the
 * alias — so the base entry is a floor, not the truth. It is still better than
 * no price: an unpriced row disappears from the course total silently.
 */
export function getModelCapabilities(modelId: string): ModelCapabilities | null {
  // Callers reach here from accounting paths where the served model can be
  // missing entirely - the Batch API omits it on some result bodies - and a
  // lookup that throws would fail the generation it was only counting.
  if (!modelId) return null;
  const exact = MODEL_CATALOG[modelId];
  if (exact) return exact;
  return MODEL_CATALOG[normalizeModelId(modelId)] ?? null;
}

/** Whether the price for this id is its own, rather than its base model's. */
export function hasExactModelPricing(modelId: string): boolean {
  return modelId in MODEL_CATALOG;
}

export function isModelInCatalog(modelId: string): boolean {
  return modelId in MODEL_CATALOG;
}

/**
 * Models routed today. A model missing from here is not necessarily wrong — it
 * may simply be legacy — but a routing row naming one is.
 */
export const LIVE_ROUTING_MODEL_IDS = [
  'deepseek/deepseek-v4-flash-0731',
  'openai/gpt-5.6-luna',
  'z-ai/glm-5.2',
  'z-ai/glm-5.3-flash',
  'minimax/minimax-m3',
  'google/gemini-3.7-flash',
  'openai/gpt-5-image-mini',
  'google/gemini-2.5-flash-image',
  'sourceful/riverflow-v2.5-fast',
  'openai/gpt-image-2',
] as const;

/** True when the provider honours `temperature`; unknown models are assumed to. */
export function modelSupportsTemperature(modelId: string): boolean {
  return getModelCapabilities(modelId)?.supportsTemperature ?? true;
}

/** True when the provider accepts the OpenRouter `reasoning` parameter. */
export function modelSupportsReasoning(modelId: string): boolean {
  return getModelCapabilities(modelId)?.supportsReasoning ?? false;
}

/**
 * True when the provider rejects `reasoning: {enabled: false}` outright.
 *
 * Callers that do not want deliberation must ask such a model for the least of
 * it rather than for none, or every call is a 400.
 */
export function modelRequiresReasoning(modelId: string): boolean {
  return getModelCapabilities(modelId)?.requiresReasoning ?? false;
}

/**
 * Extra answer budget given to a model that cannot stop deliberating.
 *
 * OpenRouter bills reasoning tokens against `max_tokens`, so a mandatory
 * thinker spends the answer's budget on thinking and the reply is truncated.
 * The ceiling costs nothing unless it is used; `effort: 'low'` is what bounds
 * the real spend. Measured on 2026-08-15 with a short prompt at that effort:
 * gemini-3.7-flash 0, gpt-oss-20b 14, minimax-m2.1 296, minimax-m2 1241,
 * kimi-k2-thinking 2428 reasoning tokens.
 */
export const MANDATORY_REASONING_RESERVE_TOKENS = 4096;
