export const KNOWLEDGE_SYNC_SCHEMA_VERSION = '2026-06-16.megacampus-knowledge-sync.v1' as const;

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type KnowledgeObjectKind = 'COURSE' | 'ROLE_GUIDE';
export type KnowledgeEventType = 'COURSE_COMPLETED' | 'COURSE_UPDATED' | 'ROLE_GUIDE_COMPLETED' | 'ROLE_GUIDE_UPDATED';
export type ProcessingRoute = 'docling' | 'local_text' | 'content_rss' | 'meetings_media' | 'unsupported';
export type EvidenceAuthority = 'primary_source' | 'derived_training' | 'derived_role_guide';

export interface EmbeddedArtifact {
  artifactKey: string;
  mediaType: string;
  fileName: string;
  sha256: string;
  byteLength: number;
  representation: 'original_bytes' | 'accepted_docling_json' | 'trusted_normalized_markdown';
  contentEncoding: 'base64' | 'utf8';
  content: string;
}

export interface SourceDocument {
  documentKey: string;
  authority: EvidenceAuthority;
  provenance: {
    system: 'megacampus';
    sourceType: 'file_catalog' | 'career_playbook_source' | 'generated_object';
    sourceId: string;
    sourceVersion: string;
    metadata?: Record<string, JsonValue>;
  };
  route: { family: ProcessingRoute; metadata?: Record<string, JsonValue> };
  artifacts: EmbeddedArtifact[];
  metadata?: Record<string, JsonValue>;
}

export interface KnowledgeSyncPackage {
  schemaVersion: typeof KNOWLEDGE_SYNC_SCHEMA_VERSION;
  eventId: string;
  eventType: KnowledgeEventType;
  sentAt: string;
  producer: { system: 'megacampus'; environment: string; organizationId: string };
  object: { kind: KnowledgeObjectKind; id: string; version: string; title: string; language: string; status: 'completed'; url?: string };
  scope: { externalOrganizationId: string; externalProjectId: string | null; destinationPolicy: 'DEFAULT_ORG_KNOWLEDGE_PROJECT' };
  content: { summaryMarkdown: string; structure: Record<string, JsonValue>; blocks: Record<string, JsonValue>[]; lessons: Record<string, JsonValue>[] };
  sourceDocuments: SourceDocument[];
  evidenceSegments: Array<{ segmentKey: string; documentKey: string; artifactKey: string; authority: EvidenceAuthority; text: string; locator: { kind: 'whole_artifact' | 'json_pointer'; pointer?: string } }>;
  candidateClaims: Array<{ claimKey: string; text: string; evidenceRefs: string[]; metadata?: Record<string, JsonValue> }>;
  relations: Array<{ relationKey: string; type: string; fromKey: string; toKey: string; metadata?: Record<string, JsonValue> }>;
  hashes: { payloadHash: string; contentHash: string };
  metadata?: Record<string, JsonValue>;
}

