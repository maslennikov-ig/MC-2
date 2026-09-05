import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/supabase/admin', () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock('@/stages/stage1-document-upload/storage-paths', () => ({ getUploadStorageRootPath: () => '/tmp/uploads' }));
vi.mock('@/integrations/helixa/storage-reader', () => ({ createUploadStorageReader: () => () => Promise.resolve(Buffer.from('approved source')) }));

import { buildKnowledgeSyncPackage, serializeKnowledgeSyncPackage } from '@/integrations/helixa/package-builder';
import { canonicalGenerationJsonV1 } from '@/integrations/helixa/generation-canonical-json';
import { loadKnowledgeSnapshot } from '@/integrations/helixa/runtime-repository';
import { mapCompletedCourse, mapCompletedRoleGuide } from '@/integrations/helixa/snapshot-loader';
import { getSupabaseAdmin } from '@/shared/supabase/admin';

const organizationId = '11111111-1111-4111-8111-111111111111';
const roleGuideId = '22222222-2222-4222-8222-222222222222';
const courseId = '44444444-4444-4444-8444-444444444444';
const completedAt = '2026-08-23T10:15:30.000Z';
const sourceContentHash = 'b'.repeat(64);

const jobInstructionOriginRow = {
  binding_id: 'megacampus-binding-a',
  command_id: 'megacampus_generation_command:create_job_instruction:v1:5be564997f181c5e1e25f80a324070406718c6bffbf4440256467b0ec8f31467',
  command_kind: 'CREATE_JOB_INSTRUCTION',
  proposal_id: 'proposal-a',
  approved_revision: 3,
  proposal_payload_hash: '8daa4156a9241d22eb9c943b3ea5641f589e75086e301995014312c81b4945ee',
  object_kind: 'ROLE_GUIDE',
  object_id: roleGuideId,
  organization_id: organizationId,
  status: 'native_completed',
} as const;

const courseOriginRow = {
  binding_id: 'megacampus-binding-a',
  command_id: 'megacampus_generation_command:create_course_from_job_instruction:v1:9065164d6a76f728e501e154c880cae0dd33e634513f061cb2aafae8d3cf9836',
  command_kind: 'CREATE_COURSE_FROM_JOB_INSTRUCTION',
  proposal_id: 'proposal-b',
  approved_revision: 4,
  proposal_payload_hash: 'dea01684025c290e36f876d33edb08c89be0ddf490595ef6e080b53a5e44290c',
  object_kind: 'COURSE',
  object_id: courseId,
  organization_id: organizationId,
  status: 'native_completed',
} as const;

const courseSourceRow = {
  course_id: courseId,
  organization_id: organizationId,
  job_instruction_id: roleGuideId,
  source_version: completedAt,
  source_content_hash: sourceContentHash,
  origin_binding_id: 'megacampus-binding-a',
  origin_command_id: courseOriginRow.command_id,
} as const;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function expectedPayloadHash(value: { hashes: { payloadHash: string } }): string {
  const projection = structuredClone(value);
  delete (projection.hashes as { payloadHash?: string }).payloadHash;
  return createHash('sha256').update(canonical(projection), 'utf8').digest('hex');
}

