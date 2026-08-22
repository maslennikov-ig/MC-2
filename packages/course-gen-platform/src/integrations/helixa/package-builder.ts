import { canonicalJson, computePayloadHash, sha256 } from './canonical-json';
import { KNOWLEDGE_SYNC_SCHEMA_VERSION, type JsonValue, type KnowledgeObjectKind, type KnowledgeSyncPackage, type ProcessingRoute, type SourceDocument } from './contract';

export interface ExportSource {
  id: string;
  sourceType: 'file_catalog' | 'career_playbook_source';
  organizationId: string;
  objectKind: KnowledgeObjectKind;
  objectId: string;
  approved: boolean;
  version: string;
  sourceSha256?: string;
  fileName: string;
  mediaType: string;
  readOriginalBytes(): Promise<Buffer>;
  acceptedDoclingJson?: string;
  trustedMarkdown?: string;
}

export interface KnowledgeExportSnapshot {
  kind: KnowledgeObjectKind;
  id: string;
  organizationId: string;
  completedAt: string;
  title: string;
  language: string;
  url?: string;
  summaryMarkdown: string;
  structure: Record<string, JsonValue>;
  blocks: Record<string, JsonValue>[];
  lessons: Record<string, JsonValue>[];
  sources?: ExportSource[];
}

export interface PackageBuildOptions { environment: string; externalProjectId: string | null }

