import { createHash, createHmac } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/supabase/admin', () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock('@/stages/stage1-document-upload/storage-paths', () => ({
  getUploadStorageRootPath: () => '/tmp/uploads',
}));

import {
  buildKnowledgeSyncPackage,
  routeMediaType,
  serializeKnowledgeSyncPackage,
  type KnowledgeExportSnapshot,
} from '@/integrations/helixa/package-builder';
import {
  classifyDeliveryFailure,
  createFetchRequest,
  deliverClaimedKnowledgeSync,
} from '@/integrations/helixa/delivery';
import {
  computeRetryDelayMs,
  KnowledgeSyncPreparationError,
  processKnowledgeSyncOutboxEntry,
} from '@/integrations/helixa/outbox';
import { reconcileCompletedKnowledgeObjects } from '@/integrations/helixa/reconciler';
import {
  bindAcceptedCourseSources,
  mapCompletedCourse,
  mapCompletedRoleGuide,
} from '@/integrations/helixa/snapshot-loader';
import { createUploadStorageReader } from '@/integrations/helixa/storage-reader';
import { readKnowledgeSyncRuntimeConfig } from '@/integrations/helixa/runtime-repository';
import { claimKnowledgeSyncOutbox } from '@/integrations/helixa/runtime-repository';
import { getSupabaseAdmin } from '@/shared/supabase/admin';

const completedAt = '2026-08-22T12:34:56.000Z';
const organizationId = 'org-1';
const courseId = 'course-1';

function snapshot(overrides: Partial<KnowledgeExportSnapshot> = {}): KnowledgeExportSnapshot {
  return {
    kind: 'COURSE',
    id: courseId,
    organizationId,
    completedAt,
    title: 'Safe operations',
    language: 'ru',
    url: 'https://ai.megacampus.ru/courses/course-1',
    summaryMarkdown: '# Safe operations',
    structure: { z: 1, a: { y: 2, x: 1 } },
    blocks: [],
    lessons: [{ id: 'lesson-1', title: 'Start', markdown: 'Use the checklist.' }],
    ...overrides,
  };
}

