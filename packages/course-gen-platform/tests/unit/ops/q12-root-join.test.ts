import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Task 9 D6 join — the Root supervisor emits and validates the real chained
 * frame transcript of the activation-truth R handshake and binds it to the
 * immutable predecision and terminal seal. Every scenario runs against the
 * production deploy/qdrant/q12-lifecycle-core.py through a synthetic local
 * driver: no database, container, socket, or live/remote action. All hashing is
 * over the in-memory canonical form; validation-at-load re-derives frame_sha256
 * from canonical() and never hashes raw file bytes.
 */

const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const corePath = join(repoRoot, 'deploy/qdrant/q12-lifecycle-core.py');

// Synthetic driver: imports the production core module, exercises the Task 9
// join frame/handshake/validation-at-load surface, and returns JSON. It never
// touches a live host. Written to a scratch dir at test time (not a tracked
// fixture) so the tracked change stays in the Task 9 write zone.
const DRIVER = String.raw`
import importlib.util, json, os, pathlib, sys, tempfile

core_path = pathlib.Path(sys.argv[1])
spec = importlib.util.spec_from_file_location("q12core_root_join", core_path)
CORE = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = CORE
spec.loader.exec_module(CORE)

SV = "q12-d6-activation-truth/v1"
RUN_ID = "q12-root-join-run"
LEASE = "cutover"

def h(tag):
    return CORE.sha256(tag.encode())

def build(classification):
    is_precommit = classification == "precommit_rollback"
    planned_j = h("planned-journal") if is_precommit else None
    planned_c = h("planned-checkpoint") if is_precommit else None
    request_sha256 = h("request")
    init_db = h("init-db")
    bound_db = h("bound-db")
    host_proj = h("host-proj")
    predecessor_j = h("pred-journal")
    predecessor_c = h("pred-checkpoint")
    final_db = h("final-db")
    steps = [
        ("db_locked", {
            "request_sha256": request_sha256,
            "initial_database_projection_sha256": init_db,
            "capability_projection_sha256": h("cap"),
            "lock_projection_sha256": h("lock"),
            "fd9_identity_sha256": h("fd9"),
        }),
        ("host_projection", {
            "request_sha256": request_sha256,
            "initial_database_projection_sha256": init_db,
            "host_projection_sha256": host_proj,
            "proposed_classification": classification,
            "prepared_quiesced_predecessor_sha256": h("pqp"),
        }),
        ("host_bound", {
            "request_sha256": request_sha256,
            "initial_database_projection_sha256": init_db,
            "bound_database_projection_sha256": bound_db,
            "host_projection_sha256": host_proj,
            "session_observation_sha256": h("session"),
            "fd9_identity_sha256": h("fd9"),
        }),
    ]
    frames3 = CORE.d6_emit_frame_chain(SV, RUN_ID, [tuple(s) for s in steps])
    head_before = frames3[-1]["frame_sha256"]
    action = CORE.D6_CLASSIFICATION_ACTION[classification]
    predecision_fields = {
        "schema_version": SV, "run_id": RUN_ID, "lease_epoch": LEASE,
        "request_sha256": request_sha256, "classification": classification, "action": action,
        "initial_database_projection_sha256": init_db,
        "bound_database_projection_sha256": bound_db,
        "host_projection_sha256": host_proj,
        "transcript_head_before_predecision_sha256": head_before,
        "predecessor_journal_entry_hash": predecessor_j,
        "predecessor_checkpoint_sha256": predecessor_c,
        "planned_r_journal_entry_hash": planned_j,
        "planned_r_checkpoint_sha256": planned_c,
        "previous_terminal_seal_sha256": None,
        "abandoned_predecision_sha256": None,
    }
    predecision = CORE.d6_build_predecision(predecision_fields)
    predecision_sha256 = CORE.d6_predecision_sha256(predecision)
    predecision_kind = CORE.D6_CLASSIFICATION_FRAME_KIND[classification]
    predecision_payload = {
        "request_sha256": request_sha256, "predecision_sha256": predecision_sha256,
        "classification": classification, "action": action,
        "planned_r_journal_entry_hash": planned_j, "planned_r_checkpoint_sha256": planned_c,
        "predecessor_journal_entry_hash": predecessor_j,
        "predecessor_checkpoint_sha256": predecessor_c,
    }
    steps.append((predecision_kind, predecision_payload))
    if classification == "drift_incident":
        frames = CORE.d6_emit_frame_chain(SV, RUN_ID, [tuple(s) for s in steps])
        return {"frames": frames, "predecision": predecision, "seal": None,
                "head": frames[-1]["frame_sha256"], "predecision_sha256": predecision_sha256}
    actual_j, actual_c = planned_j, planned_c
    sealed_payload = {
        "request_sha256": request_sha256, "predecision_sha256": predecision_sha256,
        "initial_database_projection_sha256": init_db,
        "final_database_projection_sha256": final_db,
        "host_projection_sha256": host_proj,
        "actual_r_journal_entry_hash": actual_j, "actual_r_checkpoint_sha256": actual_c,
        "fd9_identity_sha256": h("fd9"),
    }
    steps.append(("sealed", sealed_payload))
    frames = CORE.d6_emit_frame_chain(SV, RUN_ID, [tuple(s) for s in steps])
    sealed_frame_sha256 = frames[-1]["frame_sha256"]
    release_payload = {
        "request_sha256": request_sha256, "predecision_sha256": predecision_sha256,
        "sealed_frame_sha256": sealed_frame_sha256,
        "actual_r_journal_entry_hash": actual_j, "actual_r_checkpoint_sha256": actual_c,
        "expected_transaction_end": "read_only_commit", "expected_connection_close": True,
    }
    steps.append(("release", release_payload))
    frames = CORE.d6_emit_frame_chain(SV, RUN_ID, [tuple(s) for s in steps])
    release_frame_sha256 = frames[-1]["frame_sha256"]
    closed_payload = {
        "request_sha256": request_sha256, "predecision_sha256": predecision_sha256,
        "sealed_frame_sha256": sealed_frame_sha256, "release_frame_sha256": release_frame_sha256,
        "actual_r_journal_entry_hash": actual_j, "actual_r_checkpoint_sha256": actual_c,
        "transaction_end": "read_only_commit", "connection_closed": True,
        "fd9_identity_sha256": h("fd9"),
    }
    steps.append(("closed", closed_payload))
    frames = CORE.d6_emit_frame_chain(SV, RUN_ID, [tuple(s) for s in steps])
    final_head = frames[-1]["frame_sha256"]
    evidence_state = "prepared_guarded" if is_precommit else "complete_receipt"
    seal_fields = {
        "schema_version": SV, "run_id": RUN_ID, "lease_epoch": LEASE,
        "outcome": CORE.D6_OUTCOME[classification], "request_sha256": request_sha256,
        "predecision_sha256": predecision_sha256, "final_transcript_head_sha256": final_head,
        "initial_database_projection_sha256": init_db,
        "final_database_projection_sha256": final_db,
        "host_projection_sha256": host_proj, "activation_evidence_state": evidence_state,
        "actual_r_journal_entry_hash": actual_j, "actual_r_checkpoint_sha256": actual_c,
        "probe_pidfd_identity_sha256": h("pidfd"), "fd9_identity_sha256": h("fd9"),
        "spawn_capability_sha256": h("spawn"),
        "prepared_quiesced_predecessor_sha256": h("pqp"),
        "writer_quiesce_manifest_sha256": h("wqm"), "barrier_receipt_sha256": h("barrier"),
        "probe_receipt_sha256": h("probe"),
        "activation_result_sha256": (None if is_precommit else h("actres")),
        "activation_process_projection_sha256": h("actproj"),
        "process_manifest_sha256": h("procman"),
        "probe_exit_status": 0, "transaction_end": "read_only_commit", "connection_closed": True,
    }
    seal = CORE.d6_build_terminal_seal(seal_fields, predecision)
    return {"frames": frames, "predecision": predecision, "seal": seal,
            "head": final_head, "predecision_sha256": predecision_sha256}

def dispatch(cmd):
    op = cmd["op"]
    if op == "build":
        return build(cmd["classification"])
    if op == "emit":
        frames = CORE.d6_emit_frame_chain(cmd["schema_version"], cmd["run_id"],
                                          [tuple(s) for s in cmd["steps"]])
        return {"frames": frames, "head": frames[-1]["frame_sha256"]}
    if op == "validate_frame":
        return {"frame_sha256": CORE.d6_validate_frame(cmd["frame"])}
    if op == "validate_chain":
        expected = tuple(cmd["expected_kinds"]) if cmd.get("expected_kinds") else None
        return {"head": CORE.d6_validate_frame_chain(cmd["frames"], expected)}
    if op == "bind":
        return CORE.d6_bind_handshake_authority(cmd["frames"], cmd["predecision"], cmd.get("seal"))
    if op == "load":
        directory = pathlib.Path(tempfile.mkdtemp())
        path = directory / "activation-truth-transcript-cutover.jsonl"
        if "raw_lines" in cmd:
            data = "".join(line + "\n" for line in cmd["raw_lines"]).encode("utf-8")
        else:
            data = b"".join(CORE.canonical(f) + b"\n" for f in cmd["frames"])
        path.write_bytes(data)
        frames, head = CORE.d6_load_transcript(path)
        return {"frames": frames, "head": head}
    raise ValueError("unknown op: " + op)

def main():
    cmd = json.loads(sys.stdin.read())
    try:
        result = dispatch(cmd)
    except (CORE.LifecycleError, OSError, ValueError, json.JSONDecodeError) as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        return
    result["ok"] = True
    print(json.dumps(result))

main()
`;