describe('signed Helixa generation projection', () => {
  it('keeps an existing non-command ROLE_GUIDE package unchanged', async () => {
    const snapshot = await mapCompletedRoleGuide({
      playbook: {
        id: roleGuideId, organization_id: organizationId, status: 'completed', completed_at: completedAt,
        position_title: 'Sales Manager', language: 'en', final_markdown: '# Sales Manager',
        role_profile_spec: {}, generated_blocks: {},
      },
      sources: [], readBytes: vi.fn(),
    });

    const result = await buildKnowledgeSyncPackage(snapshot, { environment: 'test', externalProjectId: null });

    expect(result).not.toHaveProperty('originCommand');
    expect(result.relations).toEqual([]);
  });

  it('keeps legacy package bytes on the legacy canonicalizer while new origins reject fractional proof content', async () => {
    const legacy = await buildKnowledgeSyncPackage({
      kind: 'ROLE_GUIDE', id: roleGuideId, organizationId, completedAt,
      title: 'Legacy', language: 'en', summaryMarkdown: '# Legacy',
      structure: { '\u{10000}': 1, '\uE000': 1.5 }, blocks: [], lessons: [],
    }, { environment: 'test', externalProjectId: null });
    const legacyBytes = serializeKnowledgeSyncPackage(legacy);
    expect(legacyBytes.toString('utf8')).toContain('1.5');
    expect(createHash('sha256').update(legacyBytes).digest('hex')).toBe('077efac7339bd3061582e57111bfbdeaeda6b8fb25e08d131ac26ba6da91dfbd');

    await expect(buildKnowledgeSyncPackage({
      kind: 'ROLE_GUIDE', id: roleGuideId, organizationId, completedAt,
      title: 'Generated', language: 'en', summaryMarkdown: '# Generated',
      structure: { '\u{10000}': 1, '\uE000': 1.5 }, blocks: [], lessons: [],
      originCommand: {
        schemaVersion: 'helixa.megacampus-generation-origin.v1', operation: 'CREATE_JOB_INSTRUCTION',
        commandId: jobInstructionOriginRow.command_id, proposalId: 'proposal-a', approvedRevision: 3,
        payloadHash: jobInstructionOriginRow.proposal_payload_hash,
      },
    }, { environment: 'test', externalProjectId: null })).rejects.toThrow(/contract/i);
  });

  it('projects authoritative ROLE_GUIDE command origin into signed package bytes', async () => {
    const snapshot = await mapCompletedRoleGuide({
      playbook: {
        id: roleGuideId, organization_id: organizationId, status: 'completed', completed_at: completedAt,
        position_title: 'Sales Manager', language: 'en', final_markdown: '# Sales Manager',
        role_profile_spec: {}, generated_blocks: {},
      },
      sources: [], readBytes: vi.fn(), generationOrigin: jobInstructionOriginRow,
    });

    const result = await buildKnowledgeSyncPackage(snapshot, { environment: 'test', externalProjectId: null });

    expect(result.originCommand).toEqual({
      schemaVersion: 'helixa.megacampus-generation-origin.v1',
      operation: 'CREATE_JOB_INSTRUCTION',
      commandId: jobInstructionOriginRow.command_id,
      proposalId: 'proposal-a',
      approvedRevision: 3,
      payloadHash: jobInstructionOriginRow.proposal_payload_hash,
    });
    expect(result.hashes.payloadHash).toBe(expectedPayloadHash(result));
    expect(JSON.parse(serializeKnowledgeSyncPackage(result).toString('utf8'))).toHaveProperty(
      'originCommand.commandId', jobInstructionOriginRow.command_id,
    );
  });

  it('uses the generation canonical contract for Unicode content proof without changing semantic block order', async () => {
    const snapshot = await mapCompletedRoleGuide({
      playbook: {
        id: roleGuideId, organization_id: organizationId, status: 'completed', completed_at: completedAt,
        position_title: 'Sales Manager', language: 'en', final_markdown: '# Sales Manager',
        role_profile_spec: { '\u{10000}': 1, '\uE000': 2 },
        generated_blocks: { '\u{10000}': { score: 1 }, '\uE000': { score: 2 } },
      },
      sources: [], readBytes: vi.fn(), generationOrigin: jobInstructionOriginRow,
    });
    expect(snapshot.blocks.map(block => block.key)).toEqual(['\uE000', '\u{10000}']);
    const result = await buildKnowledgeSyncPackage(snapshot, { environment: 'test', externalProjectId: null });
    expect(result.hashes.contentHash).toBe(createHash('sha256').update(canonicalGenerationJsonV1(result.content), 'utf8').digest('hex'));
  });

  it('projects the exact immutable COURSE_FROM_ROLE_GUIDE row and signs it', async () => {
    const snapshot = await mapCompletedCourse({
      course: {
        id: courseId, organization_id: organizationId, generation_status: 'completed',
        generation_completed_at: completedAt, title: 'Sales Manager Onboarding', language: 'en',
        course_structure: { sections: [] }, course_description: 'Practical onboarding.',
      },
      lessonContents: [], files: [], readBytes: vi.fn(),
      generationOrigin: courseOriginRow,
      jobInstructionSource: courseSourceRow,
    });

    const result = await buildKnowledgeSyncPackage(snapshot, { environment: 'test', externalProjectId: null });

    expect(result.originCommand).toEqual({
      schemaVersion: 'helixa.megacampus-generation-origin.v1',
      operation: 'CREATE_COURSE_FROM_JOB_INSTRUCTION',
      commandId: courseOriginRow.command_id,
      proposalId: 'proposal-b',
      approvedRevision: 4,
      payloadHash: courseOriginRow.proposal_payload_hash,
    });
    expect(result.relations).toEqual([{
      relationKey: 'megacampus_relation:course_from_role_guide:382082e11559529f6eb7d88bde57b89f61461756065cd1872b3aac97484ccc01',
      type: 'COURSE_FROM_ROLE_GUIDE',
      fromKey: `COURSE:${courseId}`,
      toKey: `ROLE_GUIDE:${roleGuideId}`,
      metadata: { sourceVersion: completedAt, contentHash: sourceContentHash },
    }]);
    expect(result.hashes.contentHash).toBe(createHash('sha256').update(canonical(result.content), 'utf8').digest('hex'));
    expect(result.hashes.payloadHash).toBe(expectedPayloadHash(result));
  });

  it('fails closed when an authoritative command row and immutable relation disagree', async () => {
    await expect(mapCompletedCourse({
      course: {
        id: courseId, organization_id: organizationId, generation_status: 'completed',
        generation_completed_at: completedAt, title: 'Sales Manager Onboarding', language: 'en',
        course_structure: {},
      },
      lessonContents: [], files: [], readBytes: vi.fn(), generationOrigin: courseOriginRow,
      jobInstructionSource: { ...courseSourceRow, origin_command_id: 'another-command' },
    })).rejects.toThrow(/provenance/i);
  });

  it('loads COURSE origin and relation from their authoritative rows', async () => {
    const fileId = '550e8400-e29b-41d4-a716-446655440000';
    const fileHash = 'a'.repeat(64);
    const rows: Record<string, unknown> = {
      helixa_generation_commands: courseOriginRow,
      courses: {
        id: courseId, organization_id: organizationId, generation_status: 'completed',
        generation_completed_at: completedAt, title: 'Sales Manager Onboarding', language: 'en',
        course_structure: { sections: [] }, course_description: 'Practical onboarding.', slug: null,
      },
      lesson_contents: [],
      document_evidence_runs: { source_manifest: [{ document_id: fileId, source_version_hash: fileHash, document_name: 'policy' }] },
      file_catalog: [{
        id: fileId, organization_id: organizationId, course_id: courseId, filename: 'policy.txt',
        mime_type: 'text/plain', hash: fileHash, storage_path: `${organizationId}/policy.txt`,
        markdown_content: null, parsed_content: null,
      }],
      course_job_instruction_sources: courseSourceRow,
    };
    const from = vi.fn((table: string) => {
      const result = { data: rows[table] ?? null, error: null };
      const query = {
        select: vi.fn(), eq: vi.fn(), in: vi.fn(), is: vi.fn(), order: vi.fn(), limit: vi.fn(),
        single: vi.fn(() => Promise.resolve(result)), maybeSingle: vi.fn(() => Promise.resolve(result)),
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result)),
      };
      for (const method of ['select', 'eq', 'in', 'is', 'order', 'limit'] as const) query[method].mockReturnValue(query);
      return query;
    });
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as never);

    const snapshot = await loadKnowledgeSnapshot({
      objectKind: 'COURSE', objectId: courseId, organizationId, completedAt, bindingId: 'megacampus-binding-a',
    });

    expect(from.mock.calls.map(([table]) => table)).toContain('helixa_generation_commands');
    expect(from.mock.calls.map(([table]) => table)).toContain('course_job_instruction_sources');
    expect(snapshot.originCommand?.commandId).toBe(courseOriginRow.command_id);
    expect(snapshot.relations).toEqual([expect.objectContaining({
      type: 'COURSE_FROM_ROLE_GUIDE',
      toKey: `ROLE_GUIDE:${roleGuideId}`,
      metadata: { sourceVersion: completedAt, contentHash: sourceContentHash },
    })]);
  });
});