describe('MegaCampus knowledge package', () => {
  it('freezes canonical bytes, payload hash, source bytes, and stable identities', async () => {
    const input = snapshot({
      sources: [
        {
          id: 'file-1',
          sourceType: 'file_catalog',
          organizationId,
          objectKind: 'COURSE',
          objectId: courseId,
          approved: true,
          version: 'v1',
          fileName: 'policy.txt',
          mediaType: 'text/plain',
          readOriginalBytes: () => Promise.resolve(Buffer.from('policy bytes')),
          trustedMarkdown: '# Policy\nFollow it.',
        },
      ],
    });
    const options = { environment: 'test', externalProjectId: null } as const;
    const first = await buildKnowledgeSyncPackage(input, options);
    const second = await buildKnowledgeSyncPackage(input, options);
    const raw = serializeKnowledgeSyncPackage(first);

    expect(first).toEqual(second);
    expect(raw.equals(serializeKnowledgeSyncPackage(second))).toBe(true);
    expect(first.schemaVersion).toBe('2026-06-16.megacampus-knowledge-sync.v1');
    expect(first.eventId).toBe(second.eventId);
    expect(first.object.version).toBe(completedAt);
    const primary = first.sourceDocuments.find(document => document.authority === 'primary_source');
    expect(primary).toMatchObject({
      route: { family: 'local_text' },
      provenance: { sourceType: 'file_catalog', sourceId: 'file-1' },
    });
    expect(primary?.artifacts.map(item => item.representation)).toEqual([
      'original_bytes',
      'trusted_normalized_markdown',
    ]);

    const projected = structuredClone(first);
    delete (projected.hashes as { payloadHash?: string }).payloadHash;
    const canonical = (value: unknown): string => {
      if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
      if (value !== null && typeof value === 'object')
        return `{${Object.keys(value as Record<string, unknown>)
          .sort()
          .map(
            key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`
          )
          .join(',')}}`;
      return JSON.stringify(value);
    };
    expect(first.hashes.payloadHash).toBe(
      createHash('sha256').update(canonical(projected), 'utf8').digest('hex')
    );
  });

  it('builds ROLE_GUIDE and preserves accepted Docling JSON', async () => {
    const docling = JSON.stringify({ schema_name: 'DoclingDocument', texts: [] });
    const result = await buildKnowledgeSyncPackage(
      snapshot({
        kind: 'ROLE_GUIDE',
        id: 'playbook-1',
        title: 'Sales Lead',
        summaryMarkdown: '# Sales Lead',
        structure: { roleProfileSpec: { level: 'lead' } },
        blocks: [{ key: 'responsibilities', markdown: 'Own sales.' }],
        lessons: [],
        sources: [
          {
            id: 'source-1',
            sourceType: 'career_playbook_source',
            organizationId,
            objectKind: 'ROLE_GUIDE',
            objectId: 'playbook-1',
            approved: true,
            version: 'v2',
            fileName: 'source.pdf',
            mediaType: 'application/pdf',
            readOriginalBytes: () => Promise.resolve(Buffer.from('%PDF fixture')),
            acceptedDoclingJson: docling,
          },
        ],
      }),
      { environment: 'test', externalProjectId: 'project-1' }
    );
    expect(result.eventType).toBe('ROLE_GUIDE_COMPLETED');
    expect(result.object.kind).toBe('ROLE_GUIDE');
    expect(result.content.lessons).toEqual([]);
    const primary = result.sourceDocuments.find(
      document => document.authority === 'primary_source'
    );
    expect(primary?.route.family).toBe('docling');
    expect(primary?.artifacts[1]).toMatchObject({
      representation: 'accepted_docling_json',
      content: docling,
    });
  });

  it.each([
    ['COURSE', 'derived_training'],
    ['ROLE_GUIDE', 'derived_role_guide'],
  ] as const)('always emits citable generated-object evidence for %s', async (kind, authority) => {
    const result = await buildKnowledgeSyncPackage(
      snapshot({
        kind,
        id: kind === 'COURSE' ? courseId : 'role-1',
        summaryMarkdown: kind === 'COURSE' ? '# Course\nSummary' : '# Role\nFinal guide',
        blocks: kind === 'ROLE_GUIDE' ? [{ key: 'mission', markdown: 'Lead.' }] : [],
        lessons: kind === 'COURSE' ? [{ id: 'lesson-1', markdown: '# Lesson\nLearn.' }] : [],
        sources: [],
      }),
      { environment: 'test', externalProjectId: null }
    );
    const generated = result.sourceDocuments.find(
      document => document.provenance.sourceType === 'generated_object'
    );
    expect(generated).toMatchObject({ authority, route: { family: 'local_text' } });
    expect(generated?.artifacts[0]).toMatchObject({
      representation: 'original_bytes',
      mediaType: 'text/markdown',
    });
    expect(result.evidenceSegments).toContainEqual(
      expect.objectContaining({
        documentKey: generated?.documentKey,
        artifactKey: generated?.artifacts[0]?.artifactKey,
        authority,
      })
    );
  });

  it('fails closed for unapproved, cross-tenant, or cross-object sources', async () => {
    for (const source of [
      { approved: false },
      { organizationId: 'other-org' },
      { objectId: 'other-course' },
    ]) {
      await expect(
        buildKnowledgeSyncPackage(
          snapshot({
            sources: [
              {
                id: 'file-1',
                sourceType: 'file_catalog',
                organizationId,
                objectKind: 'COURSE',
                objectId: courseId,
                approved: true,
                version: 'v1',
                fileName: 'policy.txt',
                mediaType: 'text/plain',
                readOriginalBytes: () => Promise.resolve(Buffer.from('private')),
                ...source,
              },
            ],
          }),
          { environment: 'test', externalProjectId: null }
        )
      ).rejects.toThrow(/provenance/i);
    }
  });

  it('routes every frozen family and counts unsupported', async () => {
    const routes = new Map([
      ['application/pdf', 'docling'],
      ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docling'],
      ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'docling'],
      ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'docling'],
      ['application/vnd.oasis.opendocument.text', 'docling'],
      ['application/epub+zip', 'docling'],
      ['text/html', 'docling'],
      ['image/png', 'docling'],
      ['text/plain', 'local_text'],
      ['text/markdown', 'local_text'],
      ['application/json', 'local_text'],
      ['application/rss+xml', 'content_rss'],
      ['application/atom+xml', 'content_rss'],
      ['audio/mpeg', 'meetings_media'],
      ['video/mp4', 'meetings_media'],
      ['application/x-custom', 'unsupported'],
    ]);
    const mediaTypes = [...routes.keys()];
    const result = await buildKnowledgeSyncPackage(
      snapshot({
        sources: mediaTypes.map((mediaType, index) => ({
          id: `file-${index}`,
          sourceType: 'file_catalog' as const,
          organizationId,
          objectKind: 'COURSE' as const,
          objectId: courseId,
          approved: true,
          version: 'v1',
          fileName: `source-${index}.bin`,
          mediaType,
          readOriginalBytes: () => Promise.resolve(Buffer.from(`bytes-${index}`)),
        })),
      }),
      { environment: 'test', externalProjectId: null }
    );
    expect(
      result.sourceDocuments
        .filter(item => item.authority === 'primary_source')
        .map(item => item.route.family)
    ).toEqual([...routes.values()]);
    expect(result.metadata).toMatchObject({ routeCounts: { unsupported: 1 } });
  });

  it('matches the frozen Helixa MIME essence policy including malformed values', () => {
    const cases = new Map<string, string>([
      ['application/msword', 'docling'],
      ['application/vnd.ms-excel', 'docling'],
      ['application/vnd.ms-powerpoint', 'docling'],
      ['image/bmp', 'docling'],
      ['image/webp', 'docling'],
      ['application/problem+json; charset=utf-8', 'local_text'],
      ['text/plain; charset=utf-8', 'local_text'],
      ['text/csv', 'unsupported'],
      ['text/plain; broken', 'unsupported'],
      ['not-a-media-type', 'unsupported'],
    ]);
    for (const [mediaType, route] of cases) expect(routeMediaType(mediaType)).toBe(route);
  });

  it('fails the package when approved source bytes cannot be read and safely keeps an original-only source', async () => {
    await expect(
      buildKnowledgeSyncPackage(
        snapshot({
          sources: [
            {
              id: 'missing',
              sourceType: 'file_catalog',
              organizationId,
              objectKind: 'COURSE',
              objectId: courseId,
              approved: true,
              version: 'v1',
              fileName: 'missing.pdf',
              mediaType: 'application/pdf',
              readOriginalBytes: () => Promise.reject(new Error('storage unavailable')),
            },
          ],
        }),
        { environment: 'test', externalProjectId: null }
      )
    ).rejects.toThrow(/storage/i);

    const originalOnly = await buildKnowledgeSyncPackage(
      snapshot({
        sources: [
          {
            id: 'raw',
            sourceType: 'file_catalog',
            organizationId,
            objectKind: 'COURSE',
            objectId: courseId,
            approved: true,
            version: 'v1',
            fileName: 'raw.pdf',
            mediaType: 'application/pdf',
            readOriginalBytes: () => Promise.resolve(Buffer.from('raw')),
          },
        ],
      }),
      { environment: 'test', externalProjectId: null }
    );
    expect(originalOnly.sourceDocuments[0]?.artifacts).toHaveLength(1);
  });

  it('maps actual completed Stage 6 and Career Playbook records fail-closed', async () => {
    const course = await mapCompletedCourse({
      course: {
        id: courseId,
        organization_id: organizationId,
        generation_status: 'completed',
        generation_completed_at: completedAt,
        title: 'Course',
        language: 'ru',
        course_structure: { sections: [] },
      },
      lessonContents: [
        {
          lesson_id: 'lesson-1',
          status: 'completed',
          content: { markdown: '# Lesson' },
          metadata: { lessonLabel: '1.1' },
        },
      ],
      files: [],
      readBytes: vi.fn(),
    });
    expect(course).toMatchObject({
      kind: 'COURSE',
      structure: { sections: [] },
      lessons: [{ lesson_id: 'lesson-1' }],
    });

    const guide = await mapCompletedRoleGuide({
      playbook: {
        id: 'role-1',
        organization_id: organizationId,
        status: 'completed',
        completed_at: completedAt,
        position_title: 'Sales Lead',
        language: 'en',
        final_markdown: '# Sales Lead',
        role_profile_spec: { level: 'lead' },
        generated_blocks: { mission: { markdown: 'Grow.' } },
      },
      sources: [],
      readBytes: vi.fn(),
    });
    expect(guide).toMatchObject({
      kind: 'ROLE_GUIDE',
      summaryMarkdown: '# Sales Lead',
      structure: { roleProfileSpec: { level: 'lead' } },
    });
    await expect(
      mapCompletedCourse({
        ...{
          course: {
            id: courseId,
            organization_id: organizationId,
            generation_status: 'stage_6_complete',
            generation_completed_at: null,
            title: 'Course',
            language: 'ru',
            course_structure: {},
          },
          lessonContents: [],
          files: [],
          readBytes: vi.fn(),
        },
      })
    ).rejects.toThrow(/event_identity/i);
  });

  it('binds Course approval to the exact accepted manifest version', () => {
    const hash = 'a'.repeat(64);
    const files = [{ id: '550e8400-e29b-41d4-a716-446655440000', hash }];
    expect(
      bindAcceptedCourseSources(
        [{ document_id: files[0].id, source_version_hash: hash, document_name: 'policy' }],
        files
      )
    ).toEqual([{ ...files[0], approved: true, approvedVersion: hash }]);
    expect(() =>
      bindAcceptedCourseSources(
        [
          {
            document_id: files[0].id,
            source_version_hash: 'b'.repeat(64),
            document_name: 'policy',
          },
        ],
        files
      )
    ).toThrow(/provenance/i);
    expect(() =>
      bindAcceptedCourseSources(
        [{ document_id: 'bad', source_version_hash: hash, document_name: 'policy' }],
        files
      )
    ).toThrow(/provenance/i);
    expect(() => bindAcceptedCourseSources(undefined, files)).toThrow(/provenance/i);
  });

  it('keeps Role Guide source-row identity object-scoped when two guides share one file', async () => {
    const sharedFile = {
      id: 'file-shared',
      organization_id: organizationId,
      course_id: null,
      filename: 'policy.pdf',
      mime_type: 'application/pdf',
      hash: 'hash-v1',
      storage_path: 'org/policy.pdf',
      approved: true,
    };
    const build = async (playbookId: string, sourceId: string) =>
      buildKnowledgeSyncPackage(
        await mapCompletedRoleGuide({
          playbook: {
            id: playbookId,
            organization_id: organizationId,
            status: 'completed',
            completed_at: completedAt,
            position_title: 'Role',
            language: 'en',
            final_markdown: '# Role',
            role_profile_spec: {},
            generated_blocks: {},
          },
          sources: [
            {
              id: sourceId,
              playbook_id: playbookId,
              organization_id: organizationId,
              source_type: 'file',
              status: 'ready',
              filename: 'policy.pdf',
              text: null,
              file: sharedFile,
            },
          ],
          readBytes: () => Promise.resolve(Buffer.from('shared')),
        }),
        { environment: 'test', externalProjectId: null }
      );
    const [first, second] = await Promise.all([
      build('role-1', 'source-1'),
      build('role-2', 'source-2'),
    ]);
    const firstPrimary = first.sourceDocuments.find(item => item.authority === 'primary_source')!;
    const secondPrimary = second.sourceDocuments.find(item => item.authority === 'primary_source')!;
    expect(firstPrimary.provenance).toMatchObject({
      sourceId: 'source-1',
      metadata: { underlyingFileId: 'file-shared' },
    });
    expect(secondPrimary.provenance.sourceId).toBe('source-2');
    expect(firstPrimary.documentKey).not.toBe(secondPrimary.documentKey);
  });

  it('reads source bytes below the real root and refuses a symlink escape', async () => {
    const boundary = await mkdtemp(path.join(tmpdir(), 'mc2-helixa-storage-'));
    const root = path.join(boundary, 'uploads');
    const inside = path.join(root, 'org');
    await import('node:fs/promises').then(fs => fs.mkdir(inside, { recursive: true }));
    await writeFile(path.join(inside, 'safe.txt'), 'safe');
    await writeFile(path.join(boundary, 'outside.txt'), 'outside');
    await symlink(path.join(boundary, 'outside.txt'), path.join(inside, 'escape.txt'));
    try {
      const reader = createUploadStorageReader(root);
      await expect(reader({ id: 'f1', storage_path: 'org/safe.txt' })).resolves.toEqual(
        Buffer.from('safe')
      );
      await expect(reader({ id: 'f2', storage_path: 'org/escape.txt' })).rejects.toThrow(
        /provenance/i
      );
      await expect(reader({ id: 'f3', storage_path: '../outside.txt' })).rejects.toThrow(
        /provenance/i
      );
    } finally {
      await rm(boundary, { recursive: true, force: true });
    }
  });
});

describe('delivery and durable intent', () => {
  it('injects endpoint, secret, external system, and destination without durable defaults', () => {
    expect(
      readKnowledgeSyncRuntimeConfig({
        HELIXA_KNOWLEDGE_SYNC_ENDPOINT:
          'https://helixa.test/api/integrations/megacampus/knowledge-sync',
        HELIXA_KNOWLEDGE_SYNC_HMAC_KEY: 'runtime-only',
        HELIXA_EXTERNAL_SYSTEM_ID: 'system-1',
        HELIXA_DESTINATION_PROJECT_ID: 'project-1',
        HELIXA_KNOWLEDGE_SYNC_BINDING_ID: 'binding-1',
        HELIXA_KNOWLEDGE_SYNC_ORGANIZATION_ID: organizationId,
        HELIXA_DESTINATION_BINDING_ID: 'destination-1',
        APP_ENV: 'test',
      })
    ).toEqual({
      endpoint: 'https://helixa.test/api/integrations/megacampus/knowledge-sync',
      hmacKey: 'runtime-only',
      externalSystemId: 'system-1',
      externalProjectId: 'project-1',
      environment: 'test',
      bindingId: 'binding-1',
      organizationId,
      destinationBindingId: 'destination-1',
    });
    expect(() => readKnowledgeSyncRuntimeConfig({})).toThrow(/incomplete/i);
  });
  it('uses the dedicated Helixa binding environment before shared process fallbacks', () => {
    const required = {
      HELIXA_KNOWLEDGE_SYNC_ENDPOINT: 'https://helixa.test',
      HELIXA_KNOWLEDGE_SYNC_HMAC_KEY: 'runtime-only',
      HELIXA_EXTERNAL_SYSTEM_ID: 'system-1',
      HELIXA_KNOWLEDGE_SYNC_BINDING_ID: 'binding-1',
      HELIXA_KNOWLEDGE_SYNC_ORGANIZATION_ID: organizationId,
      HELIXA_DESTINATION_BINDING_ID: 'destination-1',
    };
    expect(
      readKnowledgeSyncRuntimeConfig({
        ...required,
        HELIXA_KNOWLEDGE_SYNC_ENVIRONMENT: 'acceptance',
        APP_ENV: 'shared-app-environment',
        NODE_ENV: 'production',
      }).environment
    ).toBe('acceptance');
    expect(
      readKnowledgeSyncRuntimeConfig({ ...required, APP_ENV: 'staging', NODE_ENV: 'production' })
        .environment
    ).toBe('staging');
  });
  it('claims only the invoking organization/environment/destination binding', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue({ rpc } as never);
    const binding = readKnowledgeSyncRuntimeConfig({
      HELIXA_KNOWLEDGE_SYNC_ENDPOINT: 'https://helixa.test',
      HELIXA_KNOWLEDGE_SYNC_HMAC_KEY: 'key',
      HELIXA_EXTERNAL_SYSTEM_ID: 'system-1',
      HELIXA_DESTINATION_PROJECT_ID: 'project-1',
      HELIXA_KNOWLEDGE_SYNC_BINDING_ID: 'binding-1',
      HELIXA_KNOWLEDGE_SYNC_ORGANIZATION_ID: organizationId,
      HELIXA_DESTINATION_BINDING_ID: 'destination-1',
      APP_ENV: 'staging',
    });
    await claimKnowledgeSyncOutbox(binding, 7);
    expect(rpc).toHaveBeenCalledWith('claim_helixa_knowledge_sync_outbox', {
      p_binding_id: 'binding-1',
      p_organization_id: organizationId,
      p_environment: 'staging',
      p_destination_binding_id: 'destination-1',
      p_batch_size: 7,
    });
  });
  it('signs exact stored bytes and sends injected routing headers', async () => {
    const rawBody = Buffer.from('{"stable":true}');
    const request = vi.fn().mockResolvedValue({ status: 202, body: '' });
    await deliverClaimedKnowledgeSync(
      { id: 'outbox-1', eventId: 'event-1', rawBody },
      {
        endpoint: 'https://helixa.test/api/integrations/megacampus/knowledge-sync',
        hmacKey: 'test-only-key',
        externalSystemId: 'system-1',
        request,
      }
    );
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        body: rawBody,
        headers: {
          'Content-Type': 'application/json',
          'X-Helixa-External-System-Id': 'system-1',
          'X-Megacampus-Event-Id': 'event-1',
          'X-Megacampus-Signature': `sha256=${createHmac('sha256', 'test-only-key').update(rawBody).digest('hex')}`,
        },
      })
    );
  });

  it('uses a request deadline shorter than the database lease', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 202 }));
    await createFetchRequest(
      fetchImpl as typeof fetch,
      120_000
    )({ url: 'https://helixa.test', method: 'POST', headers: {}, body: Buffer.from('{}') });
    expect(fetchImpl.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  // The signature is computed over `rawBody`, but the transport hands `fetch` something else:
  // a Node Buffer is not a `BodyInit`, so `createFetchRequest` converts. Nothing above this
  // line proves the converted value still carries the signed bytes — the layer that asserts
  // the signature mocks the transport away. A `toString()` or a re-encode here would ship a
  // body Helixa rejects, and every test would stay green.
  it('hands fetch the exact bytes the signature was computed over', async () => {
    const rawBody = Buffer.from('{"объект":"курс","emoji":"🎓"}', 'utf8');
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 202 }));
    await deliverClaimedKnowledgeSync(
      { id: 'outbox-1', eventId: 'event-1', rawBody },
      {
        endpoint: 'https://helixa.test',
        hmacKey: 'test-only-key',
        externalSystemId: 'system-1',
        request: createFetchRequest(fetchImpl as typeof fetch, 120_000),
      }
    );
    const sent = fetchImpl.mock.calls[0]?.[1]?.body as Uint8Array;
    expect(sent).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(sent).equals(rawBody)).toBe(true);
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({
      'X-Megacampus-Signature': `sha256=${createHmac('sha256', 'test-only-key').update(Buffer.from(sent)).digest('hex')}`,
    });
  });

  it('classifies retryable and terminal responses exactly', () => {
    expect(classifyDeliveryFailure({ kind: 'network', message: 'reset' })).toBe('retryable');
    for (const status of [408, 429, 500, 503])
      expect(classifyDeliveryFailure({ kind: 'http', status, message: 'failed' })).toBe(
        'retryable'
      );
    for (const status of [400, 401, 403, 404, 409, 422])
      expect(classifyDeliveryFailure({ kind: 'http', status, message: 'failed' })).toBe('terminal');
  });

  it('retries from persisted raw bytes without rebuilding or changing the event', async () => {
    const rawBody = Buffer.from('{"already":"frozen"}');
    const buildPackage = vi.fn();
    const repository = {
      persistRawBodyOnce: vi.fn(),
      markDelivered: vi.fn().mockResolvedValue(true),
      reschedule: vi.fn().mockResolvedValue(true),
      markTerminal: vi.fn().mockResolvedValue(true),
    };
    const request = vi.fn().mockResolvedValue({ status: 503, body: '' });
    const result = await processKnowledgeSyncOutboxEntry({
      entry: {
        id: 'outbox-1',
        eventId: 'event-1',
        objectKind: 'COURSE',
        objectId: courseId,
        organizationId,
        completedAt,
        rawBody,
        attempts: 2,
        leaseToken: 'lease-b',
        bindingId: 'binding-1',
      },
      buildPackage,
      repository,
      delivery: {
        endpoint: 'https://helixa.test/api/integrations/megacampus/knowledge-sync',
        hmacKey: 'key',
        externalSystemId: 'system-1',
        request,
      },
      now: new Date('2026-08-22T13:00:00.000Z'),
    });
    expect(result).toBe('retryable');
    expect(buildPackage).not.toHaveBeenCalled();
    expect(repository.persistRawBodyOnce).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ body: rawBody }));
    expect(repository.reschedule).toHaveBeenCalledWith(
      'outbox-1',
      'lease-b',
      expect.any(Date),
      'HTTP 503'
    );
  });

  it('treats stale worker A as lost lease after worker B reclaims and delivers', async () => {
    const repository = {
      persistRawBodyOnce: vi.fn(),
      markDelivered: vi.fn().mockResolvedValue(false),
      reschedule: vi.fn(),
      markTerminal: vi.fn(),
    };
    const result = await processKnowledgeSyncOutboxEntry({
      entry: {
        id: 'outbox-1',
        eventId: 'event-1',
        objectKind: 'COURSE',
        objectId: courseId,
        organizationId,
        completedAt,
        rawBody: Buffer.from('{}'),
        attempts: 2,
        leaseToken: 'lease-a',
        bindingId: 'binding-1',
      },
      buildPackage: vi.fn(),
      repository,
      delivery: {
        endpoint: 'https://helixa.test',
        hmacKey: 'key',
        externalSystemId: 'system',
        request: vi.fn().mockResolvedValue({ status: 202, body: '' }),
      },
    });
    expect(result).toBe('lost_lease');
    expect(repository.reschedule).not.toHaveBeenCalled();
    expect(repository.markTerminal).not.toHaveBeenCalled();
  });

  it('terminalizes deterministic preparation errors and caps transient retries with backoff', async () => {
    const repository = {
      persistRawBodyOnce: vi.fn(),
      markDelivered: vi.fn(),
      reschedule: vi.fn(),
      markTerminal: vi.fn().mockResolvedValue(true),
    };
    const baseEntry = {
      id: 'o1',
      eventId: 'e1',
      objectKind: 'COURSE' as const,
      objectId: courseId,
      organizationId,
      completedAt,
      rawBody: null,
      attempts: 1,
      leaseToken: 'lease',
      bindingId: 'binding-1',
    };
    expect(
      await processKnowledgeSyncOutboxEntry({
        entry: baseEntry,
        buildPackage: () => Promise.reject(new KnowledgeSyncPreparationError('provenance', false)),
        repository,
        delivery: { endpoint: 'x', hmacKey: 'k', externalSystemId: 's', request: vi.fn() },
      })
    ).toBe('terminal');
    expect(repository.markTerminal).toHaveBeenCalledWith(
      'o1',
      'lease',
      'Preparation requires operator action'
    );
    expect(computeRetryDelayMs(1, 'e1')).toBeLessThan(computeRetryDelayMs(5, 'e1'));

    repository.markTerminal.mockClear();
    expect(
      await processKnowledgeSyncOutboxEntry({
        entry: { ...baseEntry, attempts: 8 },
        buildPackage: () => Promise.reject(new KnowledgeSyncPreparationError('storage', true)),
        repository,
        delivery: { endpoint: 'x', hmacKey: 'k', externalSystemId: 's', request: vi.fn() },
      })
    ).toBe('terminal');
    expect(repository.markTerminal).toHaveBeenCalled();
  });

  it('migration atomically captures both completion transitions without changing job_outbox', async () => {
    const sql = await readFile(
      new URL(
        '../../../../supabase/migrations/20260822235900_helixa_knowledge_sync_outbox.sql',
        import.meta.url
      ),
      'utf8'
    );
    expect(sql).toContain('CREATE TABLE helixa_knowledge_sync_outbox');
    expect(sql).toContain(
      'AFTER INSERT OR UPDATE OF generation_status, generation_completed_at ON courses'
    );
    expect(sql).toContain('AFTER INSERT OR UPDATE OF status, completed_at ON career_playbooks');
    expect(sql).toContain("object_kind IN ('COURSE', 'ROLE_GUIDE')");
    expect(sql).toContain(
      "item.status = 'processing' AND item.last_attempt_at < NOW() - INTERVAL '15 minutes'"
    );
    expect(sql).toContain('destination_binding_id');
    expect(sql).toContain('claim_generation');
    expect(sql).toContain('lease_token');
    expect(sql).toContain('attempts = item.attempts + 1');
    expect(sql).toContain('claim_generation = item.claim_generation + 1');
    expect(sql).toContain('WHERE item.binding_id = p_binding_id');
    expect(sql).toContain("status = 'processing' AND lease_token = p_lease_token");
    expect(sql).toContain('reset_helixa_knowledge_sync_intent');
    expect(sql).not.toMatch(/reset_helixa_knowledge_sync_intent[\s\S]*raw_body\s*=\s*NULL/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+job_outbox/i);
  });

  it('reconciler defaults to dry-run and applies deterministic missing intents explicitly', async () => {
    const listCompleted = vi.fn().mockResolvedValue([
      { kind: 'COURSE' as const, id: 'c1', organizationId, completedAt },
      { kind: 'ROLE_GUIDE' as const, id: 'r1', organizationId, completedAt },
    ]);
    const insertMissing = vi.fn().mockResolvedValue(2);
    expect(
      await reconcileCompletedKnowledgeObjects({ listCompleted, insertMissing })
    ).toMatchObject({ dryRun: true, discovered: 2, inserted: 0 });
    expect(insertMissing).not.toHaveBeenCalled();
    expect(
      await reconcileCompletedKnowledgeObjects({ listCompleted, insertMissing }, { apply: true })
    ).toMatchObject({ dryRun: false, discovered: 2, inserted: 2 });
    expect(insertMissing).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ eventId: expect.stringMatching(/^mc2:COURSE:/) }),
        expect.objectContaining({ eventId: expect.stringMatching(/^mc2:ROLE_GUIDE:/) }),
      ])
    );
  });
});
