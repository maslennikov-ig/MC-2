import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LessonContentSchema } from '@megacampus/shared-types';

vi.mock('@/shared/supabase/admin', () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock('@/stages/stage1-document-upload/storage-paths', () => ({
  getUploadStorageRootPath: () => '/tmp/knowledge-sync-v2-test-uploads',
}));

import { getSupabaseAdmin } from '@/shared/supabase/admin';
import * as builder from '@/integrations/helixa/package-builder';
import * as runtime from '@/integrations/helixa/runtime-repository';
import * as schedulerModule from '@/integrations/helixa/scheduler';
import * as service from '@/integrations/helixa/service';
import { canonicalJson, sha256 } from '@/integrations/helixa/canonical-json';
import { processKnowledgeSyncOutboxEntry } from '@/integrations/helixa/outbox';
import type { KnowledgeSyncOutboxEntry } from '@/integrations/helixa/outbox';
import type { KnowledgeExportSnapshot } from '@/integrations/helixa/package-builder';

const schemaV2 = '2026-10-01.megacampus-knowledge-sync.v2';
const completedAt = '2026-09-30T09:00:00.000Z';
const createdAt = '2026-09-30T09:03:00.000Z';
const config = {
  endpoint: 'http://fake-receiver/knowledge-sync',
  hmacKey: 'test-only-key',
  externalSystemId: 'external-system',
  environment: 'test',
  externalProjectId: null,
  bindingId: 'binding',
  organizationId: 'org',
  destinationBindingId: 'destination',
  contractV2: true,
};
const bindingArgs = {
  p_binding_id: 'binding',
  p_organization_id: 'org',
  p_environment: 'test',
  p_destination_binding_id: 'destination',
};
const environment = {
  HELIXA_KNOWLEDGE_SYNC_ENDPOINT: config.endpoint,
  HELIXA_KNOWLEDGE_SYNC_HMAC_KEY: config.hmacKey,
  HELIXA_EXTERNAL_SYSTEM_ID: config.externalSystemId,
  HELIXA_KNOWLEDGE_SYNC_ENVIRONMENT: config.environment,
  HELIXA_KNOWLEDGE_SYNC_BINDING_ID: config.bindingId,
  HELIXA_KNOWLEDGE_SYNC_ORGANIZATION_ID: config.organizationId,
  HELIXA_DESTINATION_BINDING_ID: config.destinationBindingId,
};
function snapshot(overrides: Partial<KnowledgeExportSnapshot> = {}): KnowledgeExportSnapshot {
  return {
    kind: 'COURSE',
    id: 'course',
    organizationId: 'org',
    completedAt,
    title: 'Operations',
    language: 'ru',
    summaryMarkdown: '# Operations',
    structure: { chapters: ['Start'] },
    blocks: [],
    lessons: [{ lesson_id: 'lesson', content: { markdown: 'Run the checklist.' } }],
    ...overrides,
  };
}
function fingerprint(value = snapshot()): string {
  return sha256(
    canonicalJson({
      summaryMarkdown: value.summaryMarkdown,
      structure: value.structure,
      blocks: value.blocks,
      lessons: value.lessons,
    })
  );
}
function nativeLessonContent() {
  return {
    lesson_id: '00000000-0000-4000-8000-000000000001',
    course_id: '00000000-0000-4000-8000-000000000002',
    content: {
      intro: 'Read and apply this operations checklist before making a production change.',
      sections: [
        {
          title: 'Operations checklist',
          content:
            'Check the customer scope, confirm current state, and preserve source evidence before editing.',
        },
      ],
      examples: [
        {
          title: 'Example change',
          content: 'Change one scoped object and inspect the resulting behavior.',
        },
      ],
      exercises: [
        {
          question: 'Which source evidence must be preserved?',
          solution: 'Preserve the source identity and exact answerable body.',
        },
      ],
      interactive_elements: [
        {
          type: 'quiz',
          config: {
            status: 'answerable status',
            metadata: { explanation: 'Answerable body metadata' },
            updated_at: 'semantic timestamp',
          },
        },
      ],
    },
    metadata: {
      total_words: 100,
      total_tokens: 250,
      cost_usd: 0.01,
      quality_score: 0.9,
      rag_chunks_used: 1,
      generation_duration_ms: 300,
      model_used: 'generation-model',
      archetype_used: 'concept_explainer',
      temperature_used: 0.5,
      qa_signals: { version: 1, lesson_flags: ['service-only-flag'] },
    },
    status: 'completed',
    created_at: completedAt,
    updated_at: createdAt,
  };
}
function entry(overrides: Partial<KnowledgeSyncOutboxEntry> = {}): KnowledgeSyncOutboxEntry {
  return {
    id: 'outbox',
    eventId: 'mc2:COURSE:org:course:UPDATED:4',
    objectKind: 'COURSE',
    objectId: 'course',
    organizationId: 'org',
    completedAt,
    attempts: 1,
    rawBody: null,
    leaseToken: 'lease',
    bindingId: 'binding',
    contractVersion: 2,
    eventType: 'COURSE_UPDATED',
    revision: 4,
    retractionReason: null,
    contentHash: fingerprint(),
    createdAt,
    snapshot: snapshot(),
    ...overrides,
  };
}
function repository() {
  return {
    persistRawBodyOnce: vi.fn(async (_id, _lease, bytes: Buffer) => bytes),
    markDelivered: vi.fn().mockResolvedValue(true),
    reschedule: vi.fn().mockResolvedValue(true),
    markTerminal: vi.fn().mockResolvedValue(true),
  };
}
function inventory(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    kind: i % 2 ? ('ROLE_GUIDE' as const) : ('COURSE' as const),
    id: `object-${i}`,
    revision: i + 1,
    contentHash: 'a'.repeat(64),
  }));
}
async function flush() {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}

beforeEach(() => vi.mocked(getSupabaseAdmin).mockReset());

