import errno
import hashlib
import json
import os
import re
import signal
import stat
import subprocess
import sys
import tempfile

mode, run_id, run_root, docker_bin, lock_path, uid_raw, gid_raw, local_test_raw, fault_point = sys.argv[1:]
uid = int(uid_raw)
gid = int(gid_raw)
local_test = local_test_raw == "1"
HEX64 = re.compile(r"^[a-f0-9]{64}$")
UUID4 = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
RESUME_LEASE = re.compile(r"^(?:cutover|cutover-recovery-[1-9][0-9]*)$")
JOURNAL_LEASE = re.compile(r"^(?:cutover|cutover-recovery-[1-9][0-9]*|postcutover_schedule|credential_rotation)$")
CLASSES = {
    "production-api", "production-web", "production-worker",
    "development-api", "development-web", "development-worker",
}
WRITER_KEYS = {
    "class", "id", "name", "project", "service", "config_files", "working_dir",
    "image_id", "image_ref", "healthcheck_present", "intended_running",
    "intended_restart_policy", "temporary_restart_policy",
}
IDENTITY_KEYS = (
    "class", "id", "name", "project", "service", "config_files", "working_dir",
    "image_id", "image_ref", "healthcheck_present",
)
JOURNAL_KEYS = {
    "schema", "run_id", "seq", "phase", "outcome", "timestamp",
    "release_sha", "operator_digest", "command_id", "command_sha256",
    "lease_epoch", "previous_hash", "entry_hash", "rotation_required",
    "resource_manifest_sha256", "quiesce_manifest_sha256",
    "capability_manifest_sha256", "accepted_object_kind",
    "accepted_object_sha256",
}
MAX_SAFE_INTEGER = 2**53 - 1
EXPECTED_ENVIRONMENT = {
    "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "LC_ALL": "C",
    "LANG": "C",
    "HOME": "/root",
    "Q12_EXTERNAL_QUIESCE_LEASE_FD": "9",
}

class ResumeError(RuntimeError):
    pass

def require(condition, message):
    if not condition:
        raise ResumeError(message)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def validate_canonical_value(value, label="canonical JSON"):
    if value is None or isinstance(value, bool):
        return
    if isinstance(value, int):
        require(0 <= value <= MAX_SAFE_INTEGER, f"{label} contains a non-safe integer")
        return
    if isinstance(value, str):
        require(all(not 0xD800 <= ord(character) <= 0xDFFF for character in value), f"{label} contains a non-scalar string")
        return
    if isinstance(value, list):
        for item in value:
            validate_canonical_value(item, label)
        return
    if isinstance(value, dict):
        require(all(isinstance(key, str) for key in value), f"{label} contains a non-string key")
        for key, item in value.items():
            validate_canonical_value(key, label)
            validate_canonical_value(item, label)
        return
    raise ResumeError(f"{label} contains a forbidden JSON value")

def canonical_json(value, label="canonical JSON"):
    validate_canonical_value(value, label)
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")

def rename_noreplace(source, destination):
    import ctypes

    libc = ctypes.CDLL(None, use_errno=True)
    renameat2 = getattr(libc, "renameat2", None)
    require(renameat2 is not None, "renameat2 is unavailable")
    renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    renameat2.restype = ctypes.c_int
    result = renameat2(-100, os.fsencode(source), -100, os.fsencode(destination), 1)
    if result == 0:
        return
    error = ctypes.get_errno()
    if error == errno.EEXIST:
        raise FileExistsError(error, os.strerror(error), destination)
    raise OSError(error, os.strerror(error), destination)

require(dict(os.environ) == EXPECTED_ENVIRONMENT, "writer resume environment is not exact")
observed_fds = set()
observed_fd_targets = {}
for raw_fd in os.listdir("/proc/self/fd"):
    try:
        fd = int(raw_fd)
        os.fstat(fd)
        observed_fds.add(fd)
        observed_fd_targets[fd] = os.readlink(f"/proc/self/fd/{fd}")
    except (OSError, ValueError):
        pass
require(
    observed_fds == {0, 1, 2, 9},
    f"writer resume file descriptor surface is not exact: {observed_fd_targets}",
)
require(os.path.realpath("/proc/self/fd/0") == "/dev/null", "writer resume stdin must be /dev/null")

class Opened:
    def __init__(self, path, label, expected_mode):
        self.path = path
        self.label = label
        require(os.path.isabs(path) and os.path.realpath(path) == path, f"{label} path is not canonical")
        before = os.lstat(path)
        require(stat.S_ISREG(before.st_mode) and not stat.S_ISLNK(before.st_mode), f"{label} is not a regular file")
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            opened = os.fstat(fd)
            after = os.lstat(path)
            identity = lambda value: (value.st_dev, value.st_ino, value.st_uid, value.st_gid, stat.S_IMODE(value.st_mode), value.st_size)
            require(identity(before) == identity(opened) == identity(after), f"{label} identity changed while opening")
            require(opened.st_uid == uid and opened.st_gid == gid and stat.S_IMODE(opened.st_mode) == expected_mode, f"{label} owner or mode is invalid")
            chunks = []
            while True:
                chunk = os.read(fd, 1024 * 1024)
                if not chunk:
                    break
                chunks.append(chunk)
            self.data = b"".join(chunks)
            self.digest = sha(self.data)
            self.identity = identity(opened)
        finally:
            os.close(fd)
    def json(self):
        try:
            value = json.loads(self.data)
        except Exception as exc:
            raise ResumeError(f"{self.label} JSON is invalid") from exc
        require(isinstance(value, dict), f"{self.label} must be a JSON object")
        return value
    def recheck(self):
        current = Opened(self.path, self.label, self.identity[4])
        require(current.identity == self.identity and current.digest == self.digest, f"{self.label} changed after validation")

