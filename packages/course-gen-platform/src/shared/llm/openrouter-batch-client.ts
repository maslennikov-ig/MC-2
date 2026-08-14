const OPENROUTER_BATCH_URL = 'https://openrouter.ai/api/beta/batches';

export type OpenRouterBatchStatus =
  | 'validating'
  | 'in_progress'
  | 'finalizing'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'cancelling'
  | 'cancelled';

export interface OpenRouterBatchError {
  code?: string | number;
  message: string;
}

export interface OpenRouterBatchResultItem {
  id?: string;
  custom_id: string;
  response: {
    status_code: number;
    request_id: string;
    body: {
      id?: string;
      model?: string;
      choices?: Array<{
        index?: number;
        message?: { role?: string; content?: unknown };
        finish_reason?: string | null;
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        cost?: number;
      };
    };
  } | null;
  error: OpenRouterBatchError | null;
}

export interface OpenRouterBatch {
  id: string;
  object: 'batch';
  endpoint: string;
  model: string;
  completion_window: '24h';
  status: OpenRouterBatchStatus;
  created_at: number;
  finalized_at: number | null;
  request_counts: {
    total: number;
    completed: number;
    failed: number;
  };
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
    is_byok?: boolean;
  } | null;
  results: OpenRouterBatchResultItem[] | null;
  error: OpenRouterBatchError | null;
}

export interface OpenRouterChatBatchRequest {
  customId: string;
  body: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    max_tokens?: number;
    temperature?: number;
    reasoning?: unknown;
    response_format?: unknown;
    seed?: number;
    stop?: string | string[];
  };
}

export interface OpenRouterBatchClientOptions {
  apiKey: string;
  fetch?: typeof fetch;
}

export class OpenRouterBatchHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterSeconds: number | null,
    message: string
  ) {
    super(message);
    this.name = 'OpenRouterBatchHttpError';
  }
}

