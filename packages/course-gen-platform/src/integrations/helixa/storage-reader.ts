import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { KnowledgeSyncPreparationError } from './errors';

interface CourseSourceFile {
  id: string;
  organization_id: string;
  course_id: string | null;
  hash: string;
  storage_path: string;
  markdown_content?: string | null;
  processed_content?: string | null;
  summary_metadata?: unknown;
}

export interface CourseNativeSourceProofRow {
  course_id: string;
  organization_id: string;
  file_catalog_id: string;
  source_canonical_content: string;
  source_content_hash: string;
}

interface CourseJobInstructionProof {
  course_id: string;
  organization_id: string;
  job_instruction_id: string;
  source_content_hash: string;
}

const NATIVE_ROLE_GUIDE_PREFIX = 'helixa-generation://';
const SHA256 = /^[a-f0-9]{64}$/u;

function sourceMetadata(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function provenanceFailure(): never {
  throw new KnowledgeSyncPreparationError('provenance', false);
}

/**
 * Read Course source bytes from their governed storage class.
 *
 * Ordinary uploads keep the existing filesystem reader. The single virtual
 * scheme produced by Helixa Course-from-Role-Guide scheduling is resolved only
 * from the immutable native-source proof row, with every course, tenant, file,
 * URI, metadata, body, and SHA-256 fence checked before bytes are returned.
 */
export function createCourseSourceReader(input: {
  courseId: string;
  organizationId: string;
  jobInstructionSource: CourseJobInstructionProof | null;
  nativeSources: CourseNativeSourceProofRow[];
  readUploadBytes: (file: Pick<CourseSourceFile, 'id' | 'storage_path'>) => Promise<Buffer>;
}) {
  return async (file: CourseSourceFile): Promise<Buffer> => {
    if (!file.storage_path.startsWith(NATIVE_ROLE_GUIDE_PREFIX)) {
      if (file.storage_path.includes('://')) provenanceFailure();
      return input.readUploadBytes(file);
    }

    const relation = input.jobInstructionSource;
    if (!relation || !SHA256.test(relation.source_content_hash)) provenanceFailure();
    const expectedStoragePath =
      `helixa-generation://role-guide/${relation.job_instruction_id}/` +
      relation.source_content_hash;
    const matchingProofs = input.nativeSources.filter(row => row.file_catalog_id === file.id);
    if (matchingProofs.length !== 1) provenanceFailure();
    const proof = matchingProofs[0];
    const metadata = sourceMetadata(file.summary_metadata);
    if (
      relation.organization_id !== input.organizationId ||
      relation.course_id !== input.courseId ||
      file.organization_id !== input.organizationId ||
      file.course_id !== input.courseId ||
      file.storage_path !== expectedStoragePath ||
      file.hash !== relation.source_content_hash ||
      proof.organization_id !== input.organizationId ||
      proof.course_id !== input.courseId ||
      proof.file_catalog_id !== file.id ||
      proof.source_content_hash !== relation.source_content_hash ||
      proof.source_canonical_content.length === 0 ||
      file.markdown_content !== proof.source_canonical_content ||
      file.processed_content !== proof.source_canonical_content ||
      metadata.source !== 'helixa_role_guide' ||
      metadata.source_version_hash !== relation.source_content_hash
    ) {
      provenanceFailure();
    }

    const bytes = Buffer.from(proof.source_canonical_content, 'utf8');
    const actualHash = createHash('sha256').update(bytes).digest('hex');
    if (actualHash !== relation.source_content_hash) provenanceFailure();
    return bytes;
  };
}

export function createUploadStorageReader(uploadRoot: string) {
  return async (file: { id: string; storage_path: string }): Promise<Buffer> => {
    const root = await realpath(path.resolve(uploadRoot));
    const candidate = path.resolve(root, file.storage_path);
    if (candidate === root || !candidate.startsWith(`${root}${path.sep}`)) {
      throw new KnowledgeSyncPreparationError('provenance', false);
    }
    let handle;
    try {
      handle = await open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW);
      const [openedPath, stat] = await Promise.all([
        realpath(`/proc/self/fd/${handle.fd}`),
        handle.stat(),
      ]);
      if (!stat.isFile() || !openedPath.startsWith(`${root}${path.sep}`)) {
        throw new KnowledgeSyncPreparationError('provenance', false);
      }
      return await handle.readFile();
    } catch (error) {
      if (error instanceof KnowledgeSyncPreparationError) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ELOOP') throw new KnowledgeSyncPreparationError('provenance', false);
      throw new KnowledgeSyncPreparationError('storage', true);
    } finally {
      await handle?.close();
    }
  };
}