let driverPath = '';
let driverRoot = '';

beforeAll(() => {
  driverRoot = mkdtempSync(join(tmpdir(), 'mc2-q12-root-join-driver-'));
  driverPath = join(driverRoot, 'driver.py');
  writeFileSync(driverPath, DRIVER);
});

afterAll(() => {
  if (driverRoot) rmSync(driverRoot, { recursive: true, force: true });
});

interface DriverResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

function run(cmd: Record<string, unknown>): DriverResult {
  const proc = spawnSync('/usr/bin/python3', [driverPath, corePath], {
    input: JSON.stringify(cmd),
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8', HOME: '/var/empty' },
  });
  expect(proc.status, proc.stderr).toBe(0);
  return JSON.parse(proc.stdout) as DriverResult;
}

type Frame = {
  schema_version: string;
  sequence: number;
  kind: string;
  run_id: string;
  payload: Record<string, unknown>;
  previous_frame_sha256: string | null;
  frame_sha256: string;
};

function buildHandshake(classification: string): {
  frames: Frame[];
  predecision: Record<string, unknown>;
  seal: Record<string, unknown> | null;
  head: string;
  predecision_sha256: string;
} {
  const result = run({ op: 'build', classification });
  expect(result.ok, result.error).toBe(true);
  return result as unknown as ReturnType<typeof buildHandshake>;
}