describe('knowledge-sync v2 exact contract', () => {
  it('requires exact true independently of the scheduler opt-in', () => {
    for (const value of [undefined, 'false', 'TRUE', '1', ' true ']) {
      expect(
        runtime.isKnowledgeSyncContractV2Enabled({ HELIXA_KNOWLEDGE_SYNC_CONTRACT_V2: value })
      ).toBe(false);
    }
    expect(
      runtime.isKnowledgeSyncContractV2Enabled({ HELIXA_KNOWLEDGE_SYNC_CONTRACT_V2: 'true' })
    ).toBe(true);
    expect(
      runtime.readKnowledgeSyncRuntimeConfig({
        ...environment,
        HELIXA_KNOWLEDGE_SYNC_CONTRACT_V2: 'true',
      }).contractV2
    ).toBe(true);
    expect(runtime.readKnowledgeSyncRuntimeConfig(environment)).not.toHaveProperty('contractV2');
    expect(
      schedulerModule.isKnowledgeSyncDeliverySchedulerEnabled({
        HELIXA_KNOWLEDGE_SYNC_CONTRACT_V2: 'true',
      })
    ).toBe(false);
  });

  it.each(['COURSE', 'ROLE_GUIDE'] as const)(
    'sends a full %s UPDATED package with pinned revision and matching DB hash',
    async kind => {
      const value = snapshot({ kind });
      const intent = entry({
        objectKind: kind,
        eventType: `${kind}_UPDATED`,
        eventId: `mc2:${kind}:org:course:UPDATED:4`,
        snapshot: value,
        contentHash: fingerprint(value),
      });
      const result = await builder.buildKnowledgeSyncV2Package(value, intent, config);
      expect(result).toMatchObject({
        schemaVersion: schemaV2,
        eventType: `${kind}_UPDATED`,
        eventId: intent.eventId,
        object: { kind, revision: 4, status: 'completed', version: completedAt },
        content: { summaryMarkdown: '# Operations' },
        hashes: { contentHash: intent.contentHash },
      });
      expect(result.sourceDocuments).toHaveLength(1);
      expect(result.evidenceSegments).not.toHaveLength(0);
      expect(JSON.parse(builder.serializeKnowledgeSyncPackage(result).toString())).toEqual(result);
    }
  );

  it('rejects wrong revisions, event-kind identity and inconsistent snapshot fingerprints', async () => {
    for (const intent of [
      entry({ revision: 0 }),
      entry({ revision: 1.5 }),
      entry({ eventType: 'ROLE_GUIDE_UPDATED' }),
      entry({ contentHash: 'b'.repeat(64) }),
    ]) {
      await expect(
        builder.buildKnowledgeSyncV2Package(snapshot(), intent, config)
      ).rejects.toThrow();
    }
  });

  it('removes lesson/block processing metadata from v2 while preserving v1 bytes', async () => {
    const value = snapshot({
      lessons: [
        {
          lesson_id: 'lesson',
          content: { markdown: 'Answerable' },
          metadata: { cost: 123, status: 'processing' },
        },
      ],
      blocks: [
        {
          key: 'intro',
          value: {
            content: 'Answerable block',
            status: 'completed',
            metadata: { tokens: 500 },
            model_used: 'worker-model',
            duration_ms: 100,
          },
        },
      ],
    });
    const normalized = snapshot({
      lessons: [{ lesson_id: 'lesson', content: { markdown: 'Answerable' } }],
      blocks: [{ key: 'intro', value: { content: 'Answerable block' } }],
    });
    const before = await builder.buildKnowledgeSyncPackage(value, config);
    const original = builder.serializeKnowledgeSyncPackage(before);
    const result = await builder.buildKnowledgeSyncV2Package(
      value,
      entry({ contentHash: fingerprint(normalized) }),
      config
    );
    expect(result.content.lessons).toEqual(normalized.lessons);
    expect(result.content.blocks).toEqual(normalized.blocks);
    expect(before.content.lessons[0]).toHaveProperty('metadata');
    expect(
      builder
        .serializeKnowledgeSyncPackage(await builder.buildKnowledgeSyncPackage(value, config))
        .equals(original)
    ).toBe(true);
    expect(before.schemaVersion).toBe('2026-06-16.megacampus-knowledge-sync.v1');
    expect(before.object).not.toHaveProperty('revision');
  });

  it('normalizes real native LessonContent telemetry while preserving identity, semantic body and v1 bytes', async () => {
    const raw = nativeLessonContent();
    expect(LessonContentSchema.safeParse(raw).success).toBe(true);
    const markdown = '\uFEFF\u00A0# Answerable rendered lesson\n';
    const value = snapshot({
      id: raw.course_id,
      lessons: [
        {
          lesson_id: raw.lesson_id,
          content: raw,
          metadata: { markdownContent: markdown, cost: 40, status: 'processing' },
        },
      ],
    });
    const normalized = {
      ...value,
      lessons: [
        {
          lesson_id: raw.lesson_id,
          content: { lesson_id: raw.lesson_id, course_id: raw.course_id, content: raw.content },
          metadata: { markdownContent: markdown },
        },
      ],
    };
    const intent = entry({
      objectId: value.id,
      eventId: `mc2:COURSE:org:${value.id}:UPDATED:4`,
      contentHash: fingerprint(normalized),
    });
    const legacyBefore = builder.serializeKnowledgeSyncPackage(
      await builder.buildKnowledgeSyncPackage(value, config)
    );
    const result = await builder.buildKnowledgeSyncV2Package(value, intent, config);
    expect(result.content.lessons).toEqual(normalized.lessons);
    const changedTelemetry = {
      ...value,
      lessons: [
        {
          lesson_id: raw.lesson_id,
          content: {
            ...raw,
            metadata: { ...raw.metadata, cost_usd: 0.09, model_used: 'another-model' },
            status: 'review_required',
            created_at: createdAt,
            updated_at: '2026-10-01T00:00:00.000Z',
          },
          metadata: { markdownContent: markdown, cost: 999, retryCount: 4 },
        },
      ],
    };
    const after = await builder.buildKnowledgeSyncV2Package(changedTelemetry, intent, config);
    expect(
      builder
        .serializeKnowledgeSyncPackage(after)
        .equals(builder.serializeKnowledgeSyncPackage(result))
    ).toBe(true);
    const legacyAfter = await builder.buildKnowledgeSyncPackage(value, config);
    expect(legacyAfter.content.lessons[0].content).toEqual(raw);
    expect(builder.serializeKnowledgeSyncPackage(legacyAfter).equals(legacyBefore)).toBe(true);
    expect((result.content.lessons[0].content as typeof raw).content.interactive_elements).toEqual(
      raw.content.interactive_elements
    );
  });

  it('retains answerable outer markdown edits and excludes only unusable outer markdown', async () => {
    const raw = nativeLessonContent();
    const hashes: string[] = [];
    const cases = [
      {
        markdown: '\uFEFF # Original rendered lesson\n',
        retained: '\uFEFF # Original rendered lesson\n',
      },
      { markdown: '# Edited rendered lesson\n', retained: '# Edited rendered lesson\n' },
      { markdown: '\uFEFF\u00A0\u2003\n', retained: undefined },
      { markdown: 42, retained: undefined },
    ];
    for (const testCase of cases) {
      const value = snapshot({
        id: raw.course_id,
        lessons: [
          {
            lesson_id: raw.lesson_id,
            content: raw,
            metadata: { markdownContent: testCase.markdown, modelUsed: 'service-only' },
          },
        ],
      });
      const normalized = {
        ...value,
        lessons: [
          {
            lesson_id: raw.lesson_id,
            content: { lesson_id: raw.lesson_id, course_id: raw.course_id, content: raw.content },
            ...(testCase.retained === undefined
              ? {}
              : { metadata: { markdownContent: testCase.retained } }),
          },
        ],
      };
      const result = await builder.buildKnowledgeSyncV2Package(
        value,
        entry({
          objectId: value.id,
          eventId: `mc2:COURSE:org:${value.id}:UPDATED:4`,
          contentHash: fingerprint(normalized),
        }),
        config
      );
      expect(result.content.lessons).toEqual(normalized.lessons);
      hashes.push(result.hashes.contentHash);
    }
    expect(hashes[0]).not.toBe(hashes[1]);
    expect(hashes[2]).toBe(hashes[3]);
  });

  it.each(['deleted', 'unpublished', 'visibility_restricted', 'generation_reverted'] as const)(
    'builds the exact content-free tombstone for %s solely from the intent',
    reason => {
      const intent = entry({
        eventId: 'mc2:COURSE:org:course:RETRACTED:5',
        eventType: 'COURSE_RETRACTED',
        revision: 5,
        retractionReason: reason,
        snapshot: null,
        contentHash: null,
      });
      const value = builder.buildKnowledgeSyncTombstone(intent, config);
      expect(value).toEqual({
        schemaVersion: schemaV2,
        eventId: intent.eventId,
        eventType: 'COURSE_RETRACTED',
        sentAt: createdAt,
        producer: { system: 'megacampus', environment: 'test', organizationId: 'org' },
        object: { kind: 'COURSE', id: 'course', revision: 5, status: 'retracted', reason },
      });
      expect(Object.keys(value).sort()).toEqual([
        'eventId',
        'eventType',
        'object',
        'producer',
        'schemaVersion',
        'sentAt',
      ]);
      expect(JSON.parse(builder.serializeKnowledgeSyncPackage(value).toString())).toEqual(value);
    }
  );
});

