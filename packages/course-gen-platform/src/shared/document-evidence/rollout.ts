export interface DocumentEvidenceRolloutEnvironment {
  DOCUMENT_EVIDENCE_ENABLED?: string;
  DOCUMENT_EVIDENCE_MODE?: string;
}

/** Return true only for the exact live document-evidence configuration. */
export function isDocumentEvidenceActive(
  environment: DocumentEvidenceRolloutEnvironment = {
    DOCUMENT_EVIDENCE_ENABLED: process.env.DOCUMENT_EVIDENCE_ENABLED,
    DOCUMENT_EVIDENCE_MODE: process.env.DOCUMENT_EVIDENCE_MODE,
  }
): boolean {
  return (
    environment.DOCUMENT_EVIDENCE_ENABLED === 'true' &&
    environment.DOCUMENT_EVIDENCE_MODE === 'active'
  );
}