describe('D6 frame envelope', () => {
  it('excludes frame_sha256 from its own hash and chains from null at genesis', () => {
    const emitted = run({
      op: 'emit',
      schema_version: 'sv',
      run_id: 'r',
      steps: [
        ['db_locked', { a: 1 }],
        ['host_projection', { b: 2 }],
      ],
    });
    expect(emitted.ok, emitted.error).toBe(true);
    const frames = emitted.frames as Frame[];
    expect(frames[0].previous_frame_sha256).toBeNull();
    expect(frames[0].sequence).toBe(1);
    expect(frames[1].sequence).toBe(2);
    expect(frames[1].previous_frame_sha256).toBe(frames[0].frame_sha256);
    // frame_sha256 must be self-consistent and not depend on itself.
    expect(run({ op: 'validate_frame', frame: frames[0] }).frame_sha256).toBe(
      frames[0].frame_sha256
    );
  });

  it('produces a different frame hash when the payload changes', () => {
    const a = run({
      op: 'emit',
      schema_version: 'sv',
      run_id: 'r',
      steps: [['db_locked', { a: 1 }]],
    });
    const b = run({
      op: 'emit',
      schema_version: 'sv',
      run_id: 'r',
      steps: [['db_locked', { a: 2 }]],
    });
    expect((a.frames as Frame[])[0].frame_sha256).not.toBe((b.frames as Frame[])[0].frame_sha256);
  });
});