describe('v2 protocol-pinned delivery', () => {
  it('delivers a full v2 update from the frozen semantic snapshot through the real outbox path', async () => {
    const request = vi.fn().mockResolvedValue({ status: 200, body: '{}' });
    const repo = repository();
    const from = vi.fn(() => {
      throw new Error('current native content must not be read');
    });
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as never);
    expect(
      await service.runKnowledgeSyncDeliveryBatch({
        dependencies: {
          config,
          claim: async () => [entry()],
          repository: repo,
          request,
        },
      })
    ).toEqual([{ id: 'outbox', result: 'delivered' }]);
    const wire = JSON.parse(request.mock.calls[0][0].body.toString());
    expect(wire).toMatchObject({
      schemaVersion: schemaV2,
      eventType: 'COURSE_UPDATED',
      object: { revision: 4 },
      hashes: { contentHash: fingerprint() },
    });
    expect(repo.persistRawBodyOnce).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });

  it('delivers a deletion without loading the missing snapshot and without wire hashes', async () => {
    const loadSnapshot = vi.fn().mockRejectedValue(new Error('deleted snapshot must not be read'));
    const request = vi.fn().mockResolvedValue({ status: 200, body: '{}' });
    const repo = repository();
    const result = await service.runKnowledgeSyncDeliveryBatch({
      dependencies: {
        config,
        claim: async () => [
          entry({
            eventId: 'mc2:COURSE:org:course:RETRACTED:5',
            eventType: 'COURSE_RETRACTED',
            revision: 5,
            retractionReason: 'deleted',
            snapshot: null,
            contentHash: null,
          }),
        ],
        loadSnapshot,
        repository: repo,
        request,
      },
    });
    expect(result).toEqual([{ id: 'outbox', result: 'delivered' }]);
    expect(loadSnapshot).not.toHaveBeenCalled();
    const wire = JSON.parse(request.mock.calls[0][0].body.toString());
    expect(wire.eventType).toBe('COURSE_RETRACTED');
    expect(wire).not.toHaveProperty('hashes');
    expect(repo.persistRawBodyOnce).toHaveBeenCalledWith(
      'outbox',
      'lease',
      expect.any(Buffer),
      sha256(request.mock.calls[0][0].body)
    );
  });

  it('loads frozen semantic content and does not read current native rows for an old revision', async () => {
    const from = vi.fn(() => {
      throw new Error('current native row must not be read');
    });
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as never);
    const value = await runtime.loadKnowledgeSnapshot(entry());
    expect(value).toMatchObject(snapshot());
    expect(from).not.toHaveBeenCalled();
    const result = await builder.buildKnowledgeSyncV2Package(value, entry(), config);
    expect(result.object.revision).toBe(4);
  });

  it('resolves pinned text sources without a DB/file lookup and retains full evidence', async () => {
    const text = 'Pinned primary source.';
    const value = snapshot();
    const intent = entry({
      snapshot: {
        ...value,
        sources: [
          {
            id: 'text-source',
            sourceType: 'career_playbook_source',
            organizationId: 'org',
            objectKind: 'COURSE',
            objectId: 'course',
            approved: true,
            version: sha256(text),
            sourceSha256: sha256(text),
            fileName: 'source.txt',
            mediaType: 'text/plain',
            originalText: text,
            trustedMarkdown: text,
          },
        ],
      },
    });
    const from = vi.fn(() => {
      throw new Error('current rows must not be read');
    });
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as never);
    const mapped = await runtime.loadKnowledgeSnapshot(intent);
    const result = await builder.buildKnowledgeSyncV2Package(mapped, intent, config);
    expect(result.sourceDocuments.some(source => source.authority === 'primary_source')).toBe(true);
    expect(result.evidenceSegments.some(segment => segment.text === text)).toBe(true);
    expect(from).not.toHaveBeenCalled();
  });

  it('preserves a valid same-object native origin through another delivery binding', async () => {
    const origin = {
      binding_id: 'origin-binding',
      command_id: `megacampus_generation_command:create_job_instruction:v1:${'a'.repeat(64)}`,
      command_kind: 'CREATE_JOB_INSTRUCTION' as const,
      proposal_id: 'approved-proposal',
      approved_revision: 2,
      proposal_payload_hash: 'b'.repeat(64),
      object_kind: 'ROLE_GUIDE' as const,
      object_id: 'course',
      organization_id: 'org',
      status: 'native_completed',
    };
    const value = snapshot({ kind: 'ROLE_GUIDE' });
    const intent = entry({
      objectKind: 'ROLE_GUIDE',
      bindingId: 'another-delivery-binding',
      eventType: 'ROLE_GUIDE_UPDATED',
      eventId: 'mc2:ROLE_GUIDE:org:course:UPDATED:4',
      contentHash: fingerprint(value),
      snapshot: { ...value, _generationOrigin: origin },
    });
    const mapped = await runtime.loadKnowledgeSnapshot(intent);
    const result = await builder.buildKnowledgeSyncV2Package(mapped, intent, config);
    expect(result.originCommand).toMatchObject({
      commandId: origin.command_id,
      operation: 'CREATE_JOB_INSTRUCTION',
      approvedRevision: 2,
    });
    await expect(
      runtime.loadKnowledgeSnapshot({
        ...intent,
        snapshot: {
          ...value,
          _generationOrigin: { ...origin, organization_id: 'another-org' },
        },
      })
    ).rejects.toThrow(/provenance/);
  });

  it('resolves governed virtual source bytes from pinned proofs and rejects forged source provenance', async () => {
    const text = 'Pinned role guide body.';
    const hash = sha256(text);
    const commandId = `megacampus_generation_command:create_course_from_job_instruction:v1:${'a'.repeat(64)}`;
    const source = {
      id: 'file',
      sourceType: 'file_catalog' as const,
      organizationId: 'org',
      objectKind: 'COURSE' as const,
      objectId: 'course',
      approved: true,
      version: hash,
      sourceSha256: hash,
      fileId: 'file',
      fileName: 'guide.md',
      mediaType: 'text/markdown',
      storagePath: `helixa-generation://role-guide/guide/${hash}`,
      trustedMarkdown: text,
      _file: {
        id: 'file',
        organization_id: 'org',
        course_id: 'course',
        filename: 'guide.md',
        mime_type: 'text/markdown',
        hash,
        storage_path: `helixa-generation://role-guide/guide/${hash}`,
        markdown_content: text,
        processed_content: text,
        summary_metadata: { source: 'helixa_role_guide', source_version_hash: hash },
      },
      _nativeProof: {
        course_id: 'course',
        organization_id: 'org',
        file_catalog_id: 'file',
        source_canonical_content: text,
        source_content_hash: hash,
      },
    };
    const frozen = {
      ...snapshot(),
      sources: [source],
      _generationOrigin: {
        binding_id: 'origin-binding',
        command_id: commandId,
        command_kind: 'CREATE_COURSE_FROM_JOB_INSTRUCTION' as const,
        proposal_id: 'approved',
        approved_revision: 1,
        proposal_payload_hash: 'b'.repeat(64),
        object_kind: 'COURSE' as const,
        object_id: 'course',
        organization_id: 'org',
        status: 'native_completed',
      },
      _jobInstructionSource: {
        course_id: 'course',
        organization_id: 'org',
        job_instruction_id: 'guide',
        source_version: 'source-version',
        source_content_hash: hash,
        origin_binding_id: 'origin-binding',
        origin_command_id: commandId,
      },
    };
    const intent = entry({ snapshot: frozen });
    const mapped = await runtime.loadKnowledgeSnapshot(intent);
    const result = await builder.buildKnowledgeSyncV2Package(mapped, intent, config);
    const primary = result.sourceDocuments.find(
      document => document.authority === 'primary_source'
    );
    expect(Buffer.from(primary!.artifacts[0].content, 'base64').toString()).toBe(text);
    expect(result.relations[0]).toMatchObject({
      type: 'COURSE_FROM_ROLE_GUIDE',
      toKey: 'ROLE_GUIDE:guide',
    });
    const forged = await runtime.loadKnowledgeSnapshot(
      entry({
        snapshot: {
          ...frozen,
          sources: [
            { ...source, _nativeProof: { ...source._nativeProof, organization_id: 'other-org' } },
          ],
        },
      })
    );
    await expect(builder.buildKnowledgeSyncV2Package(forged, intent, config)).rejects.toThrow(
      /provenance/
    );
  });

  it('pauses frozen v1 while v2 is enabled and preserves its exact bytes for flag-off delivery', async () => {
    const request = vi.fn().mockResolvedValue({ status: 202, body: '' });
    const legacyBody = Buffer.from('{"legacy":"frozen"}');
    const frozenV2 = Buffer.from('{"schemaVersion":"2026-10-01.megacampus-knowledge-sync.v2"}');
    const loadSnapshot = vi.fn();
    const repo = repository();
    const results = await service.runKnowledgeSyncDeliveryBatch({
      dependencies: {
        config,
        claim: async () => [
          entry({ id: 'legacy', contractVersion: 1, eventId: 'legacy-event', rawBody: legacyBody }),
        ],
        loadSnapshot,
        repository: repo,
        request,
      },
    });
    expect(results).toEqual([]);
    expect(request).not.toHaveBeenCalled();
    expect(repo.persistRawBodyOnce).not.toHaveBeenCalled();
    const restoredV1 = await service.runKnowledgeSyncDeliveryBatch({
      dependencies: {
        config: { ...config, contractV2: false },
        claim: async () => [
          entry({ id: 'legacy', contractVersion: 1, eventId: 'legacy-event', rawBody: legacyBody }),
        ],
        loadSnapshot,
        repository: repo,
        request,
      },
    });
    expect(restoredV1).toEqual([{ id: 'legacy', result: 'delivered' }]);
    expect(request.mock.calls[0][0].body.equals(legacyBody)).toBe(true);
    request.mockClear();
    const disabled = await service.runKnowledgeSyncDeliveryBatch({
      dependencies: {
        config: { ...config, contractV2: false },
        claim: async () => [entry({ rawBody: frozenV2 })],
        loadSnapshot,
        repository: repo,
        request,
      },
    });
    expect(disabled).toEqual([]);
    expect(request).not.toHaveBeenCalled();
    expect(loadSnapshot).not.toHaveBeenCalled();
  });

  it('does not let a delayed frozen v1 overwrite an already-materialized v2 object', async () => {
    const legacy = await builder.buildKnowledgeSyncPackage(
      snapshot({ summaryMarkdown: '# Older v1 answer' }),
      config
    );
    const frozenBody = builder.serializeKnowledgeSyncPackage(legacy);
    let materialized = '# Current revision 4 answer';
    const request = vi.fn(async input => {
      const wire = JSON.parse(input.body.toString());
      materialized = wire.content.summaryMarkdown;
      return { status: 200, body: '{}' };
    });
    const result = await service.runKnowledgeSyncDeliveryBatch({
      dependencies: {
        config,
        claim: async () => [
          entry({ contractVersion: 1, eventId: legacy.eventId, rawBody: frozenBody }),
        ],
        repository: repository(),
        request,
      },
    });
    expect(result).toEqual([]);
    expect(request).not.toHaveBeenCalled();
    expect(materialized).toBe('# Current revision 4 answer');
    expect(frozenBody.equals(builder.serializeKnowledgeSyncPackage(legacy))).toBe(true);
  });

  it('retries an already-frozen tombstone with exactly the original signed bytes', async () => {
    const value = builder.buildKnowledgeSyncTombstone(
      entry({
        eventType: 'COURSE_RETRACTED',
        eventId: 'mc2:COURSE:org:course:RETRACTED:4',
        retractionReason: 'deleted',
      }),
      config
    );
    const bytes = builder.serializeKnowledgeSyncPackage(value);
    const buildPackage = vi.fn();
    const request = vi.fn().mockResolvedValue({ status: 503, body: '' });
    const repo = repository();
    expect(
      await processKnowledgeSyncOutboxEntry({
        entry: entry({ rawBody: bytes }),
        buildPackage,
        repository: repo,
        delivery: { ...config, request },
      })
    ).toBe('retryable');
    expect(buildPackage).not.toHaveBeenCalled();
    expect(request.mock.calls[0][0].body.equals(bytes)).toBe(true);
  });
});

