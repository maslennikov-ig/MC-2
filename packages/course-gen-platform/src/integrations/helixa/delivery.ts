import { createHmac } from 'node:crypto';

export interface ClaimedDelivery { id: string; eventId: string; rawBody: Buffer }
export type DeliveryFailure = { kind: 'network'; message: string } | { kind: 'http'; status: number; message: string };
export interface DeliveryRequest { url: string; method: 'POST'; headers: Record<string, string>; body: Buffer }
export interface DeliveryResponse { status: number; body: string }
export interface DeliveryConfig { endpoint: string; hmacKey: string; externalSystemId: string; request(input: DeliveryRequest): Promise<DeliveryResponse> }

export function classifyDeliveryFailure(failure: DeliveryFailure): 'retryable' | 'terminal' {
  if (failure.kind === 'network') return 'retryable';
  return failure.status === 408 || failure.status === 429 || failure.status >= 500 ? 'retryable' : 'terminal';
}

export async function deliverClaimedKnowledgeSync(delivery: ClaimedDelivery, config: DeliveryConfig): Promise<DeliveryResponse> {
  if (!config.endpoint || !config.hmacKey || !config.externalSystemId) throw new Error('Helixa delivery configuration is incomplete');
  const signature = createHmac('sha256', config.hmacKey).update(delivery.rawBody).digest('hex');
  const response = await config.request({ url: config.endpoint, method: 'POST', body: delivery.rawBody, headers: {
    'Content-Type': 'application/json',
    'X-Helixa-External-System-Id': config.externalSystemId,
    'X-Megacampus-Event-Id': delivery.eventId,
    'X-Megacampus-Signature': `sha256=${signature}`,
  } });
  if (response.status < 200 || response.status >= 300) throw { kind: 'http', status: response.status, message: `Helixa refused delivery with HTTP ${response.status}` } satisfies DeliveryFailure;
  return response;
}

export function createFetchRequest(fetchImpl: typeof fetch = fetch): DeliveryConfig['request'] {
  return async input => {
    try {
      const response = await fetchImpl(input.url, { method: input.method, headers: input.headers, body: input.body });
      return { status: response.status, body: await response.text() };
    } catch (error) {
      throw { kind: 'network', message: error instanceof Error ? error.message : 'Network delivery failed' } satisfies DeliveryFailure;
    }
  };
}
