import type { JsonValue } from './contract';
import type { ExportSource, KnowledgeExportSnapshot } from './package-builder';
import { sha256 } from './canonical-json';

interface CompletedCourseRow {
  id: string; organization_id: string; generation_status: string | null; generation_completed_at: string | null;
  title: string; language: string | null; course_structure: unknown; course_description?: string | null; slug?: string | null;
}
interface LessonContentRow { lesson_id: string; status: string; content: unknown; metadata: unknown }
interface FileRow {
  id: string; organization_id: string; course_id: string | null; filename: string; mime_type: string; hash: string;
  storage_path: string; markdown_content?: string | null; parsed_content?: unknown; approved: boolean;
}
interface CompletedRoleGuideRow {
  id: string; organization_id: string; status: string; completed_at: string | null; position_title: string | null;
  language: string; final_markdown: string | null; role_profile_spec: unknown; generated_blocks: unknown;
}
interface RoleGuideSourceRow {
  id: string; playbook_id: string; organization_id: string; source_type: 'file' | 'text'; status: string;
  filename: string | null; text: string | null; file?: FileRow | null;
}

type ReadBytes = (file: Pick<FileRow, 'id' | 'storage_path'>) => Promise<Buffer>;

function jsonObject(value: unknown): Record<string, JsonValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, JsonValue> : {};
}

function fileSource(file: FileRow, kind: 'COURSE' | 'ROLE_GUIDE', objectId: string, sourceType: ExportSource['sourceType'], readBytes: ReadBytes): ExportSource {
  return {
    id: file.id, sourceType, organizationId: file.organization_id, objectKind: kind, objectId,
    approved: file.approved, version: file.hash,
    ...(file.hash.match(/^[a-f0-9]{64}$/) ? { sourceSha256: file.hash } : {}),
    fileName: file.filename, mediaType: file.mime_type,
    readOriginalBytes: () => readBytes(file),
    ...(file.parsed_content && jsonObject(file.parsed_content).schema_name === 'DoclingDocument'
      ? { acceptedDoclingJson: JSON.stringify(file.parsed_content) } : {}),
    ...(file.markdown_content?.trim() ? { trustedMarkdown: file.markdown_content } : {}),
  };
}

export async function mapCompletedCourse(input: { course: CompletedCourseRow; lessonContents: LessonContentRow[]; files: FileRow[]; readBytes: ReadBytes }): Promise<KnowledgeExportSnapshot> {
  const { course } = input;
  if (course.generation_status !== 'completed' || !course.generation_completed_at) throw new Error('Course is not completed');
  if (input.files.some(file => file.organization_id !== course.organization_id || file.course_id !== course.id || !file.approved)) throw new Error('Course source provenance is not approved');
  return {
    kind: 'COURSE', id: course.id, organizationId: course.organization_id, completedAt: course.generation_completed_at,
    title: course.title, language: course.language ?? 'ru',
    ...(course.slug ? { url: `https://ai.megacampus.ru/courses/${course.slug}` } : {}),
    summaryMarkdown: course.course_description?.trim() || `# ${course.title}`,
    structure: jsonObject(course.course_structure), blocks: [],
    lessons: input.lessonContents.filter(row => row.status === 'completed' || row.status === 'approved').map(row => ({ lesson_id: row.lesson_id, content: row.content as JsonValue, metadata: row.metadata as JsonValue })),
    sources: input.files.map(file => fileSource(file, 'COURSE', course.id, 'file_catalog', input.readBytes)),
  };
}

export async function mapCompletedRoleGuide(input: { playbook: CompletedRoleGuideRow; sources: RoleGuideSourceRow[]; readBytes: ReadBytes }): Promise<KnowledgeExportSnapshot> {
  const { playbook } = input;
  if (playbook.status !== 'completed' || !playbook.completed_at || !playbook.final_markdown?.trim()) throw new Error('Role Guide is not completed');
  const sources: ExportSource[] = [];
  for (const source of input.sources) {
    if (source.status !== 'ready' || source.organization_id !== playbook.organization_id || source.playbook_id !== playbook.id) throw new Error('Role Guide source provenance is not approved');
    if (source.source_type === 'file') {
      if (!source.file || source.file.organization_id !== playbook.organization_id || source.file.course_id !== null) throw new Error('Role Guide file provenance is not approved');
      sources.push(fileSource({ ...source.file, approved: true }, 'ROLE_GUIDE', playbook.id, 'career_playbook_source', input.readBytes));
    } else if (source.text?.trim()) {
      const bytes = Buffer.from(source.text, 'utf8');
      sources.push({ id: source.id, sourceType: 'career_playbook_source', organizationId: source.organization_id, objectKind: 'ROLE_GUIDE', objectId: playbook.id, approved: true, version: sha256(bytes), sourceSha256: sha256(bytes), fileName: source.filename ?? `source-${source.id}.txt`, mediaType: 'text/plain', readOriginalBytes: async () => bytes, trustedMarkdown: source.text });
    }
  }
  const generatedBlocks = jsonObject(playbook.generated_blocks);
  return {
    kind: 'ROLE_GUIDE', id: playbook.id, organizationId: playbook.organization_id, completedAt: playbook.completed_at,
    title: playbook.position_title?.trim() || 'Role Guide', language: playbook.language,
    summaryMarkdown: playbook.final_markdown,
    structure: { roleProfileSpec: jsonObject(playbook.role_profile_spec) },
    blocks: Object.entries(generatedBlocks).map(([key, value]) => ({ key, value })), lessons: [], sources,
  };
}
