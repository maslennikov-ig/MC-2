import { canonicalJson, computePayloadHash, sha256 } from './canonical-json';
import { canonicalGenerationJsonV1 } from './generation-canonical-json';
import { KNOWLEDGE_SYNC_SCHEMA_VERSION, type GenerationOriginCommandV1, type JsonValue, type KnowledgeObjectKind, type KnowledgeRelation, type KnowledgeSyncPackage, type ProcessingRoute, type SourceDocument } from './contract';
import { KnowledgeSyncPreparationError } from './errors';

export interface ExportSource {
  id: string;
  sourceType: 'file_catalog' | 'career_playbook_source';
  organizationId: string;
  objectKind: KnowledgeObjectKind;
  objectId: string;
  approved: boolean;
  version: string;
  sourceSha256?: string;
  underlyingFileId?: string;
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
  relations?: KnowledgeRelation[];
  originCommand?: GenerationOriginCommandV1;
}

export interface PackageBuildOptions { environment: string; externalProjectId: string | null }

const MAX_EMBEDDED_ARTIFACT_BYTES = 64 * 1024 * 1024;
const MAX_RAW_PACKAGE_BYTES = 256 * 1024 * 1024;
const docling = new Set([
  'application/pdf', 'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.presentation', 'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.text', 'application/epub+zip', 'application/xhtml+xml', 'text/html',
  'image/bmp', 'image/jpeg', 'image/png', 'image/tiff', 'image/webp',
]);

function mediaTypeEssence(value: string): string | null {
  const parts = value.split(';');
  const essence = parts.shift()?.trim().toLowerCase() ?? '';
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(essence)) return null;
  for (const rawParameter of parts) {
    const parameter = rawParameter.trim();
    const separator = parameter.indexOf('=');
    if (separator <= 0 || separator === parameter.length - 1) return null;
  }
  return essence;
}

export function routeMediaType(mediaType: string): ProcessingRoute {
  if (typeof mediaType !== 'string') return 'unsupported';
  const essence = mediaTypeEssence(mediaType);
  if (essence == null) return 'unsupported';
  if (essence === 'application/rss+xml' || essence === 'application/atom+xml') return 'content_rss';
  if (essence.startsWith('audio/') || essence.startsWith('video/')) return 'meetings_media';
  if (docling.has(essence)) return 'docling';
  if (essence === 'text/plain' || essence === 'text/markdown' || essence === 'application/json' || essence.endsWith('+json')) return 'local_text';
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
    throw new KnowledgeSyncPreparationError('provenance', false);
  }
}

export function knowledgeEventId(input: Pick<KnowledgeExportSnapshot, 'kind' | 'organizationId' | 'id' | 'completedAt'>): string {
  return `mc2:${input.kind}:${input.organizationId}:${input.id}:${new Date(input.completedAt).toISOString()}`;
}

