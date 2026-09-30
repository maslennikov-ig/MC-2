import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { canonicalJson } from '../../../../src/integrations/helixa/canonical-json';

const enabled = process.env.MC2_HELIXA_REAL_PG17 === '1';
const container = `mc2-helixa-knowledge-v2-${process.pid}-${Date.now()}`;
const migrations = join(__dirname, '../../../../supabase/migrations');
const migration = join(migrations, '20260930120000_helixa_knowledge_sync_v2.sql');
const hasV2 = existsSync(migration) && process.env.MC2_HELIXA_V2_BASELINE !== '1';

function docker(args: string[], input?: string) {
  const result = spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(result.stderr || result.stdout || `docker failed: ${result.status}`);
  return result.stdout.trim();
}
function sql(query: string) {
  return docker(
    ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-Atq'],
    query
  );
}
function concurrentSql(query: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn('docker', [
      'exec',
      '-i',
      container,
      'psql',
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-Atq',
    ]);
    let stderr = '';
    process.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    process.on('error', reject);
    process.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(stderr));
    });
    process.stdin.end(query);
  });
}
async function waitForSleepingSession(name: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (
      sql(
        `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=${quote(name)} AND wait_event='PgSleep');`
      ) === 't'
    )
      return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Session ${name} did not reach its transaction lock checkpoint`);
}
function rows(
  query = 'SELECT to_jsonb(o) row FROM helixa_knowledge_sync_outbox o ORDER BY created_at,id'
): any[] {
  const output = sql(`SELECT coalesce(jsonb_agg(row),'[]'::jsonb) FROM (${query}) r;`);
  return JSON.parse(output);
}
function quote(input: string) {
  return `'${input.replaceAll("'", "''")}'`;
}

let org: string;
let member: string;
let outsider: string;
let course: string;
let guide: string;
const tuple = () => `'fixture', '${org}', 'test', 'destination'`;
function gate(flag = true) {
  // The unchanged v1 baseline has no gate; exercise its native completion triggers anyway.
  if (hasV2) sql(`SELECT set_helixa_knowledge_sync_v2_enabled(${tuple()}, ${flag});`);
}
function complete(
  kind: 'COURSE' | 'ROLE_GUIDE',
  id = kind === 'COURSE' ? course : guide,
  visibility = 'organization',
  owner = member
) {
  const table = kind === 'COURSE' ? 'courses' : 'career_playbooks';
  const fields =
    kind === 'COURSE'
      ? `generation_status,generation_completed_at,course_description`
      : `status,completed_at,final_markdown`;
  sql(`INSERT INTO ${table}(id,organization_id,user_id,visibility,${fields})
    VALUES('${id}','${org}','${owner}','${visibility}','completed','2026-09-30T12:00:00.000Z','# Fixture');`);
  return id;
}
function manifest(): any[] {
  return JSON.parse(sql(`SELECT get_helixa_knowledge_sync_manifest(${tuple()});`));
}
function eventProjection() {
  return rows().map(row => ({
    kind: row.object_kind,
    type: row.event_type,
    revision: Number(row.revision),
    reason: row.retraction_reason,
  }));
}