const docling = new Set(['application/pdf', 'text/html', 'application/xhtml+xml', 'application/epub+zip', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.presentation', 'application/vnd.oasis.opendocument.spreadsheet', 'image/png', 'image/jpeg', 'image/tiff']);
const localText = new Set(['text/plain', 'text/markdown', 'application/json', 'text/csv']);
const rss = new Set(['application/rss+xml', 'application/atom+xml']);

export function routeMediaType(mediaType: string): ProcessingRoute {
  const normalized = mediaType.toLowerCase().split(';', 1)[0]!.trim();
  if (docling.has(normalized)) return 'docling';
  if (localText.has(normalized)) return 'local_text';
  if (rss.has(normalized)) return 'content_rss';
  if (normalized.startsWith('audio/') || normalized.startsWith('video/')) return 'meetings_media';
  return 'unsupported';
}

function artifact(bytes: Buffer, key: string, fileName: string, mediaType: string): SourceDocument['artifacts'][number] {
  return { artifactKey: key, mediaType, fileName, sha256: sha256(bytes), byteLength: bytes.byteLength, representation: 'original_bytes', contentEncoding: 'base64', content: bytes.toString('base64') };
}

function textArtifact(content: string, key: string, fileName: string, representation: 'accepted_docling_json' | 'trusted_normalized_markdown') {
  const bytes = Buffer.from(content, 'utf8');
  return { artifactKey: key, mediaType: representation === 'accepted_docling_json' ? 'application/json' : 'text/markdown', fileName, sha256: sha256(bytes), byteLength: bytes.byteLength, representation, contentEncoding: 'utf8' as const, content };
}

function stableKey(prefix: string, ...parts: string[]): string { return `${prefix}:${sha256(parts.join('\u0000'))}`; }

function assertSourceProvenance(snapshot: KnowledgeExportSnapshot, source: ExportSource): void {
  if (!source.approved || source.organizationId !== snapshot.organizationId || source.objectKind !== snapshot.kind || source.objectId !== snapshot.id) {
    throw new Error(`Source provenance is not approved for ${snapshot.kind}:${snapshot.id}`);
  }
}

export function knowledgeEventId(input: Pick<KnowledgeExportSnapshot, 'kind' | 'organizationId' | 'id' | 'completedAt'>): string {
  return `mc2:${input.kind}:${input.organizationId}:${input.id}:${new Date(input.completedAt).toISOString()}`;
}

export async function buildKnowledgeSyncPackage(snapshot: KnowledgeExportSnapshot, options: PackageBuildOptions): Promise<KnowledgeSyncPackage> {
  if (!snapshot.summaryMarkdown.trim()) throw new Error('Completed object requires non-empty summary Markdown');
  const content = { summaryMarkdown: snapshot.summaryMarkdown, structure: snapshot.structure, blocks: snapshot.blocks, lessons: snapshot.lessons };
  const sourceDocuments: SourceDocument[] = [];
  const evidenceSegments: KnowledgeSyncPackage['evidenceSegments'] = [];

  for (const source of snapshot.sources ?? []) {
    assertSourceProvenance(snapshot, source);
    const bytes = await source.readOriginalBytes();
    if (bytes.byteLength === 0) throw new Error(`Approved source ${source.id} is empty`);
    if (source.sourceSha256 && sha256(bytes) !== source.sourceSha256) throw new Error(`Approved source ${source.id} hash does not match stored provenance`);
    const documentKey = stableKey('document', source.sourceType, source.id, source.version);
    const originalKey = stableKey('artifact', documentKey, 'original', sha256(bytes));
    const artifacts: SourceDocument['artifacts'] = [artifact(bytes, originalKey, source.fileName, source.mediaType)];
    let evidenceArtifactKey: string | undefined;
    let evidenceText: string | undefined;
    const route = routeMediaType(source.mediaType);
    if (source.acceptedDoclingJson !== undefined && route === 'docling') {
      JSON.parse(source.acceptedDoclingJson);
      evidenceArtifactKey = stableKey('artifact', documentKey, 'docling', sha256(source.acceptedDoclingJson));
      artifacts.push(textArtifact(source.acceptedDoclingJson, evidenceArtifactKey, `${source.fileName}.docling.json`, 'accepted_docling_json'));
    }
    if (source.trustedMarkdown !== undefined && (route === 'docling' || route === 'local_text')) {
      evidenceArtifactKey = stableKey('artifact', documentKey, 'markdown', sha256(source.trustedMarkdown));
      evidenceText = source.trustedMarkdown;
      artifacts.push(textArtifact(source.trustedMarkdown, evidenceArtifactKey, `${source.fileName}.md`, 'trusted_normalized_markdown'));
    }
    sourceDocuments.push({ documentKey, authority: 'primary_source', provenance: { system: 'megacampus', sourceType: source.sourceType, sourceId: source.id, sourceVersion: source.version }, route: { family: route }, artifacts });
    if (evidenceArtifactKey && evidenceText?.trim()) evidenceSegments.push({ segmentKey: stableKey('evidence', documentKey, evidenceArtifactKey), documentKey, artifactKey: evidenceArtifactKey, authority: 'primary_source', text: evidenceText, locator: { kind: 'whole_artifact' } });
  }

  const routeCounts = Object.fromEntries((['docling', 'local_text', 'content_rss', 'meetings_media', 'unsupported'] as const).map(route => [route, sourceDocuments.filter(document => document.route.family === route).length]));
  const eventType = snapshot.kind === 'COURSE' ? 'COURSE_COMPLETED' : 'ROLE_GUIDE_COMPLETED';
  const base = {
    schemaVersion: KNOWLEDGE_SYNC_SCHEMA_VERSION,
    eventId: knowledgeEventId(snapshot), eventType, sentAt: new Date(snapshot.completedAt).toISOString(),
    producer: { system: 'megacampus' as const, environment: options.environment, organizationId: snapshot.organizationId },
    object: { kind: snapshot.kind, id: snapshot.id, version: new Date(snapshot.completedAt).toISOString(), title: snapshot.title, language: snapshot.language, status: 'completed' as const, ...(snapshot.url ? { url: snapshot.url } : {}) },
    scope: { externalOrganizationId: snapshot.organizationId, externalProjectId: options.externalProjectId, destinationPolicy: 'DEFAULT_ORG_KNOWLEDGE_PROJECT' as const },
    content, sourceDocuments, evidenceSegments, candidateClaims: [], relations: [],
    hashes: { payloadHash: '', contentHash: sha256(canonicalJson(content)) }, metadata: { routeCounts },
  } satisfies KnowledgeSyncPackage;
  base.hashes.payloadHash = computePayloadHash(base);
  return base;
}

export function serializeKnowledgeSyncPackage(value: KnowledgeSyncPackage): Buffer {
  if (computePayloadHash(value) !== value.hashes.payloadHash) throw new Error('Package payload hash mismatch');
  return Buffer.from(canonicalJson(value), 'utf8');
}
