export type KnowledgeSyncPreparationCode =
  | 'contract'
  | 'event_identity'
  | 'provenance'
  | 'payload_size'
  | 'storage';

/**
 * Delivery failures were thrown as bare object literals, which `@typescript-eslint`
 * refuses and which arrive at the outbox with no stack and no cause. `outbox.ts` reads
 * `kind` and `status` structurally, so keeping them public preserves that path exactly.
 */
export class KnowledgeSyncDeliveryError extends Error {
  readonly status?: number;

  constructor(
    public readonly kind: 'network' | 'http',
    message: string,
    status?: number,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = 'KnowledgeSyncDeliveryError';
    this.status = status;
  }
}

export class KnowledgeSyncPreparationError extends Error {
  constructor(
    public readonly code: KnowledgeSyncPreparationCode,
    public readonly retryable: boolean
  ) {
    super(`Knowledge sync preparation failed: ${code}`);
    this.name = 'KnowledgeSyncPreparationError';
  }
}