describe.runIf(enabled)('knowledge-sync v2 on disposable PostgreSQL 17', () => {
  beforeAll(async () => {
    docker([
      'run',
      '--rm',
      '-d',
      '--name',
      container,
      '-e',
      'POSTGRES_PASSWORD=local-v2-fixture',
      'postgres:17.10-bookworm',
    ]);
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const logs = spawnSync('docker', ['logs', container], { encoding: 'utf8' });
      const initialized = `${logs.stdout}${logs.stderr}`.includes(
        'PostgreSQL init process complete; ready for start up.'
      );
      const ready = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'], {
        encoding: 'utf8',
      });
      if (initialized && ready.status === 0) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    sql(readFileSync(join(__dirname, 'knowledge-sync-v2-pg17-fixture.sql'), 'utf8'));
    sql(readFileSync(join(migrations, '20251229100000_add_course_visibility.sql'), 'utf8'));
    sql(readFileSync(join(migrations, '20260605150000_career_playbook_visibility.sql'), 'utf8'));
    sql(readFileSync(join(migrations, '20260822235900_helixa_knowledge_sync_outbox.sql'), 'utf8'));
    if (hasV2) sql(readFileSync(migration, 'utf8'));
    expect(sql('SHOW server_version;')).toMatch(/^17\./u);
  }, 120_000);

  afterAll(() => {
    docker(['rm', '-f', container]);
  }, 120_000);

  beforeEach(() => {
    sql(
      'TRUNCATE organizations,users,organization_members,courses,career_playbooks,course_enrollments,lesson_contents,file_catalog,career_playbook_sources,document_evidence_runs,course_job_instruction_sources,course_job_instruction_native_sources,helixa_generation_commands,helixa_knowledge_sync_bindings,helixa_knowledge_sync_outbox CASCADE;'
    );
    if (hasV2) sql('TRUNCATE helixa_knowledge_sync_revisions,helixa_knowledge_sync_v2_dirty;');
    org = randomUUID();
    member = randomUUID();
    outsider = randomUUID();
    course = randomUUID();
    guide = randomUUID();
    sql(`INSERT INTO organizations VALUES('${org}');
      INSERT INTO users VALUES('${member}','${org}','student'),('${outsider}',NULL,'student');
      INSERT INTO organization_members(user_id,organization_id) VALUES('${member}','${org}');
      INSERT INTO helixa_knowledge_sync_bindings(binding_id,organization_id,environment,destination_binding_id)
        VALUES('fixture','${org}','test','destination');`);
  });

  it('keeps default-off v1 completion capture and claims byte compatible', () => {
    complete('COURSE');
    complete('ROLE_GUIDE');
    const captured = rows();
    expect(captured.map(row => row.event_id).sort()).toEqual(
      [
        `mc2:COURSE:${org}:${course}:2026-09-30T12:00:00.000Z`,
        `mc2:ROLE_GUIDE:${org}:${guide}:2026-09-30T12:00:00.000Z`,
      ].sort()
    );
    expect(sql(`SELECT count(*) FROM claim_helixa_knowledge_sync_outbox(${tuple()},10);`)).toBe(
      '2'
    );
  });

  it('allocates durable positive completed revisions for both kinds', () => {
    gate();
    complete('COURSE');
    complete('ROLE_GUIDE');
    expect(eventProjection().sort((a, b) => a.kind.localeCompare(b.kind))).toEqual([
      { kind: 'COURSE', type: 'COURSE_COMPLETED', revision: 1, reason: null },
      { kind: 'ROLE_GUIDE', type: 'ROLE_GUIDE_COMPLETED', revision: 1, reason: null },
    ]);
    for (const event of rows())
      expect(event.event_id).toBe(`mc2:${event.object_kind}:${org}:${event.object_id}:COMPLETED:1`);
  });

  it('captures title, lesson content and final text once for a multi-row transaction', () => {
    gate();
    complete('COURSE');
    sql(`BEGIN;
      UPDATE courses SET title='Edited' WHERE id='${course}';
      INSERT INTO lesson_contents(lesson_id,course_id,content) VALUES('${randomUUID()}','${course}','{"text":"one"}'),('${randomUUID()}','${course}','{"text":"two"}');
      UPDATE courses SET course_description='# Edited' WHERE id='${course}';
      UPDATE lesson_contents SET content='{"text":"final"}' WHERE course_id='${course}';
      COMMIT;`);
    expect(eventProjection().map(row => [row.type, row.revision])).toEqual([
      ['COURSE_COMPLETED', 1],
      ['COURSE_UPDATED', 2],
    ]);
    const snapshot = rows().at(-1).snapshot;
    expect(snapshot.title).toBe('Edited');
    expect(snapshot.lessons).toHaveLength(2);
    expect(snapshot.lessons.every((lesson: any) => lesson.content.text === 'final')).toBe(true);
  });

  it('ignores worker metadata, block status, image state and compatibility publication bits', () => {
    gate();
    complete('ROLE_GUIDE');
    complete('COURSE');
    sql(
      `UPDATE career_playbooks SET generated_blocks='{"block_1":{"content":"same","status":"generated","attempt":1}}' WHERE id='${guide}';`
    );
    const before = rows().length;
    sql(`UPDATE career_playbooks SET generated_blocks='{"block_1":{"content":"same","status":"regenerating","attempt":2,"generated_at":"later"}}',image_status='generating',cost_breakdown='{"cost":2}' WHERE id='${guide}';
      UPDATE courses SET is_published=false,status='draft',generation_progress='{"progress":10}',updated_at=now() WHERE id='${course}';`);
    expect(rows()).toHaveLength(before);
    expect(manifest()).toHaveLength(2);
  });

  it('emits one update when completed role-guide answerable blocks change', () => {
    gate();
    complete('ROLE_GUIDE');
    sql(
      `UPDATE career_playbooks SET generated_blocks='{"block_1":{"content":"new text","status":"generated"}}' WHERE id='${guide}';`
    );
    expect(eventProjection().map(row => [row.type, row.revision])).toEqual([
      ['ROLE_GUIDE_COMPLETED', 1],
      ['ROLE_GUIDE_UPDATED', 2],
    ]);
  });

  it('captures source text changes and source removal without relying on completion timestamps', () => {
    gate();
    complete('ROLE_GUIDE');
    const source = randomUUID();
    sql(`INSERT INTO career_playbook_sources(id,playbook_id,organization_id,user_id,source_type,text)
      VALUES('${source}','${guide}','${org}','${member}','text','first');`);
    sql(`UPDATE career_playbook_sources SET text='second' WHERE id='${source}';`);
    sql(`DELETE FROM career_playbook_sources WHERE id='${source}';`);
    expect(eventProjection().map(row => row.revision)).toEqual([1, 2, 3, 4]);
    expect(rows()[2].snapshot.sources[0].originalText).toBe('second');
  });

  it('hard-delete cascades retract once and recreated identities continue revision sequence', () => {
    gate();
    complete('COURSE');
    sql(
      `INSERT INTO lesson_contents(lesson_id,course_id,content) VALUES('${randomUUID()}','${course}','{"text":"child"}');`
    );
    sql(`DELETE FROM courses WHERE id='${course}';`);
    complete('COURSE');
    expect(eventProjection().map(row => [row.type, row.revision, row.reason])).toEqual([
      ['COURSE_COMPLETED', 1, null],
      ['COURSE_UPDATED', 2, null],
      ['COURSE_RETRACTED', 3, 'deleted'],
      ['COURSE_COMPLETED', 4, null],
    ]);
    expect(rows()[2].snapshot).toBeNull();
  });

  it.each(['COURSE', 'ROLE_GUIDE'] as const)('retracts generation reverted for %s once', kind => {
    gate();
    complete(kind);
    const table = kind === 'COURSE' ? 'courses' : 'career_playbooks';
    const status = kind === 'COURSE' ? 'generation_status' : 'status';
    sql(
      `UPDATE ${table} SET ${status}='generating' WHERE id='${kind === 'COURSE' ? course : guide}';`
    );
    expect(eventProjection().at(-1)).toMatchObject({
      type: `${kind}_RETRACTED`,
      revision: 2,
      reason: 'generation_reverted',
    });
    expect(manifest()).toEqual([]);
  });

  it('includes private guides owned by an org member and does not retract when public link is removed', () => {
    gate();
    complete('ROLE_GUIDE', guide, 'public');
    sql(`UPDATE career_playbooks SET visibility='private' WHERE id='${guide}';`);
    expect(rows()).toHaveLength(1);
    expect(manifest().map(row => row.id)).toEqual([guide]);
  });

  it('public-to-organization retains access even with the compatibility bit false', () => {
    gate();
    complete('COURSE', course, 'public');
    sql(`UPDATE courses SET visibility='organization',is_published=false WHERE id='${course}';`);
    expect(rows()).toHaveLength(1);
    expect(manifest().map(row => row.id)).toEqual([course]);
  });

  it('unpublished retracts only when public-to-private loses the final org reader', () => {
    gate();
    complete('ROLE_GUIDE', guide, 'public', outsider);
    sql(`UPDATE career_playbooks SET visibility='private' WHERE id='${guide}';`);
    expect(eventProjection().at(-1)).toMatchObject({
      type: 'ROLE_GUIDE_RETRACTED',
      revision: 2,
      reason: 'unpublished',
    });
    expect(manifest()).toEqual([]);
  });

  it('organization-to-private retracts visibility_restricted only on final-reader loss', () => {
    gate();
    complete('ROLE_GUIDE', guide, 'organization', outsider);
    sql(`UPDATE career_playbooks SET visibility='private' WHERE id='${guide}';`);
    expect(eventProjection().at(-1)).toMatchObject({
      type: 'ROLE_GUIDE_RETRACTED',
      revision: 2,
      reason: 'visibility_restricted',
    });
  });

  it('includes private courses through real admin and active enrollment access, then tracks the final reader loss', () => {
    gate();
    sql(`UPDATE users SET role='admin' WHERE id='${member}';`);
    complete('COURSE', course, 'private', outsider);
    expect(manifest().map(row => row.id)).toEqual([course]);
    sql(`INSERT INTO course_enrollments(course_id,user_id) VALUES('${course}','${member}');
      UPDATE users SET role='student' WHERE id='${member}';`);
    expect(rows()).toHaveLength(1);
    sql(`DELETE FROM course_enrollments WHERE course_id='${course}';`);
    expect(eventProjection().at(-1)).toMatchObject({
      type: 'COURSE_RETRACTED',
      revision: 2,
      reason: 'visibility_restricted',
    });
    expect(manifest()).toEqual([]);
  });

  it('member removal retracts a private owner guide and adding a reader re-publishes with a higher revision', () => {
    gate();
    complete('ROLE_GUIDE', guide, 'private');
    sql(
      `DELETE FROM organization_members WHERE user_id='${member}'; UPDATE users SET organization_id=NULL WHERE id='${member}';`
    );
    expect(eventProjection().at(-1)).toMatchObject({
      type: 'ROLE_GUIDE_RETRACTED',
      revision: 2,
      reason: 'visibility_restricted',
    });
    sql(`INSERT INTO organization_members(user_id,organization_id) VALUES('${member}','${org}');`);
    expect(eventProjection().at(-1)).toMatchObject({
      type: 'ROLE_GUIDE_COMPLETED',
      revision: 3,
      reason: null,
    });
  });

  it('returns a complete consistent inventory larger than PostgREST default and isolates organizations', () => {
    gate();
    sql(`INSERT INTO courses(id,organization_id,user_id,visibility,generation_status,generation_completed_at,title)
      SELECT gen_random_uuid(),'${org}','${member}','organization','completed','2026-09-30T12:00:00Z','bulk '||n FROM generate_series(1,1007) n;`);
    complete('ROLE_GUIDE', guide, 'private');
    const inventory = manifest();
    expect(inventory).toHaveLength(1008);
    expect(new Set(inventory.map(row => `${row.kind}:${row.id}`)).size).toBe(1008);
    expect(
      inventory.every(row => row.revision === 1 && /^[a-f0-9]{64}$/u.test(row.contentHash))
    ).toBe(true);
    expect(() =>
      sql(
        `SELECT get_helixa_knowledge_sync_manifest('fixture','${randomUUID()}','test','destination');`
      )
    ).toThrow();
  }, 60_000);

  it('matches package canonical contentHash including number formatting, Unicode and block normalization', () => {
    gate();
    complete('ROLE_GUIDE');
    const spec = {
      number: 1.0,
      small: 1e-7,
      edge: 1e-6,
      big: 1e21,
      precise: 1.2345678901234567,
      '': 'bmp',
      '😀': 'unicode',
    };
    sql(`UPDATE career_playbooks SET role_profile_spec=${quote(JSON.stringify(spec))}::jsonb,
      generated_blocks='{"block_1":{"content":"body","status":"generated","attempt":3}}' WHERE id='${guide}';`);
    const snapshot = rows().at(-1).snapshot;
    const content = {
      summaryMarkdown: snapshot.summaryMarkdown,
      structure: snapshot.structure,
      blocks: snapshot.blocks,
      lessons: snapshot.lessons,
    };
    const hash = createHash('sha256').update(canonicalJson(content)).digest('hex');
    expect(rows().at(-1).content_hash).toBe(hash);
    expect(manifest()[0].contentHash).toBe(hash);
  });

  it('apply reconciliation creates missing intents, dry-run does not mutate and snapshots remain pinned', () => {
    complete('COURSE');
    gate();
    sql('DELETE FROM helixa_knowledge_sync_outbox WHERE contract_version=2;');
    const before = rows().length;
    const dry = JSON.parse(sql(`SELECT reconcile_helixa_knowledge_sync_v2(${tuple()},false);`));
    expect(dry.missing).toBe(1);
    expect(rows()).toHaveLength(before);
    const applied = JSON.parse(sql(`SELECT reconcile_helixa_knowledge_sync_v2(${tuple()},true);`));
    expect(applied.inserted).toBe(1);
    sql(`UPDATE courses SET title='after' WHERE id='${course}';`);
    const v2 = rows().filter(row => row.contract_version === 2);
    expect(v2.map(row => row.revision)).toEqual([1, 2]);
    expect(v2[0].snapshot.title).toBe('Fixture Course');
    expect(v2[1].snapshot.title).toBe('after');
  });

  it('resends exactly the current revision without bump and preserves frozen identity across leases', () => {
    gate();
    complete('COURSE');
    const claim = rows(
      `SELECT to_jsonb(c) row FROM claim_helixa_knowledge_sync_v2_outbox(${tuple()},1) c`
    )[0];
    const body = '{"fixture":"frozen"}';
    const hash = createHash('sha256').update(body).digest('hex');
    sql(`SELECT freeze_helixa_knowledge_sync_payload('${claim.id}','${claim.lease_token}',${quote(body)},'${hash}');
      SELECT transition_helixa_knowledge_sync_outbox('${claim.id}','${claim.lease_token}','delivered',NULL,NULL);
      SELECT enqueue_helixa_knowledge_sync_v2_resend(${tuple()},'[{"kind":"COURSE","id":"${course}"}]');`);
    const retry = rows(
      `SELECT to_jsonb(c) row FROM claim_helixa_knowledge_sync_v2_outbox(${tuple()},1) c`
    )[0];
    expect(retry.event_id).toBe(claim.event_id);
    expect(retry.revision).toBe(1);
    expect(Buffer.from(retry.raw_body_base64, 'base64').toString('utf8')).toBe(body);
    expect(
      sql(
        `SELECT transition_helixa_knowledge_sync_outbox('${claim.id}','${claim.lease_token}','delivered',NULL,NULL);`
      )
    ).toBe('f');
    expect(manifest()[0].revision).toBe(1);
  });

  it('off-on-off isolates protocol backlogs and restores v1 capture and claims', () => {
    complete('COURSE');
    gate();
    complete('ROLE_GUIDE');
    expect(sql(`SELECT count(*) FROM claim_helixa_knowledge_sync_outbox(${tuple()},10);`)).toBe(
      '0'
    );
    gate(false);
    const next = randomUUID();
    complete('COURSE', next);
    expect(sql(`SELECT count(*) FROM claim_helixa_knowledge_sync_outbox(${tuple()},10);`)).toBe(
      '2'
    );
    expect(() =>
      sql(`SELECT * FROM claim_helixa_knowledge_sync_v2_outbox(${tuple()},10);`)
    ).toThrow();
    expect(rows().filter(row => row.contract_version === 2)).toHaveLength(2);
  });

  it('keeps all new privileged RPCs unavailable to public clients', () => {
    const privileges =
      rows(`SELECT jsonb_build_object('name',p.proname,'service',has_function_privilege('service_role',p.oid,'execute'),
      'anon',has_function_privilege('anon',p.oid,'execute'),'authenticated',has_function_privilege('authenticated',p.oid,'execute')) row
      FROM pg_proc p WHERE p.proname IN ('set_helixa_knowledge_sync_v2_enabled','claim_helixa_knowledge_sync_v2_outbox',
      'get_helixa_knowledge_sync_manifest','reconcile_helixa_knowledge_sync_v2','enqueue_helixa_knowledge_sync_v2_resend') ORDER BY p.proname`);
    expect(privileges).toHaveLength(5);
    expect(privileges.every(row => row.service && !row.anon && !row.authenticated)).toBe(true);
  });

  it('atomically deletes downstream stage 4 as one content edit, rolls back, and fences tenant scope', () => {
    gate();
    complete('COURSE');
    const section = randomUUID();
    const lesson = randomUUID();
    sql(`BEGIN;
      INSERT INTO sections(id,course_id) VALUES('${section}','${course}');
      INSERT INTO lessons(id,section_id) VALUES('${lesson}','${section}');
      INSERT INTO lesson_contents(lesson_id,course_id,content) VALUES('${lesson}','${course}','{"text":"body"}');
      UPDATE courses SET course_structure='{"sections":[{"title":"one"}]}' WHERE id='${course}'; COMMIT;`);
    // This fixture includes extra arbitrary lesson IDs elsewhere; install native cascade here.
    sql(
      'ALTER TABLE lesson_contents ADD CONSTRAINT fixture_lesson_fk FOREIGN KEY(lesson_id) REFERENCES lessons(id) ON DELETE CASCADE;'
    );
    const before = rows().length;
    expect(() =>
      sql(`SELECT delete_helixa_course_downstream_v2('${course}','${randomUUID()}',4);`)
    ).toThrow();
    expect(() =>
      sql(`SELECT delete_helixa_course_downstream_v2('${course}','${org}',3);`)
    ).toThrow();
    sql(`BEGIN; SELECT delete_helixa_course_downstream_v2('${course}','${org}',4); ROLLBACK;`);
    expect(sql(`SELECT count(*) FROM lesson_contents WHERE course_id='${course}';`)).toBe('1');
    expect(rows()).toHaveLength(before);
    const result = JSON.parse(
      sql(`SELECT delete_helixa_course_downstream_v2('${course}','${org}',4);`)
    );
    expect(result).toEqual({
      deletedLessonsCount: 1,
      deletedSectionsCount: 1,
      deletedStructure: true,
    });
    expect(rows()).toHaveLength(before + 1);
    expect(eventProjection().at(-1)).toMatchObject({ type: 'COURSE_UPDATED', revision: 3 });
    expect(sql(`SELECT generation_status FROM courses WHERE id='${course}';`)).toBe('completed');
    sql('ALTER TABLE lesson_contents DROP CONSTRAINT fixture_lesson_fk;');
  });

  it('applies a validated cascade field patch as one event and rejects stale prior state before deletion', () => {
    gate();
    complete('COURSE');
    const section = randomUUID();
    const lesson = randomUUID();
    const previous = { sections: [{ title: 'old' }] };
    const next = { sections: [{ title: 'edited' }] };
    sql(`BEGIN;
      INSERT INTO sections(id,course_id) VALUES('${section}','${course}');
      INSERT INTO lessons(id,section_id) VALUES('${lesson}','${section}');
      INSERT INTO lesson_contents(lesson_id,course_id,content) VALUES('${lesson}','${course}','{"text":"body"}');
      UPDATE courses SET course_structure=${quote(JSON.stringify(previous))}::jsonb,generation_metadata='{"kept":true}' WHERE id='${course}'; COMMIT;`);
    sql(
      'ALTER TABLE lesson_contents ADD CONSTRAINT fixture_lesson_fk FOREIGN KEY(lesson_id) REFERENCES lessons(id) ON DELETE CASCADE;'
    );
    const before = rows().length;
    const patch = { course_structure: next, generation_metadata: { kept: true } };
    const expected = JSON.parse(
      sql(`SELECT jsonb_build_object('updated_at',updated_at,'analysis_result',analysis_result,
      'course_structure',course_structure,'generation_metadata',generation_metadata) FROM courses WHERE id='${course}';`)
    );
    const stale = { ...expected, course_structure: { sections: [] } };
    expect(() =>
      sql(`SELECT delete_helixa_course_downstream_v2('${course}','${org}',5,
      ${quote(JSON.stringify(patch))}::jsonb,${quote(JSON.stringify(stale))}::jsonb);`)
    ).toThrow();
    expect(sql(`SELECT count(*) FROM lessons WHERE id='${lesson}';`)).toBe('1');
    expect(rows()).toHaveLength(before);
    const result = JSON.parse(
      sql(`SELECT delete_helixa_course_downstream_v2('${course}','${org}',5,
      ${quote(JSON.stringify(patch))}::jsonb,${quote(JSON.stringify(expected))}::jsonb);`)
    );
    expect(result).toEqual({
      deletedLessonsCount: 1,
      deletedSectionsCount: 0,
      deletedStructure: false,
      fieldApplied: true,
    });
    expect(rows()).toHaveLength(before + 1);
    expect(rows().at(-1).snapshot.structure).toEqual(next);
    expect(rows().at(-1).snapshot.lessons).toEqual([]);
    expect(eventProjection().at(-1)).toMatchObject({ type: 'COURSE_UPDATED', revision: 3 });
    sql('ALTER TABLE lesson_contents DROP CONSTRAINT fixture_lesson_fk;');
  });

  it('rejects invalid cascade patches without changing native rows or emitting events', () => {
    gate();
    complete('COURSE');
    expect(() =>
      sql(
        `SELECT delete_helixa_course_downstream_v2('${course}','${org}',4,'{"visibility":"public"}',NULL);`
      )
    ).toThrow();
    expect(() =>
      sql(
        `SELECT delete_helixa_course_downstream_v2('${course}','${org}',5,'{"course_structure":{}}',NULL);`
      )
    ).toThrow();
    expect(rows()).toHaveLength(1);
    expect(
      sql(`SELECT count(*) FROM pg_proc WHERE proname='delete_helixa_course_downstream_v2';`)
    ).toBe('1');
    const expected = JSON.parse(
      sql(`SELECT jsonb_build_object('updated_at',updated_at,'analysis_result',analysis_result,
      'course_structure',course_structure,'generation_metadata',generation_metadata) FROM courses WHERE id='${course}';`)
    );
    const result = JSON.parse(
      sql(`SELECT delete_helixa_course_downstream_v2('${course}','${org}',4,
      '{"analysis_result":{"brief":"new"}}',${quote(JSON.stringify(expected))}::jsonb);`)
    );
    expect(result.fieldApplied).toBe(true);
    expect(sql(`SELECT analysis_result->>'brief' FROM courses WHERE id='${course}';`)).toBe('new');
  });

  it('serializes concurrent edits into distinct monotonic revisions', async () => {
    gate();
    complete('COURSE');
    await Promise.all([
      concurrentSql(
        `BEGIN; UPDATE courses SET title='one' WHERE id='${course}'; SELECT pg_sleep(0.2); COMMIT;`
      ),
      concurrentSql(
        `BEGIN; SELECT pg_sleep(0.1); UPDATE courses SET title='two' WHERE id='${course}'; COMMIT;`
      ),
    ]);
    expect(eventProjection().map(row => row.revision)).toEqual([1, 2, 3]);
    expect(new Set(rows().map(row => row.event_id)).size).toBe(3);
    expect(manifest()[0].revision).toBe(3);
  });

  it('keeps role-guide revision clocks after hard deletion and recreation', () => {
    gate();
    complete('ROLE_GUIDE');
    sql(`DELETE FROM career_playbooks WHERE id='${guide}';`);
    complete('ROLE_GUIDE');
    expect(eventProjection().map(row => [row.type, row.revision, row.reason])).toEqual([
      ['ROLE_GUIDE_COMPLETED', 1, null],
      ['ROLE_GUIDE_RETRACTED', 2, 'deleted'],
      ['ROLE_GUIDE_COMPLETED', 3, null],
    ]);
  });

  it('accepts current-revision resend lists larger than one manifest page', () => {
    gate();
    sql(`INSERT INTO courses(id,organization_id,user_id,visibility,generation_status,generation_completed_at)
      SELECT gen_random_uuid(),'${org}','${member}','organization','completed','2026-09-30T12:00:00Z' FROM generate_series(1,1002);`);
    sql("UPDATE helixa_knowledge_sync_outbox SET status='delivered';");
    expect(
      sql(`SELECT enqueue_helixa_knowledge_sync_v2_resend(${tuple()},
      (SELECT jsonb_agg(jsonb_build_object('kind','COURSE','id',id)) FROM courses));`)
    ).toBe('1002');
    expect(manifest().every(item => item.revision === 1)).toBe(true);
  }, 60_000);

  it('ignores source-file processing metadata when exported bytes and representations are unchanged', () => {
    gate();
    complete('COURSE');
    const file = randomUUID();
    const hash = createHash('sha256').update('source').digest('hex');
    sql(`BEGIN; INSERT INTO file_catalog(id,organization_id,course_id,hash,markdown_content,processed_content)
      VALUES('${file}','${org}','${course}','${hash}','source','initial internal text');
      INSERT INTO document_evidence_runs(organization_id,course_id,status,source_manifest)
        VALUES('${org}','${course}','accepted','[{"document_id":"${file}","source_version_hash":"${hash}","document_name":"source.txt"}]'); COMMIT;`);
    const before = rows().length;
    sql(
      `UPDATE file_catalog SET processed_content='different internal text',updated_at=now() WHERE id='${file}';`
    );
    expect(rows()).toHaveLength(before);
    expect(manifest()[0].revision).toBe(2);
  });

  it('warms preexisting completed clocks once when the binding first enables v2', () => {
    complete('COURSE');
    complete('ROLE_GUIDE', guide, 'private');
    gate();
    expect(rows().filter(row => row.contract_version === 2)).toHaveLength(2);
    expect(manifest()).toHaveLength(2);
    const before = rows().length;
    gate();
    expect(rows()).toHaveLength(before);
    const dry = JSON.parse(sql(`SELECT reconcile_helixa_knowledge_sync_v2(${tuple()},false);`));
    expect(dry).toEqual({ missing: 0, inserted: 0, applied: false });
    expect(rows()).toHaveLength(before);
  });

  it.each([true, false])(
    'transfers organizations by withdrawing old scope before publishing new scope (old gate %s)',
    oldGate => {
      gate();
      complete('COURSE');
      const nextOrg = randomUUID();
      const nextMember = randomUUID();
      sql(`INSERT INTO organizations VALUES('${nextOrg}');
      INSERT INTO users VALUES('${nextMember}','${nextOrg}','student');
      INSERT INTO organization_members(user_id,organization_id) VALUES('${nextMember}','${nextOrg}');
      INSERT INTO helixa_knowledge_sync_bindings(binding_id,organization_id,environment,destination_binding_id)
        VALUES('next','${nextOrg}','test','destination');`);
      if (hasV2)
        sql(
          `SELECT set_helixa_knowledge_sync_v2_enabled('next','${nextOrg}','test','destination',true);`
        );
      if (!oldGate) gate(false);
      // NEW dirty row is queued first; OLD row must still withdraw before it is overwritten.
      sql(
        `UPDATE courses SET organization_id='${nextOrg}',user_id='${nextMember}' WHERE id='${course}';`
      );
      const events = rows()
        .filter(row => row.contract_version === 2)
        .sort((a, b) => a.revision - b.revision);
      expect(
        events.map(row => [
          row.organization_id,
          row.event_type,
          row.revision,
          row.retraction_reason,
        ])
      ).toEqual([
        [org, 'COURSE_COMPLETED', 1, null],
        [org, 'COURSE_RETRACTED', 2, 'visibility_restricted'],
        [nextOrg, 'COURSE_COMPLETED', 3, null],
      ]);
      if (!oldGate) {
        expect(() =>
          sql(`SELECT * FROM claim_helixa_knowledge_sync_v2_outbox(${tuple()},10);`)
        ).toThrow();
        gate();
      }
      expect(manifest()).toEqual([]);
      const nextInventory = JSON.parse(
        sql(`SELECT get_helixa_knowledge_sync_manifest('next','${nextOrg}','test','destination');`)
      );
      expect(nextInventory[0].revision).toBe(3);
    }
  );

  it('preserves historical file versions without inventing a sha256 byte proof', () => {
    gate();
    complete('ROLE_GUIDE');
    const file = randomUUID();
    sql(`BEGIN; INSERT INTO file_catalog(id,organization_id,course_id,hash)
      VALUES('${file}','${org}',NULL,'historical-version');
      INSERT INTO career_playbook_sources(playbook_id,organization_id,user_id,source_type,file_catalog_id)
        VALUES('${guide}','${org}','${member}','file','${file}'); COMMIT;`);
    const descriptor = rows().at(-1).snapshot.sources[0];
    expect(descriptor.version).toBe('historical-version');
    expect(descriptor.sourceSha256).toBeUndefined();
  });

  it('exports only the latest usable lesson version after a multi-version edit', () => {
    gate();
    complete('COURSE');
    const lesson = randomUUID();
    sql(`BEGIN; INSERT INTO lesson_contents(lesson_id,course_id,status,content,created_at)
      VALUES('${lesson}','${course}','completed','{"text":"obsolete"}','2026-09-30T10:00:00Z'),
        ('${lesson}','${course}','completed','{"text":"current"}','2026-09-30T11:00:00Z'); COMMIT;`);
    expect(rows().at(-1).snapshot.lessons).toEqual([
      { lesson_id: lesson, content: { text: 'current' } },
    ]);
    expect(eventProjection().map(row => [row.type, row.revision])).toEqual([
      ['COURSE_COMPLETED', 1],
      ['COURSE_UPDATED', 2],
    ]);
    expect(manifest()[0].revision).toBe(2);
  });

  it('does not advance a revision when only an obsolete lesson version is edited', () => {
    gate();
    complete('COURSE');
    const lesson = randomUUID();
    const old = randomUUID();
    sql(`BEGIN; INSERT INTO lesson_contents(id,lesson_id,course_id,status,content,created_at)
      VALUES('${old}','${lesson}','${course}','completed','{"text":"obsolete"}','2026-09-30T10:00:00Z'),
        ('${randomUUID()}','${lesson}','${course}','completed','{"text":"current"}','2026-09-30T11:00:00Z'); COMMIT;`);
    const before = rows().length;
    sql(`UPDATE lesson_contents SET content='{"text":"edited history"}' WHERE id='${old}';`);
    expect(rows()).toHaveLength(before);
    expect(manifest()[0].revision).toBe(2);
  });

  it('falls back from empty or failed lesson versions and resolves usable timestamp ties deterministically', () => {
    gate();
    complete('COURSE');
    const lesson = randomUUID();
    sql(`BEGIN; INSERT INTO lesson_contents(id,lesson_id,course_id,status,content,created_at)
      VALUES('11111111-1111-4111-8111-111111111111','${lesson}','${course}','completed','{"text":"lower"}','2026-09-30T10:00:00Z'),
        ('22222222-2222-4222-8222-222222222222','${lesson}','${course}','approved','{"text":"higher"}','2026-09-30T10:00:00Z'),
        ('${randomUUID()}','${lesson}','${course}','completed','{}','2026-09-30T11:00:00Z'),
        ('${randomUUID()}','${lesson}','${course}','failed','{"text":"failed"}','2026-09-30T12:00:00Z'),
        ('${randomUUID()}','${lesson}','${course}','completed',${quote(JSON.stringify({ text: '\n\t \u00a0' }))}::jsonb,'2026-09-30T13:00:00Z'); COMMIT;`);
    expect(rows().at(-1).snapshot.lessons).toEqual([
      { lesson_id: lesson, content: { text: 'higher' } },
    ]);
    expect(manifest()[0].revision).toBe(2);
  });

  it('ignores nested native lesson envelope telemetry while preserving all actual body fields', () => {
    gate();
    complete('COURSE');
    const lesson = randomUUID();
    const version = randomUUID();
    const body = {
      text: 'body',
      metadata: { label: 'body field' },
      status: 'body status',
      updated_at: 'body caption',
    };
    const envelope = {
      lesson_id: lesson,
      content: body,
      status: 'completed',
      created_at: 'first',
      updated_at: 'first',
      metadata: { tokens: 1, cost: 1, model: 'old' },
    };
    sql(`INSERT INTO lesson_contents(id,lesson_id,course_id,content)
      VALUES('${version}','${lesson}','${course}',${quote(JSON.stringify(envelope))}::jsonb);`);
    const before = rows().length;
    const changed = {
      ...envelope,
      status: 'updated',
      created_at: 'later',
      updated_at: 'later',
      metadata: { tokens: 200, cost: 10, model: 'new' },
    };
    sql(
      `UPDATE lesson_contents SET content=${quote(JSON.stringify(changed))}::jsonb,metadata='{"tokens":300,"cost":20}' WHERE id='${version}';`
    );
    expect(rows()).toHaveLength(before);
    expect(rows().at(-1).snapshot.lessons[0].content).toEqual({ lesson_id: lesson, content: body });
    expect(manifest()[0].revision).toBe(2);
  });

  it('retains only answerable outer lesson markdown and captures markdown-only edits once', () => {
    gate();
    complete('COURSE');
    const lesson = randomUUID();
    const version = randomUUID();
    sql(`INSERT INTO lesson_contents(id,lesson_id,course_id,content,metadata)
      VALUES('${version}','${lesson}','${course}','{}','{"markdownContent":"# First preview","tokens":1,"model":"old"}');`);
    expect(rows().at(-1).snapshot.lessons).toEqual([
      { lesson_id: lesson, content: {}, metadata: { markdownContent: '# First preview' } },
    ]);
    sql(
      `UPDATE lesson_contents SET metadata='{"markdownContent":"# Second preview","tokens":2,"model":"new"}' WHERE id='${version}';`
    );
    expect(eventProjection().map(row => row.revision)).toEqual([1, 2, 3]);
    expect(rows().at(-1).snapshot.lessons[0].metadata).toEqual({
      markdownContent: '# Second preview',
    });
    const before = rows().length;
    sql(
      `UPDATE lesson_contents SET metadata='{"markdownContent":"# Second preview","tokens":999,"cost":9,"model":"another"}' WHERE id='${version}';`
    );
    expect(rows()).toHaveLength(before);
    expect(manifest()[0].revision).toBe(3);
  });

  it('disables the v2 capture gate for an exact tuple whose binding is intentionally disabled', () => {
    gate();
    complete('COURSE');
    sql("UPDATE helixa_knowledge_sync_bindings SET enabled=false WHERE binding_id='fixture';");
    expect(sql(`SELECT set_helixa_knowledge_sync_v2_enabled(${tuple()},false);`)).toBe('t');
    expect(
      sql(
        "SELECT contract_v2_enabled FROM helixa_knowledge_sync_bindings WHERE binding_id='fixture';"
      )
    ).toBe('f');
    expect(() => sql(`SELECT set_helixa_knowledge_sync_v2_enabled(${tuple()},true);`)).toThrow();
    expect(() =>
      sql(
        `SELECT set_helixa_knowledge_sync_v2_enabled('fixture','${randomUUID()}','test','destination',false);`
      )
    ).toThrow();
    expect(() =>
      sql(`SELECT * FROM claim_helixa_knowledge_sync_v2_outbox(${tuple()},10);`)
    ).toThrow();
    expect(() => sql(`SELECT * FROM claim_helixa_knowledge_sync_outbox(${tuple()},10);`)).toThrow();
  });

  it.each(['processing', 'retryable', 'action_required'] as const)(
    'refuses v2 activation while an attempted v1 event remains %s',
    status => {
      complete('COURSE');
      const claim = rows(
        `SELECT to_jsonb(c) row FROM claim_helixa_knowledge_sync_outbox(${tuple()},1) c`
      )[0];
      const body = '{"legacy":"immutable"}';
      const hash = createHash('sha256').update(body).digest('hex');
      sql(
        `SELECT freeze_helixa_knowledge_sync_payload('${claim.id}','${claim.lease_token}',${quote(body)},'${hash}');`
      );
      if (status !== 'processing')
        sql(
          `SELECT transition_helixa_knowledge_sync_outbox('${claim.id}','${claim.lease_token}','${status}',now(),'fixture failure');`
        );
      const before = rows()[0];
      expect(() => gate()).toThrow(
        /Knowledge sync v1 delivery must complete before v2 activation/u
      );
      expect(
        sql(
          "SELECT contract_v2_enabled FROM helixa_knowledge_sync_bindings WHERE binding_id='fixture';"
        )
      ).toBe('f');
      expect(rows()[0]).toEqual(before);
      expect(rows().filter(row => row.contract_version === 2)).toHaveLength(0);
    }
  );

  it('does not let a manual v1 reset bypass the activation delivery barrier', () => {
    complete('COURSE');
    const claim = rows(
      `SELECT to_jsonb(c) row FROM claim_helixa_knowledge_sync_outbox(${tuple()},1) c`
    )[0];
    sql(`SELECT transition_helixa_knowledge_sync_outbox('${claim.id}','${claim.lease_token}','action_required',NULL,'fixture failure');
      SELECT reset_helixa_knowledge_sync_intent(${tuple()},${quote(claim.event_id)});`);
    const before = rows()[0];
    expect(before.attempts).toBe(0);
    expect(before.claim_generation).toBe(1);
    expect(before.raw_body).toBeNull();
    expect(() => gate()).toThrow(/Knowledge sync v1 delivery must complete before v2 activation/u);
    expect(rows()[0]).toEqual(before);
    expect(
      sql(
        "SELECT contract_v2_enabled FROM helixa_knowledge_sync_bindings WHERE binding_id='fixture';"
      )
    ).toBe('f');
  });

  it('permits activation after attempted v1 delivery and ignores other binding scope', () => {
    complete('COURSE');
    const claim = rows(
      `SELECT to_jsonb(c) row FROM claim_helixa_knowledge_sync_outbox(${tuple()},1) c`
    )[0];
    sql(`SELECT transition_helixa_knowledge_sync_outbox('${claim.id}','${claim.lease_token}','delivered',NULL,NULL);
      INSERT INTO helixa_knowledge_sync_bindings(binding_id,organization_id,environment,destination_binding_id) VALUES('other','${org}','test','other');
      INSERT INTO helixa_knowledge_sync_outbox(binding_id,organization_id,environment,destination_binding_id,event_id,object_kind,object_id,completed_at,status,attempts)
        VALUES('other','${org}','test','other','other','COURSE','${course}',now(),'retryable',1);`);
    gate();
    expect(
      sql(
        "SELECT contract_v2_enabled FROM helixa_knowledge_sync_bindings WHERE binding_id='fixture';"
      )
    ).toBe('t');
    expect(rows().find(row => row.id === claim.id)?.status).toBe('delivered');
    expect(
      rows().filter(row => row.binding_id === 'fixture' && row.contract_version === 2)
    ).toHaveLength(1);
  });

  it('treats an already frozen pending legacy body as delivery history even with zero counters', () => {
    complete('COURSE');
    const body = '{"legacy":"frozen pending"}';
    const hash = createHash('sha256').update(body).digest('hex');
    sql(
      `UPDATE helixa_knowledge_sync_outbox SET raw_body=convert_to(${quote(body)},'UTF8'),payload_hash='${hash}' WHERE contract_version=1;`
    );
    const before = rows()[0];
    expect(before.attempts).toBe(0);
    expect(before.claim_generation).toBe(0);
    expect(() => gate()).toThrow(/Knowledge sync v1 delivery must complete before v2 activation/u);
    expect(rows()[0]).toEqual(before);
  });

  it('serializes activation behind a preceding v1 claim and refuses its outstanding attempt', async () => {
    complete('COURSE');
    const claiming = concurrentSql(`BEGIN; SET LOCAL application_name='v2-barrier-claim-first';
      SELECT * FROM claim_helixa_knowledge_sync_outbox(${tuple()},1); SELECT pg_sleep(1); COMMIT;`);
    await waitForSleepingSession('v2-barrier-claim-first');
    const activating = concurrentSql(
      `SELECT set_helixa_knowledge_sync_v2_enabled(${tuple()},true);`
    );
    const results = await Promise.allSettled([claiming, activating]);
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
    expect(
      sql(
        "SELECT contract_v2_enabled FROM helixa_knowledge_sync_bindings WHERE binding_id='fixture';"
      )
    ).toBe('f');
    expect(rows()).toHaveLength(1);
    expect(rows()[0].attempts).toBe(1);
  });

  it('serializes a subsequent v1 claim behind activation and leaves dormant legacy bytes untouched', async () => {
    complete('COURSE');
    const before = rows()[0];
    const activating =
      concurrentSql(`BEGIN; SET LOCAL application_name='v2-barrier-activation-first';
      SELECT set_helixa_knowledge_sync_v2_enabled(${tuple()},true); SELECT pg_sleep(1); COMMIT;`);
    await waitForSleepingSession('v2-barrier-activation-first');
    const claiming = concurrentSql(
      `SELECT * FROM claim_helixa_knowledge_sync_outbox(${tuple()},1);`
    );
    const results = await Promise.allSettled([activating, claiming]);
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(rows().find(row => row.id === before.id)).toEqual(before);
    gate(false);
    const legacy = rows(
      `SELECT to_jsonb(c) row FROM claim_helixa_knowledge_sync_outbox(${tuple()},1) c`
    )[0];
    expect(legacy.id).toBe(before.id);
    expect(legacy.event_id).toBe(before.event_id);
    expect(legacy.attempts).toBe(1);
  });
});