def exact(obj, keys, label):
    require(set(obj) == set(keys), f"{label} has a non-exact projection")

def hex64(value):
    return isinstance(value, str) and HEX64.fullmatch(value) is not None

def policy(value):
    return isinstance(value, dict) and set(value) == {"name", "maximum_retry_count"} and isinstance(value["name"], str) and isinstance(value["maximum_retry_count"], int) and not isinstance(value["maximum_retry_count"], bool) and value["maximum_retry_count"] >= 0

def identity(writer):
    return {key: writer[key] for key in IDENTITY_KEYS}

def docker(*args, capture=True):
    result = subprocess.run([docker_bin, *args], text=True, stdout=subprocess.PIPE if capture else subprocess.DEVNULL, stderr=subprocess.PIPE, env=docker_environment, close_fds=True)
    if result.returncode != 0:
        raise ResumeError(f"Docker command failed: {args[0]}")
    return result.stdout

def inspect(expected, allow_unready=False):
    try:
        payload = json.loads(docker("inspect", expected["id"]))
    except Exception as exc:
        raise ResumeError("writer identity inspection failed") from exc
    require(isinstance(payload, list) and len(payload) == 1, "writer identity is missing or duplicated")
    row = payload[0]
    labels = row.get("Config", {}).get("Labels", {})
    require(row.get("Id") == expected["id"] and row.get("Name") == expected["name"], "writer identity changed")
    require(labels.get("com.docker.compose.project") == expected["project"] and labels.get("com.docker.compose.service") == expected["service"], "writer label identity changed")
    require(labels.get("com.docker.compose.project.config_files") == expected["config_files"] and labels.get("com.docker.compose.project.working_dir") == expected["working_dir"], "writer Compose identity changed")
    require(row.get("Image") == expected["image_id"] and row.get("Config", {}).get("Image") == expected["image_ref"], "writer image identity changed")
    state = row.get("State", {})
    health = state.get("Health")
    require((health is not None) == expected["healthcheck_present"], "writer healthcheck identity changed")
    require(state.get("Restarting") is False, "writer is restarting")
    if not allow_unready and health is not None:
        require(health.get("Status") == "healthy", "writer health is not ready")
    restart = row.get("HostConfig", {}).get("RestartPolicy", {})
    return row, {
        "class": expected["class"], "id": expected["id"], "name": expected["name"],
        "project": expected["project"], "service": expected["service"],
        "image_id": expected["image_id"], "image_ref": expected["image_ref"],
        "running": state.get("Running"), "status": state.get("Status"),
        "restarting": state.get("Restarting"),
        "health_status": None if health is None else health.get("Status"),
        "restart_policy": {"name": restart.get("Name"), "maximum_retry_count": restart.get("MaximumRetryCount")},
    }

def is_stopped_no(row):
    state = row["State"]
    restart = row["HostConfig"]["RestartPolicy"]
    return state.get("Running") is False and state.get("Status") in {"created", "exited"} and restart == {"Name": "no", "MaximumRetryCount": 0}

def is_terminal(row, expected):
    state = row["State"]
    target = expected["intended_restart_policy"]
    restart = row["HostConfig"]["RestartPolicy"]
    running_ok = state.get("Running") is expected["intended_running"] and state.get("Status") == ("running" if expected["intended_running"] else state.get("Status"))
    if not expected["intended_running"]:
        running_ok = state.get("Running") is False and state.get("Status") in {"created", "exited"}
    health_ok = (not expected["intended_running"] or row["State"].get("Health") is None or row["State"]["Health"].get("Status") == "healthy")
    return running_ok and health_ok and restart == {"Name": target["name"], "MaximumRetryCount": target["maximum_retry_count"]}