export class OpenRouterBatchClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenRouterBatchClientOptions) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  async submitChatBatch(input: {
    model: string;
    requests: OpenRouterChatBatchRequest[];
  }): Promise<OpenRouterBatch> {
    if (input.requests.length === 0) {
      throw new Error('OpenRouter batch requests must not be empty');
    }

    // Property order is part of the provider contract: it stream-parses these
    // fields and rejects a body that serializes `requests` first.
    const payload = {
      endpoint: '/v1/chat/completions',
      model: input.model,
      requests: input.requests.map(request => ({
        custom_id: request.customId,
        body: request.body,
      })),
    };

    return this.request(OPENROUTER_BATCH_URL, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
  }

  async getBatch(batchId: string): Promise<OpenRouterBatch> {
    if (!/^batch_[A-Za-z0-9_-]+$/u.test(batchId)) {
      throw new Error('Invalid OpenRouter batch identifier');
    }

    return this.request(`${OPENROUTER_BATCH_URL}/${encodeURIComponent(batchId)}`, {
      method: 'GET',
      headers: this.headers(),
    });
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private async request(url: string, init: RequestInit): Promise<OpenRouterBatch> {
    const response = await this.fetchImpl(url, init);
    if (!response.ok) {
      const retryAfterValue = Number(response.headers.get('retry-after'));
      const retryAfterSeconds =
        Number.isFinite(retryAfterValue) && retryAfterValue >= 0 ? retryAfterValue : null;
      const detail = (await response.text()).slice(0, 1_000);
      throw new OpenRouterBatchHttpError(
        response.status,
        retryAfterSeconds,
        `OpenRouter Batch API returned ${response.status}${detail ? `: ${detail}` : ''}`
      );
    }

    return (await response.json()) as OpenRouterBatch;
  }
}

export type PositionedBatchResult =
  | {
      ok: true;
      content: string;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      costUsd: number | null;
      requestId: string;
    }
  | { ok: false; error: string };

/** Map provider results by custom_id; provider result order is not trusted. */
export function mapCompletedBatchResultsByPosition(
  batch: OpenRouterBatch,
  customIdsByPosition: readonly string[]
): PositionedBatchResult[] {
  const resultsById = new Map((batch.results ?? []).map(result => [result.custom_id, result]));

  type SuccessfulCandidate = Extract<PositionedBatchResult, { ok: true }> & {
    hasPromptTokens: boolean;
    hasCompletionTokens: boolean;
    hasTotalTokens: boolean;
    hasCost: boolean;
  };
  type Candidate = SuccessfulCandidate | Extract<PositionedBatchResult, { ok: false }>;

  const candidates: Candidate[] = customIdsByPosition.map(customId => {
    const result = resultsById.get(customId);
    if (!result) return { ok: false, error: `Missing batch result for ${customId}` };
    if (result.error) {
      const prefix = result.error.code === undefined ? '' : `${String(result.error.code)}: `;
      return { ok: false, error: `${prefix}${result.error.message}` };
    }

    const content = result.response?.body.choices?.[0]?.message?.content;
    if (result.response?.status_code !== 200 || typeof content !== 'string') {
      return {
        ok: false,
        error: `Invalid batch response for ${customId} (status ${result.response?.status_code ?? 'missing'})`,
      };
    }

    const usage = result.response.body.usage;
    const promptTokens = usage?.prompt_tokens ?? 0;
    const completionTokens = usage?.completion_tokens ?? 0;
    return {
      ok: true,
      content,
      promptTokens,
      completionTokens,
      totalTokens: usage?.total_tokens ?? promptTokens + completionTokens,
      costUsd: typeof usage?.cost === 'number' ? usage.cost : null,
      requestId: result.response.request_id,
      hasPromptTokens: typeof usage?.prompt_tokens === 'number',
      hasCompletionTokens: typeof usage?.completion_tokens === 'number',
      hasTotalTokens:
        typeof usage?.total_tokens === 'number' ||
        typeof usage?.prompt_tokens === 'number' ||
        typeof usage?.completion_tokens === 'number',
      hasCost: typeof usage?.cost === 'number',
    };
  });

  const successful = candidates.filter(
    (candidate): candidate is SuccessfulCandidate => candidate.ok
  );

  function allocateInteger(
    aggregate: number | undefined,
    field: 'promptTokens' | 'completionTokens' | 'totalTokens',
    flag: 'hasPromptTokens' | 'hasCompletionTokens' | 'hasTotalTokens'
  ): void {
    if (typeof aggregate !== 'number' || !Number.isFinite(aggregate)) return;
    const missing = successful.filter(candidate => !candidate[flag]);
    if (missing.length === 0) return;
    const known = successful.reduce(
      (sum, candidate) => sum + (candidate[flag] ? candidate[field] : 0),
      0
    );
    const remaining = Math.max(0, Math.round(aggregate - known));
    const share = Math.floor(remaining / missing.length);
    let remainder = remaining % missing.length;
    for (const candidate of missing) {
      candidate[field] = share + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
    }
  }

  allocateInteger(batch.usage?.prompt_tokens, 'promptTokens', 'hasPromptTokens');
  allocateInteger(batch.usage?.completion_tokens, 'completionTokens', 'hasCompletionTokens');
  allocateInteger(batch.usage?.total_tokens, 'totalTokens', 'hasTotalTokens');
  for (const candidate of successful) {
    if (!candidate.hasTotalTokens && batch.usage?.total_tokens === undefined) {
      candidate.totalTokens = candidate.promptTokens + candidate.completionTokens;
    }
  }

  const aggregateCost = batch.usage?.cost;
  if (typeof aggregateCost === 'number' && Number.isFinite(aggregateCost)) {
    const missingCost = successful.filter(candidate => !candidate.hasCost);
    if (missingCost.length > 0) {
      const knownCost = successful.reduce(
        (sum, candidate) => sum + (candidate.hasCost ? (candidate.costUsd ?? 0) : 0),
        0
      );
      const remainingCost = Math.max(0, aggregateCost - knownCost);
      const share = remainingCost / missingCost.length;
      missingCost.forEach((candidate, index) => {
        candidate.costUsd =
          index === missingCost.length - 1
            ? remainingCost - share * (missingCost.length - 1)
            : share;
      });
    }
  }

  return candidates.map(candidate => {
    if (!candidate.ok) return candidate;
    const {
      hasPromptTokens: _hasPromptTokens,
      hasCompletionTokens: _hasCompletionTokens,
      hasTotalTokens: _hasTotalTokens,
      hasCost: _hasCost,
      ...result
    } = candidate;
    return result;
  });
}