describe('D6 R-handshake chain validation and post-R authority', () => {
  it('hands the post-R frontier to Task 9 retirement for a precommit rollback seal', () => {
    const { frames, predecision, seal, head } = buildHandshake('precommit_rollback');
    expect(frames).toHaveLength(7);
    expect(frames.map(f => f.kind)).toEqual([
      'db_locked',
      'host_projection',
      'host_bound',
      'predecision_precommit',
      'sealed',
      'release',
      'closed',
    ]);
    const bound = run({ op: 'bind', frames, predecision, seal });
    expect(bound.ok, bound.error).toBe(true);
    expect(bound.authority).toBe('task9_retirement_rollback_preparation');
    expect(bound.transcript_head).toBe(head);
  });

  it('yields finish-forward authority for a committed seal with null R', () => {
    const { frames, predecision, seal } = buildHandshake('committed_finish_forward');
    expect(frames.map(f => f.kind)).toEqual([
      'db_locked',
      'host_projection',
      'host_bound',
      'predecision_finish_forward',
      'sealed',
      'release',
      'closed',
    ]);
    const bound = run({ op: 'bind', frames, predecision, seal });
    expect(bound.ok, bound.error).toBe(true);
    expect(bound.authority).toBe('finish_forward');
  });

  it('yields incident-only authority for a drift abort that never seals', () => {
    const { frames, predecision, seal } = buildHandshake('drift_incident');
    expect(seal).toBeNull();
    expect(frames.map(f => f.kind)).toEqual([
      'db_locked',
      'host_projection',
      'host_bound',
      'abort_incident',
    ]);
    const bound = run({ op: 'bind', frames, predecision, seal });
    expect(bound.ok, bound.error).toBe(true);
    expect(bound.authority).toBe('incident_only');
  });

  it('rejects a broken previous_frame_sha256 chain link', () => {
    const { frames } = buildHandshake('precommit_rollback');
    const tampered = frames.map((f, i) =>
      i === 4 ? { ...f, previous_frame_sha256: '0'.repeat(64) } : f
    );
    const bad = run({ op: 'validate_chain', frames: tampered });
    expect(bad.ok).toBe(false);
  });

  it('rejects a payload mutation that leaves the stored frame_sha256 stale', () => {
    const { frames } = buildHandshake('precommit_rollback');
    const tampered = frames.map((f, i) =>
      i === 2 ? { ...f, payload: { ...f.payload, injected: 'drift' } } : f
    );
    const bad = run({ op: 'validate_chain', frames: tampered });
    expect(bad.ok).toBe(false);
  });

  it('rejects a non-monotonic sequence', () => {
    const { frames } = buildHandshake('precommit_rollback');
    const tampered = frames.map((f, i) => (i === 3 ? { ...f, sequence: 9 } : f));
    const bad = run({ op: 'validate_chain', frames: tampered });
    expect(bad.ok).toBe(false);
  });

  it('rejects a kind order that does not match the classification handshake', () => {
    const { frames, predecision, seal } = buildHandshake('precommit_rollback');
    const swapped = [frames[1], frames[0], ...frames.slice(2)].map((f, i) => ({
      ...f,
      sequence: i + 1,
    }));
    const bad = run({ op: 'bind', frames: swapped, predecision, seal });
    expect(bad.ok).toBe(false);
  });
});

describe('D6 validation-at-load hashes canonical frames, not raw bytes', () => {
  it('validates a transcript re-serialized with non-canonical key order and spacing', () => {
    const { frames, head } = buildHandshake('precommit_rollback');
    // Re-serialize each frame with reversed keys and pretty spacing: the raw
    // bytes are not canonical, but load must parse -> canonical() -> hash.
    const rawLines = frames.map(f => {
      const reversed: Record<string, unknown> = {};
      for (const key of Object.keys(f).reverse()) {
        reversed[key] = (f as Record<string, unknown>)[key];
      }
      return JSON.stringify(reversed, null, 1).replace(/\n/g, ' ');
    });
    const loaded = run({ op: 'load', raw_lines: rawLines });
    expect(loaded.ok, loaded.error).toBe(true);
    expect(loaded.head).toBe(head);
  });

  it('rejects a stored line whose payload was tampered under an unchanged frame_sha256', () => {
    const { frames } = buildHandshake('precommit_rollback');
    const rawLines = frames.map((f, i) => {
      if (i === 2) {
        const mutated = { ...f, payload: { ...f.payload, injected: 'drift' } };
        return JSON.stringify(mutated);
      }
      return JSON.stringify(f);
    });
    const loaded = run({ op: 'load', raw_lines: rawLines });
    expect(loaded.ok).toBe(false);
  });

  it('round-trips the canonical transcript to the same head', () => {
    const { frames, head } = buildHandshake('committed_finish_forward');
    const loaded = run({ op: 'load', frames });
    expect(loaded.ok, loaded.error).toBe(true);
    expect(loaded.head).toBe(head);
  });
});

describe('D6 seal-predecision binding at epoch load', () => {
  it('rejects a seal whose predecision_sha256 does not bind its predecision', () => {
    const { frames, predecision, seal } = buildHandshake('precommit_rollback');
    const other = buildHandshake('committed_finish_forward');
    const bad = run({
      op: 'bind',
      frames,
      predecision,
      seal: { ...seal!, predecision_sha256: other.predecision_sha256 },
    });
    expect(bad.ok).toBe(false);
  });

  it('rejects a seal whose final transcript head does not match the frame chain', () => {
    const { frames, predecision, seal } = buildHandshake('precommit_rollback');
    const bad = run({
      op: 'bind',
      frames,
      predecision,
      seal: { ...seal!, final_transcript_head_sha256: '0'.repeat(64) },
    });
    expect(bad.ok).toBe(false);
  });

  it('rejects a predecision whose transcript head does not match the frame chain', () => {
    const { frames, predecision, seal } = buildHandshake('precommit_rollback');
    const bad = run({
      op: 'bind',
      frames,
      predecision: { ...predecision, transcript_head_before_predecision_sha256: '0'.repeat(64) },
      seal,
    });
    expect(bad.ok).toBe(false);
  });
});