def canonical_inventory(values):
    ordered = sorted(values, key=lambda item: (item["project"], item["service"], item["id"]))
    return sha(json.dumps(ordered, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode())

require(mode in {"forward", "rollback"} and UUID4.fullmatch(run_id), "resume mode or run identity is invalid")
run_stat = os.stat(run_root, follow_symlinks=False)
require(stat.S_ISDIR(run_stat.st_mode) and run_stat.st_uid == uid and run_stat.st_gid == gid and stat.S_IMODE(run_stat.st_mode) == 0o700, "resume run root identity is invalid")
lease_fd_raw = os.environ.get("Q12_EXTERNAL_QUIESCE_LEASE_FD", "")
require(lease_fd_raw == "9", "writer resume requires inherited lease FD 9")
lease_fd = 9
try:
    lease_stat = os.fstat(lease_fd)
except OSError as exc:
    raise ResumeError("writer resume requires inherited lease FD 9") from exc
lock_stat = os.stat(lock_path, follow_symlinks=False)
require(os.path.realpath(f"/proc/self/fd/{lease_fd}") == lock_path and (lease_stat.st_dev, lease_stat.st_ino) == (lock_stat.st_dev, lock_stat.st_ino), "lease descriptor is not bound to the canonical lock")
require(lock_stat.st_uid == uid and lock_stat.st_gid == gid and stat.S_IMODE(lock_stat.st_mode) == 0o600, "lease lock owner or mode is invalid")
require(subprocess.run(["/usr/bin/flock", "-n", lock_path, "true"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0, "inherited lease descriptor is not held")

docker_environment = dict(EXPECTED_ENVIRONMENT)
if local_test:
    test_environment_file = Opened(
        os.path.join(run_root, "resume-test-docker-environment.json"),
        "resume test Docker environment",
        0o400,
    )
    test_environment = test_environment_file.json()
    exact(test_environment, {"schema_version", "environment"}, "resume test Docker environment")
    require(
        test_environment["schema_version"] == "megacampus.q12.resume-test-docker-environment/v1"
        and isinstance(test_environment["environment"], dict)
        and all(isinstance(key, str) and isinstance(value, str) for key, value in test_environment["environment"].items()),
        "resume test Docker environment is invalid",
    )
    docker_environment = test_environment["environment"]

paths = {
    "barrier": os.path.join(run_root, "database-barrier-receipt.json"),
    "probe": os.path.join(run_root, "database-barrier-probe-receipt.json"),
    "quiesce": os.path.join(run_root, f"writer-quiesce-{run_id}.json"),
    "recovery": os.path.join(run_root, f"writer-recovery-state-{run_id}.json"),
    "final": os.path.join(run_root, f"final-writer-manifest-{run_id}.json"),
    "handoff": os.path.join(run_root, f"writer-handoff-state-{run_id}.json"),
    "rollback": os.path.join(run_root, f"writer-rollback-state-{run_id}.json"),
    "authority": os.path.join(run_root, f"writer-resume-authority-{run_id}.json"),
    "terminal": os.path.join(run_root, f"writer-resume-state-{run_id}.json"),
    "journal": os.path.join(run_root, "phase.jsonl"),
    "checkpoint": os.path.join(run_root, "phase-checkpoint.json"),
}

barrier_file = Opened(paths["barrier"], "database barrier receipt", 0o400)
barrier = barrier_file.json()
exact(barrier, {"schema_version","run_id","state","zero_guard_residue","expected_catalog_sha256","last_command","rollback_probes_verified","probe_receipt_sha256"}, "database barrier receipt")
require(barrier["schema_version"] == "megacampus.q12.database-barrier-receipt/v1" and barrier["run_id"] == run_id and barrier["state"] == "guard_cleanup_complete" and barrier["zero_guard_residue"] is True and hex64(barrier["expected_catalog_sha256"]), "database barrier receipt is not terminal cleanup")
if mode == "forward":
    require(barrier["last_command"] == "cleanup" and barrier["rollback_probes_verified"] is True and hex64(barrier["probe_receipt_sha256"]), "forward cleanup receipt is invalid")
    probe_file = Opened(paths["probe"], "database barrier probe receipt", 0o400)
    require(probe_file.digest == barrier["probe_receipt_sha256"], "database barrier probe receipt hash mismatch")
    probe = probe_file.json()
    exact(probe, {"schema_version","run_id","expected_catalog_sha256","completed_at","probes","residue"}, "database barrier probe receipt")
    require(probe["schema_version"] == "megacampus.q12.database-barrier-probes/v1" and probe["run_id"] == run_id and probe["expected_catalog_sha256"] == barrier["expected_catalog_sha256"], "database barrier probe receipt binding is invalid")
else:
    require(barrier["last_command"] == "rollback" and barrier["rollback_probes_verified"] is False and barrier["probe_receipt_sha256"] is None, "rollback cleanup receipt is invalid")

quiesce_file = Opened(paths["quiesce"], "writer quiesce manifest", 0o400)
quiesce = quiesce_file.json()
exact(quiesce, {"schema_version","run_id","status","barrier","writers"}, "writer quiesce manifest")
require(quiesce["schema_version"] == "megacampus.q12.writer-quiesce/v1" and quiesce["run_id"] == run_id and quiesce["status"] == "quiesced" and isinstance(quiesce["writers"], list) and len(quiesce["writers"]) == 10, "writer quiesce manifest is invalid")
exact(quiesce["barrier"], {"state","zero_guard_residue","expected_catalog_sha256","probe_receipt_sha256"}, "writer quiesce barrier")
require(quiesce["barrier"]["state"] == "recovery_ready_guarded" and quiesce["barrier"]["zero_guard_residue"] is False and quiesce["barrier"]["expected_catalog_sha256"] == barrier["expected_catalog_sha256"] and hex64(quiesce["barrier"]["probe_receipt_sha256"]), "writer quiesce barrier binding is invalid")
if mode == "forward":
    require(quiesce["barrier"]["probe_receipt_sha256"] == barrier["probe_receipt_sha256"], "writer quiesce probe receipt binding is invalid")
original = {}
for item in quiesce["writers"]:
    exact(item, {"class","id","name","project","service","config_files","working_dir","image_id","image_ref","prior_running","prior_status","healthcheck_present","prior_health_status","prior_restart_policy","temporary_restart_policy"}, "quiesced writer")
    require(item["class"] in CLASSES and hex64(item["id"]) and isinstance(item["prior_running"], bool) and policy(item["prior_restart_policy"]) and item["temporary_restart_policy"] == {"name":"no","maximum_retry_count":0}, "quiesced writer projection is invalid")
    require(item["id"] not in original, "quiesced writer ID is duplicated")
    original[item["id"]] = item
require(len([x for x in original.values() if x["class"].startswith("production-")]) == 5 and len([x for x in original.values() if x["class"].startswith("development-")]) == 5, "original writer class inventory is invalid")

final_file = Opened(paths["final"], "final writer manifest", 0o400)
final_manifest = final_file.json()
exact(final_manifest, {"schema_version","run_id","mode","release_sha","expected_catalog_sha256","writer_quiesce_manifest_sha256","publication_intent_journal_entry_hash","input_checkpoint_sha256","lease_epoch","final_writers","held_writers"}, "final writer manifest")
require(final_manifest["schema_version"] == "megacampus.q12.final-writer-manifest/v1" and final_manifest["run_id"] == run_id and final_manifest["mode"] == mode and final_manifest["writer_quiesce_manifest_sha256"] == quiesce_file.digest and final_manifest["expected_catalog_sha256"] == barrier["expected_catalog_sha256"] and isinstance(final_manifest["release_sha"], str) and len(final_manifest["release_sha"]) in {40,64} and re.fullmatch(r"[a-f0-9]+", final_manifest["release_sha"]) and hex64(final_manifest["publication_intent_journal_entry_hash"]) and hex64(final_manifest["input_checkpoint_sha256"]) and RESUME_LEASE.fullmatch(final_manifest["lease_epoch"]), "final writer manifest binding is invalid")
final_writers = final_manifest["final_writers"]
held_writers = final_manifest["held_writers"]
require(isinstance(final_writers, list) and len(final_writers) == 10 and isinstance(held_writers, list) and len(held_writers) == (5 if mode == "forward" else len(held_writers)) and (mode == "forward" or len(held_writers) <= 5), "final/held writer counts are invalid")
all_ids = set()
for item in [*final_writers, *held_writers]:
    exact(item, WRITER_KEYS, "final writer")
    require(item["class"] in CLASSES and hex64(item["id"]) and all(isinstance(item[key], str) and item[key] for key in ("name","project","service","config_files","working_dir","image_id","image_ref")) and isinstance(item["healthcheck_present"], bool) and isinstance(item["intended_running"], bool) and policy(item["intended_restart_policy"]) and item["temporary_restart_policy"] == {"name":"no","maximum_retry_count":0}, "final writer projection is invalid")
    require(item["id"] not in all_ids, "final/held writer ID is duplicated")
    all_ids.add(item["id"])

original_prod = {key for key,value in original.items() if value["class"].startswith("production-")}
original_dev = set(original) - original_prod
final_ids = {item["id"] for item in final_writers}
held_ids = {item["id"] for item in held_writers}
def same_original(item, prior):
    return all(item[key] == prior[key] for key in IDENTITY_KEYS)
if mode == "forward":
    require(held_ids == original_prod and original_dev.issubset(final_ids) and not original_prod.intersection(final_ids), "forward final/held selection is invalid")
    target = [item for item in final_writers if item["id"] not in original]
    require(len(target) == 5 and sum(item["class"] == "production-worker" for item in target) == 3 and sum(item["class"] == "production-api" for item in target) == 1 and sum(item["class"] == "production-web" for item in target) == 1 and all(item["intended_running"] for item in target), "forward target inventory is invalid")
else:
    require(final_ids == set(original) and not held_ids.intersection(original), "rollback final/held selection is invalid")
    target = held_writers
for item in final_writers:
    if item["id"] in original:
        prior = original[item["id"]]
        require(same_original(item, prior) and item["intended_running"] == prior["prior_running"] and item["intended_restart_policy"] == prior["prior_restart_policy"], "captured prior writer truth changed")
for item in held_writers:
    if item["id"] in original:
        require(same_original(item, original[item["id"]]), "held original writer identity changed")
    require(item["intended_running"] is False and item["intended_restart_policy"] == {"name":"no","maximum_retry_count":0}, "held writer may not be resumable")

if mode == "forward":
    recovery_file = Opened(paths["recovery"], "writer recovery state", 0o400)
    recovery = recovery_file.json()
    exact(recovery, {"schema_version","run_id","state","expected_catalog_sha256","writer_quiesce_manifest_sha256","source_manifest_sha256","source_journal_sha256"}, "writer recovery state")
    require(recovery["schema_version"] == "megacampus.q12.writer-recovery-state/v1" and recovery["run_id"] == run_id and recovery["state"] == "recovery_complete_writers_quiesced" and recovery["expected_catalog_sha256"] == barrier["expected_catalog_sha256"] and recovery["writer_quiesce_manifest_sha256"] == quiesce_file.digest and hex64(recovery["source_manifest_sha256"]) and hex64(recovery["source_journal_sha256"]), "writer recovery state is invalid")
    handoff_file = Opened(paths["handoff"], "writer handoff state", 0o400)
    handoff = handoff_file.json()
    exact(handoff, {"schema_version","run_id","state","mode","release_sha","expected_catalog_sha256","writer_quiesce_manifest_sha256","final_writer_manifest_sha256","database_activation_receipt_sha256","publication_intent_journal_entry_hash","input_checkpoint_sha256","lease_epoch"}, "writer handoff state")
    require(handoff["schema_version"] == "megacampus.q12.writer-handoff-state/v1" and handoff["run_id"] == run_id and handoff["state"] == "handoff_ready_writers_quiesced" and handoff["mode"] == mode and handoff["release_sha"] == final_manifest["release_sha"] and handoff["expected_catalog_sha256"] == final_manifest["expected_catalog_sha256"] and handoff["final_writer_manifest_sha256"] == final_file.digest and handoff["writer_quiesce_manifest_sha256"] == quiesce_file.digest and hex64(handoff["database_activation_receipt_sha256"]) and hex64(handoff["publication_intent_journal_entry_hash"]) and hex64(handoff["input_checkpoint_sha256"]) and handoff["lease_epoch"] == final_manifest["lease_epoch"], "writer handoff state is invalid")
    rollback_file = None
else:
    recovery_file = handoff_file = None
    rollback_file = Opened(paths["rollback"], "writer rollback state", 0o400)
    rollback = rollback_file.json()
    exact(rollback, {"schema_version","run_id","state","mode","release_sha","expected_catalog_sha256","writer_quiesce_manifest_sha256","final_writer_manifest_sha256","database_barrier_receipt_sha256","required_phase_receipts","required_phase_receipts_sha256","publication_intent_journal_entry_hash","input_checkpoint_sha256","lease_epoch"}, "writer rollback state")
    required = rollback["required_phase_receipts"]
    require(rollback["schema_version"] == "megacampus.q12.writer-rollback-state/v1" and rollback["run_id"] == run_id and rollback["state"] == "rollback_ready_writers_quiesced" and rollback["mode"] == mode and rollback["release_sha"] == final_manifest["release_sha"] and rollback["expected_catalog_sha256"] == final_manifest["expected_catalog_sha256"] and rollback["final_writer_manifest_sha256"] == final_file.digest and rollback["writer_quiesce_manifest_sha256"] == quiesce_file.digest and rollback["database_barrier_receipt_sha256"] == barrier_file.digest and hex64(rollback["publication_intent_journal_entry_hash"]) and hex64(rollback["input_checkpoint_sha256"]) and rollback["lease_epoch"] == final_manifest["lease_epoch"] and isinstance(required, list), "writer rollback state is invalid")
    phases = []
    for entry in required:
        exact(entry, {"phase","receipt_sha256"}, "rollback phase receipt")
        require(isinstance(entry["phase"], str) and hex64(entry["receipt_sha256"]), "rollback phase receipt is invalid")
        phases.append(entry["phase"])
    require(phases == sorted(phases) and len(phases) == len(set(phases)) and rollback["required_phase_receipts_sha256"] == sha(canonical_json(sorted(required, key=lambda item:item["phase"]), "rollback phase receipts")), "rollback phase receipt hash is invalid")

authority_file = Opened(paths["authority"], "writer resume authority", 0o400)
authority = authority_file.json()
exact(authority, {"schema_version","run_id","state","mode","release_sha","expected_catalog_sha256","writer_quiesce_manifest_sha256","final_writer_manifest_sha256","database_barrier_receipt_sha256","recovery_state_sha256","handoff_state_sha256","rollback_state_sha256","authority_intent_journal_entry_hash","input_checkpoint_sha256","lease_epoch"}, "writer resume authority")
require(authority["schema_version"] == "megacampus.q12.writer-resume-authority/v1" and authority["run_id"] == run_id and authority["mode"] == mode and authority["release_sha"] == final_manifest["release_sha"] and authority["expected_catalog_sha256"] == barrier["expected_catalog_sha256"] and authority["writer_quiesce_manifest_sha256"] == quiesce_file.digest and authority["final_writer_manifest_sha256"] == final_file.digest and authority["database_barrier_receipt_sha256"] == barrier_file.digest and hex64(authority["authority_intent_journal_entry_hash"]) and hex64(authority["input_checkpoint_sha256"]) and RESUME_LEASE.fullmatch(authority["lease_epoch"]), "writer resume authority binding is invalid")
require((authority["lease_epoch"] == "cutover" and authority["lease_epoch"] == final_manifest["lease_epoch"]) or (authority["lease_epoch"].startswith("cutover-recovery-") and final_manifest["lease_epoch"] == "cutover"), "writer resume authority/final lease transition is invalid")
if mode == "forward":
    require(authority["state"] == "handoff_ready_writers_quiesced" and authority["recovery_state_sha256"] == recovery_file.digest and authority["handoff_state_sha256"] == handoff_file.digest and authority["rollback_state_sha256"] is None, "forward resume authority is invalid")
else:
    require(authority["state"] == "rollback_ready_writers_quiesced" and authority["recovery_state_sha256"] is None and authority["handoff_state_sha256"] is None and authority["rollback_state_sha256"] == rollback_file.digest, "rollback resume authority is invalid")

journal_file = Opened(paths["journal"], "cutover journal", 0o600)
checkpoint_file = Opened(paths["checkpoint"], "cutover checkpoint", 0o600)
checkpoint = checkpoint_file.json()
exact(checkpoint, {"schema_version","run_id","seq","phase","journal_entry_hash","previous_journal_entry_hash","journal_device","journal_inode","accepted_object_kind","accepted_object_sha256","resume_authority_sha256","lease_epoch"}, "cutover checkpoint")
require(checkpoint["schema_version"] == "megacampus.q12.cutover-checkpoint/v1" and checkpoint["run_id"] == run_id and isinstance(checkpoint["seq"], int) and checkpoint["seq"] > 1 and checkpoint["phase"] == f"resume_committing_{mode}" and hex64(checkpoint["journal_entry_hash"]) and hex64(checkpoint["previous_journal_entry_hash"]) and checkpoint["accepted_object_kind"] == "none" and checkpoint["accepted_object_sha256"] is None and checkpoint["resume_authority_sha256"] == authority_file.digest and checkpoint["lease_epoch"] == authority["lease_epoch"], "resume checkpoint projection is invalid")
require(isinstance(checkpoint["journal_device"], str) and re.fullmatch(r"0|[1-9][0-9]*", checkpoint["journal_device"]) and isinstance(checkpoint["journal_inode"], str) and re.fullmatch(r"[1-9][0-9]*", checkpoint["journal_inode"]), "resume checkpoint journal identity is invalid")
require((str(journal_file.identity[0]), str(journal_file.identity[1])) == (checkpoint["journal_device"], checkpoint["journal_inode"]), "resume checkpoint journal device/inode mismatch")
raw_journal_lines = journal_file.data.splitlines(keepends=True)
require(raw_journal_lines and b"".join(raw_journal_lines) == journal_file.data, "cutover journal is empty or torn")
journal_lines = []
previous_hash = "0" * 64
for expected_seq, raw_line in enumerate(raw_journal_lines, start=1):
    require(raw_line.endswith(b"\n") and not raw_line.endswith(b"\r\n"), "cutover journal line ending is not canonical")
    encoded_entry = raw_line[:-1]
    try:
        entry = json.loads(encoded_entry.decode("utf-8"))
    except Exception as exc:
        raise ResumeError("cutover journal JSONL is invalid") from exc
    require(isinstance(entry, dict), "cutover journal entry must be an object")
    exact(entry, JOURNAL_KEYS, "cutover journal entry")
    require(canonical_json(entry, "cutover journal entry") == encoded_entry, "cutover journal line is not canonical")
    preimage = {key: value for key, value in entry.items() if key != "entry_hash"}
    require(hex64(entry["entry_hash"]) and sha(canonical_json(preimage, "cutover journal hash preimage")) == entry["entry_hash"], "cutover journal entry hash is invalid")
    require(
        entry["schema"] == "megacampus.q12.cutover-journal/v1"
        and entry["run_id"] == run_id
        and entry["seq"] == expected_seq
        and entry["previous_hash"] == previous_hash
        and isinstance(entry["phase"], str) and entry["phase"]
        and isinstance(entry["outcome"], str) and entry["outcome"]
        and isinstance(entry["timestamp"], str) and re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{3})?Z", entry["timestamp"])
        and entry["release_sha"] == final_manifest["release_sha"]
        and hex64(entry["operator_digest"])
        and isinstance(entry["command_id"], str) and entry["command_id"]
        and hex64(entry["command_sha256"])
        and JOURNAL_LEASE.fullmatch(entry["lease_epoch"])
        and isinstance(entry["rotation_required"], bool)
        and hex64(entry["resource_manifest_sha256"])
        and hex64(entry["quiesce_manifest_sha256"])
        and hex64(entry["capability_manifest_sha256"]),
        "cutover journal entry projection is invalid",
    )
    if entry["accepted_object_kind"] == "none":
        require(entry["accepted_object_sha256"] is None, "cutover journal none acceptance must have null SHA")
    else:
        require(isinstance(entry["accepted_object_kind"], str) and re.fullmatch(r"[a-z][a-z0-9_-]*", entry["accepted_object_kind"]) and hex64(entry["accepted_object_sha256"]), "cutover journal accepted object is invalid")
    journal_lines.append(entry)
    previous_hash = entry["entry_hash"]
head = journal_lines[-1]

def require_published_object(intent_hash, phase, object_kind, object_sha256, object_lease_epoch):
    matches = [index for index, entry in enumerate(journal_lines[:-1]) if entry["entry_hash"] == intent_hash]
    require(len(matches) == 1, f"{object_kind} publication intent is absent or ambiguous")
    index = matches[0]
    intent = journal_lines[index]
    require(index + 1 < len(journal_lines) - 1, f"{object_kind} acceptance is absent")
    accepted = journal_lines[index + 1]
    require(
        intent["phase"] == accepted["phase"] == phase
        and intent["outcome"] == "intent"
        and intent["accepted_object_kind"] == "none"
        and intent["accepted_object_sha256"] is None
        and accepted["outcome"] == "accepted"
        and accepted["previous_hash"] == intent["entry_hash"]
        and accepted["accepted_object_kind"] == object_kind
        and accepted["accepted_object_sha256"] == object_sha256
        and accepted["resource_manifest_sha256"] == object_sha256
        and intent["lease_epoch"] == accepted["lease_epoch"] == object_lease_epoch,
        f"{object_kind} publication pair is invalid",
    )

require_published_object(
    final_manifest["publication_intent_journal_entry_hash"],
    "prepared_quiesced" if mode == "forward" else "rollback_preparing",
    "final_writer_manifest",
    final_file.digest,
    final_manifest["lease_epoch"],
)
if mode == "forward":
    require_published_object(
        handoff["publication_intent_journal_entry_hash"],
        "handoff_ready_writers_quiesced",
        "writer_handoff_state",
        handoff_file.digest,
        handoff["lease_epoch"],
    )
else:
    require_published_object(
        rollback["publication_intent_journal_entry_hash"],
        "rollback_ready_writers_quiesced",
        "writer_rollback_state",
        rollback_file.digest,
        rollback["lease_epoch"],
    )
require_published_object(
    authority["authority_intent_journal_entry_hash"],
    f"resume_authority_{mode}",
    "writer_resume_authority",
    authority_file.digest,
    authority["lease_epoch"],
)
require(
    head["seq"] == checkpoint["seq"]
    and head["phase"] == checkpoint["phase"] == f"resume_committing_{mode}"
    and head["outcome"] == "intent"
    and head["command_id"] == f"writers.resume.{mode}"
    and head["entry_hash"] == checkpoint["journal_entry_hash"]
    and head["previous_hash"] == checkpoint["previous_journal_entry_hash"]
    and head["accepted_object_kind"] == checkpoint["accepted_object_kind"] == "none"
    and head["accepted_object_sha256"] is checkpoint["accepted_object_sha256"] is None
    and head["lease_epoch"] == checkpoint["lease_epoch"] == authority["lease_epoch"]
    and head["resource_manifest_sha256"] == final_file.digest
    and head["quiesce_manifest_sha256"] == quiesce_file.digest,
    "cutover journal/checkpoint binding is invalid",
)

for project in sorted({item["project"] for item in target}):
    observed = {value for value in docker("ps", "-aq", "--no-trunc", "--filter", f"label=com.docker.compose.project={project}").splitlines() if value}
    expected = {item["id"] for item in target if item["project"] == project}
    require(observed == expected, "unrecorded target inventory exists")

opened_inputs = [barrier_file, quiesce_file, final_file, authority_file, checkpoint_file, journal_file]
if mode == "forward": opened_inputs.extend([probe_file, recovery_file, handoff_file])
else: opened_inputs.append(rollback_file)

def observe_all(allow_unready=False):
    final_rows = []
    held_rows = []
    for item in final_writers:
        row, projection = inspect(item, allow_unready)
        final_rows.append((item, row, projection))
    for item in held_writers:
        row, projection = inspect(item, allow_unready)
        held_rows.append((item, row, projection))
    return final_rows, held_rows

def prove_held(rows):
    require(all(is_stopped_no(row) for _,row,_ in rows), "held writer changed from stopped/no")

def compensate():
    failed = False
    for item in sorted(final_writers, key=lambda value:(value["project"],value["service"],value["id"])):
        try: docker("update", "--restart=no", item["id"], capture=False)
        except Exception: failed = True
    for item in sorted(final_writers, key=lambda value:(value["project"],value["service"],value["id"])):
        try:
            row,_ = inspect(item, True)
            if row["State"].get("Running"):
                docker("stop", "--time", "30", item["id"], capture=False)
        except Exception: failed = True
    try:
        final_rows, held_rows = observe_all(True)
        require(all(is_stopped_no(row) for _,row,_ in final_rows), "final writer compensation is incomplete")
        prove_held(held_rows)
    except Exception:
        failed = True
    if failed:
        raise ResumeError("terminal incident: writer compensation could not be proven")

def terminal_projection():
    final_rows, held_rows = observe_all(False)
    require(all(is_terminal(row,item) for item,row,_ in final_rows), "final writer terminal state is incomplete")
    prove_held(held_rows)
    return [projection for _,_,projection in final_rows], [projection for _,_,projection in held_rows]

def expected_receipt(final_projection, held_projection):
    return {
        "schema_version":"megacampus.q12.writer-resume-state/v1", "run_id":run_id,
        "state":"writers_resumed", "mode":mode,
        "expected_catalog_sha256":barrier["expected_catalog_sha256"],
        "writer_quiesce_manifest_sha256":quiesce_file.digest,
        "final_writer_manifest_sha256":final_file.digest,
        "resume_authority_sha256":authority_file.digest,
        "database_barrier_receipt_sha256":barrier_file.digest,
        "resume_intent_journal_entry_hash":checkpoint["journal_entry_hash"],
        "input_checkpoint_sha256":checkpoint_file.digest,
        "lease_epoch":checkpoint["lease_epoch"],
        "final_inventory_sha256":canonical_inventory(final_projection),
        "held_inventory_sha256":canonical_inventory(held_projection),
    }

def publish_receipt(value):
    encoded = canonical_json(value, "writer resume state") + b"\n"
    if os.path.exists(paths["terminal"]):
        existing = Opened(paths["terminal"], "writer resume state", 0o400)
        require(existing.data == encoded, "existing writer resume state is ambiguous")
        return
    fd, temporary = tempfile.mkstemp(prefix=".writer-resume-state.", dir=run_root)
    try:
        os.write(fd, encoded)
        os.fchown(fd, uid, gid)
        os.fchmod(fd, 0o400)
        os.fsync(fd)
        os.close(fd); fd = -1
        try:
            rename_noreplace(temporary, paths["terminal"])
            temporary = None
        except FileExistsError:
            existing = Opened(paths["terminal"], "writer resume state", 0o400)
            require(existing.data == encoded, "existing writer resume state is ambiguous")
            os.unlink(temporary)
            temporary = None
            return
        if fault_point == "after-terminal-rename":
            os.kill(os.getpid(), signal.SIGKILL)
        directory_fd = os.open(run_root, os.O_RDONLY | os.O_DIRECTORY)
        try: os.fsync(directory_fd)
        finally: os.close(directory_fd)
    finally:
        if fd >= 0: os.close(fd)
        if temporary is not None:
            try: os.unlink(temporary)
            except FileNotFoundError: pass

if os.path.exists(paths["terminal"]):
    final_projection, held_projection = terminal_projection()
    publish_receipt(expected_receipt(final_projection, held_projection))
    sys.exit(0)

initial_final, initial_held = observe_all(True)
prove_held(initial_held)
recovery_epoch = checkpoint["lease_epoch"].startswith("cutover-recovery-")
if recovery_epoch:
    try:
        final_projection, held_projection = terminal_projection()
    except Exception:
        compensate()
        raise ResumeError("recovered partial resume was compensated; a new recovery epoch is required")
    for item in opened_inputs: item.recheck()
    publish_receipt(expected_receipt(final_projection, held_projection))
    sys.exit(0)
require(all(is_stopped_no(row) for _,row,_ in initial_final), "final writers are not initially stopped/no")

mutation_started = False
completed = False
def handle_signal(signum, frame):
    raise ResumeError(f"resume interrupted by signal {signum}")
signal.signal(signal.SIGINT, handle_signal)
signal.signal(signal.SIGTERM, handle_signal)
try:
    mutation_started = True
    started_count = 0
    for suffix in ("-worker", "-api", "-web"):
        members = sorted([item for item in final_writers if item["class"].endswith(suffix)], key=lambda value:(value["project"],value["service"],value["id"]))
        for item in members:
            if item["intended_running"]:
                docker("start", item["id"], capture=False)
                started_count += 1
                if fault_point == "after-first-start" and started_count == 1:
                    os.kill(os.getpid(), signal.SIGKILL)
        for item in members:
            row,_ = inspect(item, False)
            if item["intended_running"]:
                require(row["State"].get("Running") is True and row["State"].get("Status") == "running", "writer class did not become running")
            else:
                require(is_stopped_no(row), "non-running final writer changed before policy restore")
        _, held_now = observe_all(True)
        prove_held(held_now)
    for item in sorted(final_writers, key=lambda value:(value["project"],value["service"],value["id"])):
        target_policy = item["intended_restart_policy"]
        rendered = target_policy["name"]
        if rendered == "on-failure" and target_policy["maximum_retry_count"] > 0:
            rendered += f":{target_policy['maximum_retry_count']}"
        docker("update", f"--restart={rendered}", item["id"], capture=False)
    final_projection, held_projection = terminal_projection()
    for item in opened_inputs: item.recheck()
    if fault_point == "after-terminal-before-receipt":
        os.kill(os.getpid(), signal.SIGKILL)
    if fault_point == "before-receipt":
        raise ResumeError("injected before writer resume receipt")
    publish_receipt(expected_receipt(final_projection, held_projection))
    completed = True
finally:
    if mutation_started and not completed:
        compensate()