describe('current organization manifest', () => {
  it.each([0, 1, 1000, 1001, 2501])(
    'sends every object exactly once across bounded pages for %i objects',
    count => {
      const objects = inventory(count);
      const pages = builder.buildKnowledgeSyncManifestPages(objects, {
        ...config,
        manifestId: 'manifest',
        sentAt: createdAt,
      });
      expect(pages).toHaveLength(Math.max(1, Math.ceil(count / 1000)));
      expect(pages.flatMap(page => page.manifest.objects)).toEqual(objects);
      pages.forEach((page, i) => {
        expect(page).toMatchObject({
          schemaVersion: schemaV2,
          eventType: 'KNOWLEDGE_MANIFEST',
          producer: { organizationId: 'org' },
          manifest: { manifestId: 'manifest', pageIndex: i, pageCount: pages.length },
        });
        expect(page.manifest.objects.length).toBeLessThanOrEqual(1000);
        expect(JSON.parse(builder.serializeKnowledgeSyncPackage(page).toString())).toEqual(page);
      });
    }
  );

  it('rejects duplicate or malformed inventory before sending a partial manifest', async () => {
    const request = vi.fn();
    await expect(
      service.runKnowledgeSyncManifest({
        dependencies: {
          config,
          loadInventory: async () => [inventory(1)[0], inventory(1)[0]],
          request,
        },
      })
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
    expect(() =>
      builder.buildKnowledgeSyncManifestPages([{ ...inventory(1)[0], revision: 0 }], {
        ...config,
        manifestId: 'manifest',
        sentAt: createdAt,
      })
    ).toThrow();
  });

  it('loads a single complete inventory RPC snapshot rather than a capped table scan', async () => {
    const objects = inventory(2501);
    const rpc = vi.fn().mockResolvedValue({ data: objects, error: null });
    const from = vi.fn();
    vi.mocked(getSupabaseAdmin).mockReturnValue({ rpc, from } as never);
    expect(await runtime.loadKnowledgeSyncManifestInventory(config)).toEqual(objects);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('get_helixa_knowledge_sync_manifest', bindingArgs);
    expect(from).not.toHaveBeenCalled();
  });

  it('uses the event HMAC route and only last-page resend feedback with current-revision enqueue', async () => {
    const objects = inventory(1001);
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        body: JSON.stringify({
          status: 'partial',
          resend: [{ kind: 'COURSE', id: 'ignored-first-page' }],
          retracted: 0,
        }),
      })
      .mockResolvedValueOnce({
        status: 200,
        body: JSON.stringify({
          status: 'accepted',
          resend: [{ kind: 'COURSE', id: 'object-0' }],
          retracted: 2,
        }),
      });
    const enqueueResend = vi.fn().mockResolvedValue(1);
    const result = await service.runKnowledgeSyncManifest({
      manifestId: 'manifest',
      sentAt: createdAt,
      dependencies: { config, loadInventory: async () => objects, enqueueResend, request },
    });
    expect(result).toMatchObject({ pageCount: 2, objects: 1001, enqueued: 1, retracted: 2 });
    expect(enqueueResend).toHaveBeenCalledExactlyOnceWith(config, [
      { kind: 'COURSE', id: 'object-0' },
    ]);
    for (const [input] of request.mock.calls) {
      expect(input.url).toBe(config.endpoint);
      expect(input.headers['X-Megacampus-Signature']).toBe(
        `sha256=${createHmac('sha256', config.hmacKey).update(input.body).digest('hex')}`
      );
    }
  });

  it('routes resend through DB eligibility/current revision, with no local revision bump', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue({ rpc } as never);
    const requested = [
      { kind: 'COURSE' as const, id: 'deleted-after-manifest' },
      { kind: 'ROLE_GUIDE' as const, id: 'currently-readable-private' },
    ];
    expect(await runtime.enqueueKnowledgeSyncManifestResend(config, requested)).toBe(1);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('enqueue_helixa_knowledge_sync_v2_resend', {
      ...bindingArgs,
      p_objects: requested,
    });
  });

  it('passes a final resend list larger than 1000 through without imposing a wire response cap', async () => {
    const requested = inventory(1001).map(({ kind, id }) => ({ kind, id }));
    const rpc = vi.fn().mockResolvedValue({ data: 1001, error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue({ rpc } as never);
    expect(await runtime.enqueueKnowledgeSyncManifestResend(config, requested)).toBe(1001);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('enqueue_helixa_knowledge_sync_v2_resend', {
      ...bindingArgs,
      p_objects: requested,
    });
  });

  it('does not enqueue resend after a failed page or malformed last-page feedback', async () => {
    const enqueueResend = vi.fn();
    for (const response of [
      { status: 503, body: '' },
      {
        status: 200,
        body: JSON.stringify({
          status: 'accepted',
          resend: [{ kind: 'UNKNOWN', id: 'bad' }],
          retracted: 0,
        }),
      },
    ]) {
      await expect(
        service.runKnowledgeSyncManifest({
          dependencies: {
            config,
            loadInventory: async () => inventory(1),
            enqueueResend,
            request: vi.fn().mockResolvedValue(response),
          },
        })
      ).rejects.toThrow();
    }
    expect(enqueueResend).not.toHaveBeenCalled();
  });

  it('fails without sending after inventory read failure', async () => {
    const request = vi.fn();
    await expect(
      service.runKnowledgeSyncManifest({
        dependencies: {
          config,
          loadInventory: vi.fn().mockRejectedValue(new Error('inventory unavailable')),
          request,
        },
      })
    ).rejects.toThrow('inventory unavailable');
    expect(request).not.toHaveBeenCalled();
  });
});