export async function buildKnowledgeSyncPackage(snapshot: KnowledgeExportSnapshot, options: PackageBuildOptions): Promise<KnowledgeSyncPackage> {
  if (!snapshot.summaryMarkdown.trim()) throw new KnowledgeSyncPreparationError('contract', false);
  if ((snapshot.sources?.length ?? 0) > 255) throw new KnowledgeSyncPreparationError('payload_size', false);
  const content = { summaryMarkdown: snapshot.summaryMarkdown, structure: snapshot.structure, blocks: snapshot.blocks, lessons: snapshot.lessons };
  const generatedAuthority = snapshot.kind === 'COURSE' ? 'derived_training' : 'derived_role_guide';
  let generatedText: string;
  try {
    generatedText = snapshot.kind === 'COURSE'
      ? [snapshot.summaryMarkdown, ...snapshot.lessons.map(lesson => typeof lesson.markdown === 'string' ? lesson.markdown : canonicalJson(lesson))].join('\n\n')
      : [snapshot.summaryMarkdown, ...snapshot.blocks.map(block => typeof block.markdown === 'string' ? block.markdown : canonicalJson(block))].join('\n\n');
  } catch {
    throw new KnowledgeSyncPreparationError('contract', false);
  }
  const generatedBytes = Buffer.from(generatedText, 'utf8');
  if (generatedBytes.byteLength > MAX_EMBEDDED_ARTIFACT_BYTES) throw new KnowledgeSyncPreparationError('payload_size', false);
  const generatedDocumentKey = stableKey('document', snapshot.organizationId, snapshot.kind, snapshot.id, 'generated', snapshot.completedAt);
  const generatedArtifactKey = stableKey('artifact', snapshot.organizationId, snapshot.kind, snapshot.id, generatedDocumentKey, sha256(generatedBytes));
  const sourceDocuments: SourceDocument[] = [{
    documentKey: generatedDocumentKey,
    authority: generatedAuthority,
    provenance: { system: 'megacampus', sourceType: 'generated_object', sourceId: snapshot.id, sourceVersion: snapshot.completedAt },
    route: { family: 'local_text' },
    artifacts: [artifact(generatedBytes, generatedArtifactKey, `${snapshot.kind.toLowerCase()}-${snapshot.id}.md`, 'text/markdown')],
  }];
  const evidenceSegments: KnowledgeSyncPackage['evidenceSegments'] = [{
    segmentKey: stableKey('evidence', snapshot.organizationId, snapshot.kind, snapshot.id, generatedDocumentKey),
    documentKey: generatedDocumentKey, artifactKey: generatedArtifactKey, authority: generatedAuthority,
    text: generatedText, locator: { kind: 'whole_artifact' },
  }];

  for (const source of snapshot.sources ?? []) {
    assertSourceProvenance(snapshot, source);
    let bytes: Buffer;
    try {
      bytes = await source.readOriginalBytes();
    } catch (error) {
      if (error instanceof KnowledgeSyncPreparationError) throw error;
      throw new KnowledgeSyncPreparationError('storage', true);
    }
    if (bytes.byteLength === 0) throw new KnowledgeSyncPreparationError('contract', false);
    if (bytes.byteLength > MAX_EMBEDDED_ARTIFACT_BYTES) throw new KnowledgeSyncPreparationError('payload_size', false);
    if (source.sourceSha256 && sha256(bytes) !== source.sourceSha256) throw new KnowledgeSyncPreparationError('provenance', false);
    const documentKey = stableKey('document', snapshot.organizationId, snapshot.kind, snapshot.id, source.sourceType, source.id, source.version);
    const originalKey = stableKey('artifact', snapshot.organizationId, snapshot.kind, snapshot.id, documentKey, 'original', sha256(bytes));
    const artifacts: SourceDocument['artifacts'] = [artifact(bytes, originalKey, source.fileName, source.mediaType)];
    let evidenceArtifactKey: string | undefined;
    let evidenceText: string | undefined;
    const route = routeMediaType(source.mediaType);
    if (source.acceptedDoclingJson !== undefined && route === 'docling') {
      let parsed: { schema_name?: unknown };
      try {
        parsed = JSON.parse(source.acceptedDoclingJson) as { schema_name?: unknown };
      } catch {
        throw new KnowledgeSyncPreparationError('contract', false);
      }
      if (parsed?.schema_name !== 'DoclingDocument') throw new KnowledgeSyncPreparationError('contract', false);
      evidenceArtifactKey = stableKey('artifact', documentKey, 'docling', sha256(source.acceptedDoclingJson));
      artifacts.push(textArtifact(source.acceptedDoclingJson, evidenceArtifactKey, `${source.fileName}.docling.json`, 'accepted_docling_json'));
    }
    if (source.trustedMarkdown !== undefined && (route === 'docling' || route === 'local_text')) {
      evidenceArtifactKey = stableKey('artifact', documentKey, 'markdown', sha256(source.trustedMarkdown));
      evidenceText = source.trustedMarkdown;
      artifacts.push(textArtifact(source.trustedMarkdown, evidenceArtifactKey, `${source.fileName}.md`, 'trusted_normalized_markdown'));
    }
    sourceDocuments.push({ documentKey, authority: 'primary_source', provenance: { system: 'megacampus', sourceType: source.sourceType, sourceId: source.id, sourceVersion: source.version, ...(source.underlyingFileId ? { metadata: { underlyingFileId: source.underlyingFileId } } : {}) }, route: { family: route }, artifacts });
    if (evidenceArtifactKey && evidenceText?.trim()) evidenceSegments.push({ segmentKey: stableKey('evidence', documentKey, evidenceArtifactKey), documentKey, artifactKey: evidenceArtifactKey, authority: 'primary_source', text: evidenceText, locator: { kind: 'whole_artifact' } });
  }

  const routeCounts = Object.fromEntries((['docling', 'local_text', 'content_rss', 'meetings_media', 'unsupported'] as const).map(route => [route, sourceDocuments.filter(document => document.route.family === route).length]));
  const eventType = snapshot.kind === 'COURSE' ? 'COURSE_COMPLETED' : 'ROLE_GUIDE_COMPLETED';
  let contentHash: string;
  try {
    contentHash = sha256(snapshot.originCommand ? canonicalGenerationJsonV1(content) : canonicalJson(content));
  } catch {
    throw new KnowledgeSyncPreparationError('contract', false);
  }
  const base = {
    schemaVersion: KNOWLEDGE_SYNC_SCHEMA_VERSION,
    eventId: knowledgeEventId(snapshot), eventType, sentAt: new Date(snapshot.completedAt).toISOString(),
    producer: { system: 'megacampus' as const, environment: options.environment, organizationId: snapshot.organizationId },
    object: { kind: snapshot.kind, id: snapshot.id, version: new Date(snapshot.completedAt).toISOString(), title: snapshot.title, language: snapshot.language, status: 'completed' as const, ...(snapshot.url ? { url: snapshot.url } : {}) },
    scope: { externalOrganizationId: snapshot.organizationId, externalProjectId: options.externalProjectId, destinationPolicy: 'DEFAULT_ORG_KNOWLEDGE_PROJECT' as const },
    content, sourceDocuments, evidenceSegments, candidateClaims: [], relations: snapshot.relations ?? [],
    hashes: { payloadHash: '', contentHash }, metadata: { routeCounts },
    ...(snapshot.originCommand ? { originCommand: snapshot.originCommand } : {}),
  } satisfies KnowledgeSyncPackage;
  base.hashes.payloadHash = computePayloadHash(base);
  return base;
}

export function serializeKnowledgeSyncPackage(value: KnowledgeSyncPackage): Buffer {
  if (computePayloadHash(value) !== value.hashes.payloadHash) throw new KnowledgeSyncPreparationError('contract', false);
  const raw = Buffer.from(canonicalJson(value), 'utf8');
  if (raw.byteLength > MAX_RAW_PACKAGE_BYTES) throw new KnowledgeSyncPreparationError('payload_size', false);
  return raw;
}
