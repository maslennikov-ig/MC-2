import { DocumentEvidenceSourceManifestSchema } from '@megacampus/shared-types';

import { canonicalJson, sha256 } from './canonical-json';
import type { CourseFromRoleGuideRelation, GenerationOriginCommandV1, JsonValue, KnowledgeObjectKind } from './contract';
import { KnowledgeSyncPreparationError } from './errors';
import type { ExportSource, KnowledgeExportSnapshot } from './package-builder';

interface CompletedCourseRow {
  id: string; organization_id: string; generation_status: string | null; generation_completed_at: string | null;
  title: string; language: string | null; course_structure: unknown; course_description?: string | null; slug?: string | null;
}
interface LessonContentRow { lesson_id: string; status: string; content: unknown; metadata: unknown }
interface FileRow {
  id: string; organization_id: string; course_id: string | null; filename: string; mime_type: string; hash: string;
  storage_path: string; markdown_content?: string | null; parsed_content?: unknown; approved: boolean; approvedVersion?: string;
}
interface CompletedRoleGuideRow {
  id: string; organization_id: string; status: string; completed_at: string | null; position_title: string | null;
  language: string; final_markdown: string | null; role_profile_spec: unknown; generated_blocks: unknown;
}
interface RoleGuideSourceRow {
  id: string; playbook_id: string; organization_id: string; source_type: 'file' | 'text'; status: string;
  filename: string | null; text: string | null; file?: FileRow | null;
}

export interface GenerationOriginRow {
  binding_id: string;
  command_id: string;
  command_kind: 'CREATE_JOB_INSTRUCTION' | 'CREATE_COURSE_FROM_JOB_INSTRUCTION';
  proposal_id: string;
  approved_revision: number;
  proposal_payload_hash: string;
  object_kind: KnowledgeObjectKind;
  object_id: string;
  organization_id: string;
  status: string;
}

export interface CourseJobInstructionSourceRow {
  course_id: string;
  organization_id: string;
  job_instruction_id: string;
  source_version: string;
  source_content_hash: string;
  origin_binding_id: string;
  origin_command_id: string;
}

type ReadBytes = (file: Pick<FileRow, 'id' | 'storage_path'>) => Promise<Buffer>;

function jsonObject(value: unknown): Record<string, JsonValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, JsonValue> : {};
}

const SHA256 = /^[a-f0-9]{64}$/u;

function generationOrigin(
  row: GenerationOriginRow | null | undefined,
  expected: { kind: KnowledgeObjectKind; id: string; organizationId: string },
): GenerationOriginCommandV1 | undefined {
  if (row == null) return undefined;
  const expectedOperation = expected.kind === 'COURSE' ? 'CREATE_COURSE_FROM_JOB_INSTRUCTION' : 'CREATE_JOB_INSTRUCTION';
  const validNamespace = row.command_kind === 'CREATE_JOB_INSTRUCTION'
    ? /^megacampus_generation_command:create_job_instruction:v1:[a-f0-9]{64}$/u
    : /^megacampus_generation_command:create_course_from_job_instruction:v1:[a-f0-9]{64}$/u;
  if (
    row.status !== 'native_completed'
    || row.object_kind !== expected.kind
    || row.object_id !== expected.id
    || row.organization_id !== expected.organizationId
    || row.command_kind !== expectedOperation
    || !validNamespace.test(row.command_id)
    || row.proposal_id.trim().length === 0
    || row.proposal_id.length > 300
    || !Number.isSafeInteger(row.approved_revision)
    || row.approved_revision <= 0
    || !SHA256.test(row.proposal_payload_hash)
  ) {
    throw new KnowledgeSyncPreparationError('provenance', false);
  }
  return {
    schemaVersion: 'helixa.megacampus-generation-origin.v1',
    operation: row.command_kind,
    commandId: row.command_id,
    proposalId: row.proposal_id,
    approvedRevision: row.approved_revision,
    payloadHash: row.proposal_payload_hash,
  };
}

