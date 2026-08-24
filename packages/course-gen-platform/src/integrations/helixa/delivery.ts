import { createHmac } from 'node:crypto';

import { KnowledgeSyncDeliveryError } from './errors';

export interface ClaimedDelivery {
  id: string;
  eventId: string;
  rawBody: Buffer;
}
export type DeliveryFailure =
  | { kind: 'network'; message: string }
  | { kind: 'http'; status: number; message: string };
export interface DeliveryRequest {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: Buffer;
}
export interface DeliveryResponse {
  status: number;
  body: string;
}
export interface DeliveryConfig {
  endpoint: string;
  hmacKey: string;
  externalSystemId: string;
  request(input: DeliveryRequest): Promise<DeliveryResponse>;
}

export function classifyDeliveryFailure(failure: DeliveryFailure): 'retryable' | 'terminal' {
  if (failure.kind === 'network') return 'retryable';
  return failure.status === 408 || failure.status === 429 || failure.status >= 500
    ? 'retryable'
    : 'terminal';
}

export async function deliverClaimedKnowledgeSync(
  delivery: ClaimedDelivery,
  config: DeliveryConfig
): Promise<DeliveryResponse> {
  if (!config.endpoint || !config.hmacKey || !config.externalSystemId)
    throw new Error('Helixa delivery configuration is incomplete');
  const signature = createHmac('sha256', config.hmacKey).update(delivery.rawBody).digest('hex');
  const response = await config.request({
    url: config.endpoint,
    method: 'POST',
    body: delivery.rawBody,
    headers: {
      'Content-Type': 'application/json',
      'X-Helixa-External-System-Id': config.externalSystemId,
      'X-Megacampus-Event-Id': delivery.eventId,
      'X-Megacampus-Signature': `sha256=${signature}`,
    },
  });
  if (response.status < 200 || response.status >= 300)
    throw new KnowledgeSyncDeliveryError(
      'http',
      `Helixa refused delivery with HTTP ${response.status}`,
      response.status
    );
  return response;
}

export function createFetchRequest(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 120_000
): DeliveryConfig['request'] {
  return async input => {
    try {
      // `BodyInit` accepts a `BufferSource`, which is an ArrayBufferView over an `ArrayBuffer`
      // — a Node `Buffer` is typed over `ArrayBufferLike`, so neither it nor a view built from
      // `.buffer` is assignable without a cast. Copying from the array-like overload yields
      // `Uint8Array<ArrayBuffer>` honestly. These are the bytes the HMAC above signed, so the
      // copy must stay a copy of `input.body` and nothing re-serialized.
      const body = new Uint8Array(input.body);
      const response = await fetchImpl(input.url, {
        method: input.method,
        headers: input.headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      return { status: response.status, body: await response.text() };
    } catch (error) {
      // Keep the original as `cause`: the outbox stores only a safe summary, so without it
      // the reason the call failed exists nowhere by the time anyone reads the row.
      if (error instanceof KnowledgeSyncDeliveryError) throw error;
      throw new KnowledgeSyncDeliveryError(
        'network',
        error instanceof Error ? error.message : 'Network delivery failed',
        undefined,
        { cause: error }
      );
    }
  };
}