describe('v2 maintenance and durable capture mode', () => {
  it('preserves an injected clock receiver and retries a synchronous non-Error maintenance failure', async () => {
    let tick!: () => void;
    const onFailure = vi.fn();
    const runMaintenance = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => {
        throw 'temporary maintenance rejection';
      })
      .mockResolvedValue(undefined);
    const options = {
      enabled: true,
      clock: 1000,
      now(this: { clock: number }) {
        return this.clock;
      },
      runMaintenance,
      onFailure,
      timers: {
        setInterval: vi.fn((callback: () => void) => {
          tick = callback;
          return 'timer' as never;
        }),
        clearInterval: vi.fn(),
      },
    };
    const scheduler = schedulerModule.createKnowledgeSyncMaintenanceScheduler(options);
    expect(scheduler.start()).toBe(true);
    await flush();
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        cause: 'temporary maintenance rejection',
      })
    );
    expect(onFailure.mock.calls[0][0]).toBeInstanceOf(Error);
    tick();
    await flush();
    expect(runMaintenance).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('preserves the caller receiver when reporting scheduler maintenance failures', async () => {
    const receivers: unknown[] = [];
    const reported: unknown[] = [];
    const failure = new Error('temporary reconciliation error');
    const options = {
      environment: {
        ...environment,
        HELIXA_KNOWLEDGE_SYNC_CONTRACT_V2: 'true',
        HELIXA_KNOWLEDGE_SYNC_SCHEDULER_ENABLED: 'true',
      },
      onMaintenanceFailure(error: unknown) {
        receivers.push(this);
        reported.push(error);
      },
      dependencies: {
        synchronizeCaptureGate: vi.fn().mockResolvedValue(undefined),
        runBatch: vi.fn().mockResolvedValue([]),
        runReconciler: vi.fn().mockRejectedValue(failure),
        timers: { setInterval: vi.fn().mockReturnValue('timer'), clearInterval: vi.fn() },
      },
    };
    const scheduler = await service.startKnowledgeSyncDeliveryScheduler(options);
    await flush();
    expect(receivers).toEqual([options]);
    expect(reported).toEqual([failure]);
    scheduler?.stop();
  });

  it('returns the exact DB v2 reconciliation metrics instead of assuming the v1 result shape', async () => {
    const metrics = { missing: 3, inserted: 2, applied: true };
    const rpc = vi.fn().mockResolvedValue({ data: metrics, error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue({ rpc } as never);
    expect(await runtime.runSupabaseKnowledgeSyncV2Reconciler(config, true)).toEqual(metrics);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('reconcile_helixa_knowledge_sync_v2', {
      ...bindingArgs,
      p_apply: true,
    });
  });

  it('keeps v1 working before the v2 migration exists but fails closed for v2 activation', async () => {
    const rpc = vi.fn(async name =>
      name === 'set_helixa_knowledge_sync_v2_enabled'
        ? { data: null, error: { code: 'PGRST202', message: 'RPC not present in schema cache' } }
        : { data: [], error: null }
    );
    vi.mocked(getSupabaseAdmin).mockReturnValue({ rpc } as never);
    await expect(
      runtime.claimKnowledgeSyncOutbox({ ...config, contractV2: false })
    ).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledWith('claim_helixa_knowledge_sync_outbox', expect.anything());
    rpc.mockClear();
    await expect(runtime.claimKnowledgeSyncOutbox(config)).rejects.toThrow(/capture mode/);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('does not claim anything after an installed capture-gate error in either mode', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'binding authority refused' },
    });
    vi.mocked(getSupabaseAdmin).mockReturnValue({ rpc } as never);
    for (const contractV2 of [false, true]) {
      rpc.mockClear();
      await expect(runtime.claimKnowledgeSyncOutbox({ ...config, contractV2 })).rejects.toThrow(
        /capture mode/
      );
      expect(rpc).toHaveBeenCalledTimes(1);
    }
  });

  it('mirrors the exact mode before claims and keeps legacy/v2 claims separate across off/on/off', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const legacyBytes = Buffer.from('{"v1":"immutable"}');
    const row = {
      id: 'legacy',
      event_id: 'legacy-event',
      object_kind: 'COURSE',
      object_id: 'course',
      organization_id: 'org',
      completed_at: completedAt,
      raw_body_base64: legacyBytes.toString('base64'),
      attempts: 1,
      lease_token: 'lease',
      binding_id: 'binding',
    };
    const rpc = vi.fn(async (name, args) => {
      calls.push({ name, args });
      return {
        data:
          name === 'set_helixa_knowledge_sync_v2_enabled'
            ? true
            : name === 'claim_helixa_knowledge_sync_outbox'
              ? [row]
              : [],
        error: null,
      };
    });
    vi.mocked(getSupabaseAdmin).mockReturnValue({ rpc } as never);
    for (const enabled of [false, true, false]) {
      calls.length = 0;
      const result = await runtime.claimKnowledgeSyncOutbox({ ...config, contractV2: enabled }, 10);
      expect(calls[0]).toEqual({
        name: 'set_helixa_knowledge_sync_v2_enabled',
        args: { ...bindingArgs, p_enabled: enabled },
      });
      expect(calls).toHaveLength(2);
      expect(calls[1]).toEqual({
        name: enabled
          ? 'claim_helixa_knowledge_sync_v2_outbox'
          : 'claim_helixa_knowledge_sync_outbox',
        args: { ...bindingArgs, p_batch_size: 10 },
      });
      if (enabled) expect(result).toEqual([]);
      else expect(result[0].rawBody?.equals(legacyBytes)).toBe(true);
    }
  });

  it('sends a manifest after every v2 reconciler invocation including dry-run and failure', async () => {
    const synchronizeCaptureGate = vi.fn().mockResolvedValue(undefined);
    const runV2Reconciler = vi.fn().mockResolvedValue({ dryRun: true, discovered: 1, inserted: 0 });
    const sendManifest = vi.fn().mockResolvedValue({ pageCount: 1 });
    for (const apply of [undefined, false, true]) {
      await service.runKnowledgeSyncReconciler({
        apply,
        dependencies: {
          config,
          synchronizeCaptureGate,
          runV2Reconciler,
          sendManifest,
        },
      });
    }
    expect(sendManifest).toHaveBeenCalledTimes(3);
    expect(runV2Reconciler.mock.calls.map(call => call[1])).toEqual([false, false, true]);
    runV2Reconciler.mockRejectedValueOnce(new Error('reconcile failed'));
    await expect(
      service.runKnowledgeSyncReconciler({
        dependencies: {
          config,
          synchronizeCaptureGate,
          runV2Reconciler,
          sendManifest,
        },
      })
    ).rejects.toThrow('reconcile failed');
    expect(sendManifest).toHaveBeenCalledTimes(4);
  });

  it('runs reconciliation apply:true immediately and hourly, without overlap, and retries failures', async () => {
    let tick!: () => void;
    let now = 0;
    let running = Promise.withResolvers<void>();
    const runMaintenance = vi.fn(() => running.promise);
    const clearInterval = vi.fn();
    const onFailure = vi.fn();
    const scheduler = schedulerModule.createKnowledgeSyncMaintenanceScheduler({
      enabled: true,
      intervalMs: 100,
      maintenanceIntervalMs: 3_600_000,
      now: () => now,
      runMaintenance,
      onFailure,
      timers: {
        setInterval: vi.fn(callback => {
          tick = callback;
          return 'timer' as never;
        }),
        clearInterval,
      },
    });
    scheduler.start();
    expect(runMaintenance).toHaveBeenCalledTimes(1);
    tick();
    tick();
    expect(runMaintenance).toHaveBeenCalledTimes(1);
    running.reject(new Error('temporary maintenance failure'));
    await flush();
    running = Promise.withResolvers<void>();
    tick();
    expect(runMaintenance).toHaveBeenCalledTimes(2);
    running.resolve();
    await flush();
    now = 3_599_999;
    tick();
    expect(runMaintenance).toHaveBeenCalledTimes(2);
    now = 3_600_000;
    tick();
    expect(runMaintenance).toHaveBeenCalledTimes(3);
    expect(onFailure).toHaveBeenCalledTimes(1);
    scheduler.stop();
    expect(clearInterval).toHaveBeenCalledWith('timer');
    running.resolve();
    await flush();
    now += 3_600_000;
    tick();
    expect(runMaintenance).toHaveBeenCalledTimes(3);
  });

  it('awaits durable capture configuration before timers and schedules apply:true only in v2', async () => {
    const gate = Promise.withResolvers<void>();
    const synchronizeCaptureGate = vi.fn(() => gate.promise);
    const setInterval = vi.fn().mockReturnValue('timer');
    const runBatch = vi.fn().mockResolvedValue([]);
    const runReconciler = vi.fn().mockResolvedValue({});
    const starting = service.startKnowledgeSyncDeliveryScheduler({
      environment: {
        ...environment,
        HELIXA_KNOWLEDGE_SYNC_CONTRACT_V2: 'true',
        HELIXA_KNOWLEDGE_SYNC_SCHEDULER_ENABLED: 'true',
      },
      dependencies: {
        synchronizeCaptureGate,
        runBatch,
        runReconciler,
        timers: { setInterval, clearInterval: vi.fn() },
      },
    });
    await flush();
    expect(synchronizeCaptureGate).toHaveBeenCalledWith(
      expect.objectContaining({
        bindingId: config.bindingId,
        organizationId: config.organizationId,
        destinationBindingId: config.destinationBindingId,
        environment: config.environment,
        contractV2: true,
      })
    );
    expect(setInterval).not.toHaveBeenCalled();
    expect(runBatch).not.toHaveBeenCalled();
    gate.resolve();
    const scheduler = await starting;
    await flush();
    expect(runReconciler).toHaveBeenCalledWith(expect.objectContaining({ apply: true }));
    expect(runBatch).toHaveBeenCalledTimes(1);
    expect(setInterval).toHaveBeenCalledTimes(2);
    scheduler?.stop();
  });

  it('configures capture even with scheduler disabled without scheduling any transport', async () => {
    const synchronizeCaptureGate = vi.fn().mockResolvedValue(undefined);
    const setInterval = vi.fn();
    const result = await service.startKnowledgeSyncDeliveryScheduler({
      environment: {
        ...environment,
        HELIXA_KNOWLEDGE_SYNC_CONTRACT_V2: 'true',
      },
      dependencies: {
        synchronizeCaptureGate,
        runBatch: vi.fn(),
        runReconciler: vi.fn(),
        timers: { setInterval, clearInterval: vi.fn() },
      },
    });
    expect(result).toBeNull();
    expect(synchronizeCaptureGate).toHaveBeenCalledWith(
      expect.objectContaining({
        bindingId: config.bindingId,
        organizationId: config.organizationId,
        destinationBindingId: config.destinationBindingId,
        environment: config.environment,
        contractV2: true,
      })
    );
    expect(setInterval).not.toHaveBeenCalled();
  });

  it('mirrors capture on a disabled worker with binding identity but no transport credentials', async () => {
    const synchronizeCaptureGate = vi.fn().mockResolvedValue(undefined);
    const result = await service.startKnowledgeSyncDeliveryScheduler({
      environment: {
        HELIXA_KNOWLEDGE_SYNC_BINDING_ID: 'binding',
        HELIXA_KNOWLEDGE_SYNC_ORGANIZATION_ID: 'org',
        HELIXA_DESTINATION_BINDING_ID: 'destination',
        HELIXA_KNOWLEDGE_SYNC_ENVIRONMENT: 'test',
      },
      dependencies: { synchronizeCaptureGate },
    });
    expect(result).toBeNull();
    expect(synchronizeCaptureGate).toHaveBeenCalledWith(
      expect.objectContaining({
        bindingId: 'binding',
        organizationId: 'org',
        destinationBindingId: 'destination',
        environment: 'test',
      })
    );
    expect(synchronizeCaptureGate.mock.calls[0][0].contractV2).not.toBe(true);
  });

  it('does not abort disabled-scheduler boot when the exact disabled binding accepts gate false', async () => {
    const rpc = vi.fn(async (name, args) => ({
      data: args.p_enabled === false ? true : null,
      error: args.p_enabled === false ? null : { code: '42501', message: 'disabled binding' },
    }));
    const from = vi.fn();
    vi.mocked(getSupabaseAdmin).mockReturnValue({ rpc, from } as never);
    const setInterval = vi.fn();
    await expect(
      service.startKnowledgeSyncDeliveryScheduler({
        environment: {
          HELIXA_KNOWLEDGE_SYNC_BINDING_ID: 'binding',
          HELIXA_KNOWLEDGE_SYNC_ORGANIZATION_ID: 'org',
          HELIXA_DESTINATION_BINDING_ID: 'destination',
          HELIXA_KNOWLEDGE_SYNC_ENVIRONMENT: 'test',
        },
        dependencies: { timers: { setInterval, clearInterval: vi.fn() } },
      })
    ).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledExactlyOnceWith('set_helixa_knowledge_sync_v2_enabled', {
      ...bindingArgs,
      p_enabled: false,
    });
    expect(from).not.toHaveBeenCalled();
    expect(setInterval).not.toHaveBeenCalled();
  });

  it('wires awaited scheduler startup only into the general worker and stops it during shutdown', async () => {
    const worker = await readFile(
      new URL('../../../../src/orchestrator/worker-entrypoint.ts', import.meta.url),
      'utf8'
    );
    expect(worker).toContain(
      'activeKnowledgeSyncDeliveryScheduler = await startKnowledgeSyncDeliveryScheduler('
    );
    expect(worker.indexOf('if (process.env.STAGE6_WORKER')).toBeLessThan(
      worker.indexOf('= await startKnowledgeSyncDeliveryScheduler(')
    );
    expect(worker).toContain('activeKnowledgeSyncDeliveryScheduler?.stop()');
  });
});