function courseFromRoleGuideRelation(
  row: CourseJobInstructionSourceRow | null | undefined,
  originRow: GenerationOriginRow | null | undefined,
  course: CompletedCourseRow,
): CourseFromRoleGuideRelation | undefined {
  if (row == null && originRow == null) return undefined;
  if (
    row == null
    || originRow == null
    || row.course_id !== course.id
    || row.organization_id !== course.organization_id
    || row.origin_binding_id !== originRow.binding_id
    || row.origin_command_id !== originRow.command_id
    || row.job_instruction_id.trim().length === 0
    || row.source_version.trim().length === 0
    || !SHA256.test(row.source_content_hash)
  ) {
    throw new KnowledgeSyncPreparationError('provenance', false);
  }
  const suffix = sha256(canonicalJson({
    courseId: row.course_id,
    roleGuideId: row.job_instruction_id,
    sourceVersion: row.source_version,
    contentHash: row.source_content_hash,
  }));
  return {
    relationKey: `megacampus_relation:course_from_role_guide:${suffix}`,
    type: 'COURSE_FROM_ROLE_GUIDE',
    fromKey: `COURSE:${row.course_id}`,
    toKey: `ROLE_GUIDE:${row.job_instruction_id}`,
    metadata: { sourceVersion: row.source_version, contentHash: row.source_content_hash },
  };
}

function fileSource(file: FileRow, kind: 'COURSE' | 'ROLE_GUIDE', objectId: string, sourceType: ExportSource['sourceType'], readBytes: ReadBytes, sourceRowId = file.id): ExportSource {
  return {
    id: sourceRowId, sourceType, organizationId: file.organization_id, objectKind: kind, objectId,
    approved: file.approved, version: file.approvedVersion ?? file.hash,
    ...(sourceRowId !== file.id ? { underlyingFileId: file.id } : {}),
    ...(file.hash.match(/^[a-f0-9]{64}$/) ? { sourceSha256: file.hash } : {}),
    fileName: file.filename, mediaType: file.mime_type,
    readOriginalBytes: () => readBytes(file),
    ...(file.parsed_content && jsonObject(file.parsed_content).schema_name === 'DoclingDocument'
      ? { acceptedDoclingJson: JSON.stringify(file.parsed_content) } : {}),
    ...(file.markdown_content?.trim() ? { trustedMarkdown: file.markdown_content } : {}),
  };
}

export function parseAcceptedCourseSourceManifest(manifestInput: unknown) {
  const parsed = DocumentEvidenceSourceManifestSchema.safeParse(manifestInput);
  if (!parsed.success) throw new KnowledgeSyncPreparationError('provenance', false);
  return parsed.data;
}

export function bindAcceptedCourseSources<T extends { id: string; hash: string }>(manifestInput: unknown, files: T[]): Array<T & { approved: true; approvedVersion: string }> {
  const manifest = parseAcceptedCourseSourceManifest(manifestInput);
  const byId = new Map(files.map(file => [file.id, file]));
  return manifest.map((source: { document_id: string; source_version_hash: string }) => {
    const file = byId.get(source.document_id);
    if (!file || file.hash !== source.source_version_hash) throw new KnowledgeSyncPreparationError('provenance', false);
    return { ...file, approved: true as const, approvedVersion: source.source_version_hash };
  });
}

