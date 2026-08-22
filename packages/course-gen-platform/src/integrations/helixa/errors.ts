export type KnowledgeSyncPreparationCode =
  | 'contract'
  | 'event_identity'
  | 'provenance'
  | 'payload_size'
  | 'storage';

export class KnowledgeSyncPreparationError extends Error {
  constructor(
    public readonly code: KnowledgeSyncPreparationCode,
    public readonly retryable: boolean
  ) {
    super(`Knowledge sync preparation failed: ${code}`);
    this.name = 'KnowledgeSyncPreparationError';
  }
}