// Mapping remains async-compatible because callers classify preparation failures through rejections.
// eslint-disable-next-line @typescript-eslint/require-await
export async function mapCompletedCourse(input: {
  course: CompletedCourseRow;
  lessonContents: LessonContentRow[];
  files: FileRow[];
  readBytes: ReadBytes;
  generationOrigin?: GenerationOriginRow | null;
  jobInstructionSource?: CourseJobInstructionSourceRow | null;
}): Promise<KnowledgeExportSnapshot> {
  const { course } = input;
  if (course.generation_status !== 'completed' || !course.generation_completed_at) throw new KnowledgeSyncPreparationError('event_identity', false);
  if (input.files.some(file => file.organization_id !== course.organization_id || file.course_id !== course.id || !file.approved || file.approvedVersion !== file.hash)) throw new KnowledgeSyncPreparationError('provenance', false);
  const originCommand = generationOrigin(input.generationOrigin, { kind: 'COURSE', id: course.id, organizationId: course.organization_id });
  const relation = courseFromRoleGuideRelation(input.jobInstructionSource, input.generationOrigin, course);
  return {
    kind: 'COURSE', id: course.id, organizationId: course.organization_id, completedAt: course.generation_completed_at,
    title: course.title, language: course.language ?? 'ru',
    ...(course.slug ? { url: `https://ai.megacampus.ru/courses/${course.slug}` } : {}),
    summaryMarkdown: course.course_description?.trim() || `# ${course.title}`,
    structure: jsonObject(course.course_structure), blocks: [],
    lessons: input.lessonContents.filter(row => row.status === 'completed' || row.status === 'approved').map(row => ({ lesson_id: row.lesson_id, content: row.content as JsonValue, metadata: row.metadata as JsonValue })),
    sources: input.files.map(file => fileSource(file, 'COURSE', course.id, 'file_catalog', input.readBytes)),
    ...(originCommand ? { originCommand } : {}),
    ...(relation ? { relations: [relation] } : {}),
  };
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function mapCompletedRoleGuide(input: { playbook: CompletedRoleGuideRow; sources: RoleGuideSourceRow[]; readBytes: ReadBytes; generationOrigin?: GenerationOriginRow | null }): Promise<KnowledgeExportSnapshot> {
  const { playbook } = input;
  if (playbook.status !== 'completed' || !playbook.completed_at || !playbook.final_markdown?.trim()) throw new KnowledgeSyncPreparationError('event_identity', false);
  const originCommand = generationOrigin(input.generationOrigin, { kind: 'ROLE_GUIDE', id: playbook.id, organizationId: playbook.organization_id });
  const sources: ExportSource[] = [];
  for (const source of input.sources) {
    if (source.status !== 'ready' || source.organization_id !== playbook.organization_id || source.playbook_id !== playbook.id) throw new KnowledgeSyncPreparationError('provenance', false);
    if (source.source_type === 'file') {
      if (!source.file || source.file.organization_id !== playbook.organization_id || source.file.course_id !== null) throw new KnowledgeSyncPreparationError('provenance', false);
      sources.push(fileSource({ ...source.file, approved: true }, 'ROLE_GUIDE', playbook.id, 'career_playbook_source', input.readBytes, source.id));
    } else if (source.text?.trim()) {
      const bytes = Buffer.from(source.text, 'utf8');
      sources.push({ id: source.id, sourceType: 'career_playbook_source', organizationId: source.organization_id, objectKind: 'ROLE_GUIDE', objectId: playbook.id, approved: true, version: sha256(bytes), sourceSha256: sha256(bytes), fileName: source.filename ?? `source-${source.id}.txt`, mediaType: 'text/plain', readOriginalBytes: () => Promise.resolve(bytes), trustedMarkdown: source.text });
    }
  }
  const generatedBlocks = jsonObject(playbook.generated_blocks);
  return {
    kind: 'ROLE_GUIDE', id: playbook.id, organizationId: playbook.organization_id, completedAt: playbook.completed_at,
    title: playbook.position_title?.trim() || 'Role Guide', language: playbook.language,
    summaryMarkdown: playbook.final_markdown,
    structure: { roleProfileSpec: jsonObject(playbook.role_profile_spec) },
    blocks: Object.entries(generatedBlocks).map(([key, value]) => ({ key, value })), lessons: [], sources,
    ...(originCommand ? { originCommand } : {}),
  };
}
