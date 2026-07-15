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

arguments = sys.argv[1:]
if len(arguments) not in {9, 10}:
    raise RuntimeError("writer controller argument surface is invalid")
mode, run_id, run_root, docker_bin, lock_path, uid_raw, gid_raw, local_test_raw, fault_point = arguments[:9]
auxiliary_bin = arguments[9] if len(arguments) == 10 else None
uid = int(uid_raw)
gid = int(gid_raw)
local_test = local_test_raw == "1"
HEX64 = re.compile(r"^[a-f0-9]{64}$")
# Production run ids are UUIDv4; the accepted D5J joined fixture freezes
# UUIDv5 run ids derived from the run-root path, so both versions are legal.
UUID4 = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
RESUME_LEASE = re.compile(r"^(?:cutover|cutover-recovery-[1-9][0-9]*)$")
JOURNAL_LEASE = re.compile(r"^(?:cutover|cutover-recovery-[1-9][0-9]*|postcutover_schedule|credential_rotation)$")
CLASSES = {
    "production-api", "production-web", "production-worker",
    "development-api", "development-web", "development-worker",
}
ROLLBACK_CONDITIONAL_PHASES = [
    "handoff_rollback_verified",
    "qdrant_rollback_verified",
    "source_rollback_verified",
    "observability_migration_rollback_guarded",
    "base_migration_rollback_guarded",
]
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
CHECKPOINT_KEYS = {
    "schema_version", "run_id", "seq", "phase", "journal_entry_hash",
    "previous_journal_entry_hash", "journal_device", "journal_inode",
    "accepted_object_kind", "accepted_object_sha256", "resume_authority_sha256",
    "lease_epoch",
}
CAPABILITY_KEYS = {
    "schema_version", "run_id", "command_id", "command_sha256", "release_sha",
    "operator_digest", "resource_manifest_sha256", "quiesce_manifest_sha256",
    "resume_authority_sha256", "capability_input_checkpoint_sha256", "lease_epoch",
    "supersedes_capability_sha256",
}
MAX_SAFE_INTEGER = 2**53 - 1
EXPECTED_ENVIRONMENT = {
    "PATH": "/usr/sbin:/usr/bin:/sbin:/bin",
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

def reject_duplicate_json_keys(pairs):
    value = {}
    for key, item in pairs:
        require(key not in value, f"duplicate JSON key: {key}")
        value[key] = item
    return value

def strict_json_loads(data, label):
    try:
        return json.loads(data, object_pairs_hook=reject_duplicate_json_keys)
    except ResumeError:
        raise
    except Exception as exc:
        raise ResumeError(f"{label} JSON is invalid") from exc

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
            identity = lambda value: (
                value.st_dev,
                value.st_ino,
                value.st_uid,
                value.st_gid,
                stat.S_IMODE(value.st_mode),
                value.st_size,
                value.st_nlink,
            )
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
        value = strict_json_loads(self.data, self.label)
        require(isinstance(value, dict), f"{self.label} must be a JSON object")
        return value
    def recheck(self):
        current = Opened(self.path, self.label, self.identity[4])
        require(current.identity == self.identity and current.digest == self.digest, f"{self.label} changed after validation")

def exact(obj, keys, label):
    require(set(obj) == set(keys), f"{label} has a non-exact projection")

def exact_directory(path, label, expected_mode=0o700):
    require(os.path.isabs(path) and os.path.realpath(path) == path, f"{label} path is not canonical")
    value = os.lstat(path)
    require(
        stat.S_ISDIR(value.st_mode)
        and not stat.S_ISLNK(value.st_mode)
        and value.st_uid == uid
        and value.st_gid == gid
        and stat.S_IMODE(value.st_mode) == expected_mode,
        f"{label} owner or mode is invalid",
    )

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
        payload = strict_json_loads(
            docker("inspect", expected["id"]), "Docker writer inspection",
        )
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

require(mode in {"forward", "rollback", "quiesce"} and UUID4.fullmatch(run_id), "writer mode or run identity is invalid")
require(
    (mode == "quiesce" and auxiliary_bin is not None)
    or (mode in {"forward", "rollback"} and auxiliary_bin is None),
    "writer controller auxiliary executable surface is invalid",
)
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

def run_quiesce():
    require(fault_point in {"", "before-inventory", "after-inventory", "after-planned", "after-policy-no", "after-final"}, "unknown protected quiesce fault point")
    barrier_file = Opened(os.path.join(run_root, "database-barrier-receipt.json"), "database barrier receipt", 0o400)
    barrier = barrier_file.json()
    exact(barrier, {
        "schema_version", "run_id", "state", "zero_guard_residue",
        "expected_catalog_sha256", "last_command", "rollback_probes_verified",
        "probe_receipt_sha256",
    }, "database barrier receipt")
    require(
        barrier["schema_version"] == "megacampus.q12.database-barrier-receipt/v1"
        and barrier["run_id"] == run_id
        and barrier["state"] == "recovery_ready_guarded"
        and barrier["zero_guard_residue"] is False
        and barrier["last_command"] == "prepare-recovery"
        and barrier["rollback_probes_verified"] is True
        and hex64(barrier["expected_catalog_sha256"])
        and hex64(barrier["probe_receipt_sha256"]),
        "database barrier receipt is not quiesce-ready",
    )
    db_capability_path = os.path.join(run_root, "secrets", "db-capability")
    db_capability_stat = os.lstat(db_capability_path)
    require(
        stat.S_ISREG(db_capability_stat.st_mode)
        and not stat.S_ISLNK(db_capability_stat.st_mode)
        and db_capability_stat.st_uid == uid
        and db_capability_stat.st_gid == gid
        and stat.S_IMODE(db_capability_stat.st_mode) == 0o400,
        "database capability must remain present during quiesce",
    )

    journal_file = Opened(os.path.join(run_root, "phase.jsonl"), "cutover journal", 0o600)
    checkpoint_file = Opened(os.path.join(run_root, "phase-checkpoint.json"), "cutover checkpoint", 0o600)
    checkpoint = checkpoint_file.json()
    exact(checkpoint, CHECKPOINT_KEYS, "cutover checkpoint")
    raw_lines = journal_file.data.splitlines(keepends=True)
    require(raw_lines and b"".join(raw_lines) == journal_file.data, "cutover journal is empty or torn")
    journal_entries = []
    previous_hash = "0" * 64
    for sequence, raw_line in enumerate(raw_lines, start=1):
        require(raw_line.endswith(b"\n") and not raw_line.endswith(b"\r\n"), "cutover journal line ending is not canonical")
        encoded = raw_line[:-1]
        entry = strict_json_loads(encoded.decode("utf-8"), "cutover journal entry")
        exact(entry, JOURNAL_KEYS, "cutover journal entry")
        preimage = {key: value for key, value in entry.items() if key != "entry_hash"}
        require(
            canonical_json(entry, "cutover journal entry") == encoded
            and entry["schema"] == "megacampus.q12.cutover-journal/v1"
            and entry["run_id"] == run_id
            and entry["seq"] == sequence
            and entry["previous_hash"] == previous_hash
            and sha(canonical_json(preimage)) == entry["entry_hash"],
            "cutover journal chain is invalid",
        )
        journal_entries.append(entry)
        previous_hash = entry["entry_hash"]
    head = journal_entries[-1]
    require(
        checkpoint["schema_version"] == "megacampus.q12.cutover-checkpoint/v1"
        and checkpoint["run_id"] == run_id
        and checkpoint["journal_entry_hash"] == head["entry_hash"]
        and checkpoint["previous_journal_entry_hash"] == head["previous_hash"]
        and checkpoint["journal_device"] == str(journal_file.identity[0])
        and checkpoint["journal_inode"] == str(journal_file.identity[1])
        and checkpoint["phase"] == head["phase"] == "quiesced"
        and checkpoint["accepted_object_kind"] == head["accepted_object_kind"] == "none"
        and checkpoint["accepted_object_sha256"] is head["accepted_object_sha256"] is None
        and checkpoint["resume_authority_sha256"] is None
        and checkpoint["lease_epoch"] == head["lease_epoch"],
        "quiesce journal/checkpoint binding is invalid",
    )

    capabilities_root = os.path.join(run_root, "capabilities")
    exact_directory(capabilities_root, "host capability root")
    capability_directories = {
        name: os.path.join(capabilities_root, name)
        for name in ("issued", "claimed", "completed", "superseded")
    }
    for name, directory in capability_directories.items():
        exact_directory(directory, f"host capability {name} directory")
    quiesce_capabilities = []
    for location, directory in capability_directories.items():
        for directory_entry in os.scandir(directory):
            if not directory_entry.name.startswith("writers.quiesce--"):
                continue
            match = re.fullmatch(r"writers\.quiesce--((?:cutover|cutover-recovery-[1-9][0-9]*))\.json", directory_entry.name)
            require(match is not None, "writer quiesce capability basename is invalid")
            opened = Opened(directory_entry.path, f"{location} writer quiesce capability", 0o400)
            value = opened.json()
            exact(value, CAPABILITY_KEYS, "writer quiesce capability")
            require(
                opened.data == canonical_json(value) + b"\n"
                and value["schema_version"] == "megacampus.q12.host-command-capability/v1"
                and value["run_id"] == run_id
                and value["command_id"] == "writers.quiesce"
                and value["command_sha256"] == head["command_sha256"]
                and value["release_sha"] == head["release_sha"]
                and value["operator_digest"] == head["operator_digest"]
                and value["resource_manifest_sha256"] == head["resource_manifest_sha256"]
                and value["quiesce_manifest_sha256"] == "0" * 64
                and value["resume_authority_sha256"] is None
                and hex64(value["capability_input_checkpoint_sha256"])
                and value["lease_epoch"] == match.group(1)
                and (
                    value["supersedes_capability_sha256"] is None
                    or hex64(value["supersedes_capability_sha256"])
                ),
                "writer quiesce capability binding is invalid",
            )
            quiesce_capabilities.append((location, opened, value))
    def lease_ordinal(value):
        return 0 if value == "cutover" else int(value.rsplit("-", 1)[1])
    quiesce_capabilities.sort(key=lambda item: lease_ordinal(item[2]["lease_epoch"]))
    require(quiesce_capabilities, "writer quiesce capability lifecycle is empty")
    require(
        [item[2]["lease_epoch"] for item in quiesce_capabilities]
        == ["cutover", *[f"cutover-recovery-{ordinal}" for ordinal in range(1, len(quiesce_capabilities))]],
        "writer quiesce capability supersession epochs are not consecutive",
    )
    for index, (location, opened, value) in enumerate(quiesce_capabilities):
        expected_supersedes = None if index == 0 else quiesce_capabilities[index - 1][1].digest
        require(
            value["supersedes_capability_sha256"] == expected_supersedes
            and location == ("claimed" if index == len(quiesce_capabilities) - 1 else "superseded"),
            "writer quiesce capability supersession lifecycle is invalid",
        )
    _, capability_file, capability = quiesce_capabilities[-1]
    require(
        head["outcome"] == "capability_claimed"
        and head["command_id"] == "writers.quiesce"
        and head["capability_manifest_sha256"] == capability_file.digest
        and head["lease_epoch"] == capability["lease_epoch"],
        "writer quiesce claimed journal head is invalid",
    )
    quiesce_rows = [entry for entry in journal_entries if entry["phase"] == "quiesced"]
    require(all(entry["command_id"] == "writers.quiesce" for entry in quiesce_rows), "writer quiesce journal command graph is invalid")
    expected_rows = []
    for index, (_, opened, value) in enumerate(quiesce_capabilities):
        epoch_rows = [entry for entry in quiesce_rows if entry["lease_epoch"] == value["lease_epoch"]]
        observed_outcomes = [entry["outcome"] for entry in epoch_rows]
        allowed_outcomes = (
            (
                [["intent", "capability_issued", "capability_claimed"]]
                if len(quiesce_capabilities) == 1
                else [
                    ["intent"],
                    ["intent", "capability_issued"],
                    ["intent", "capability_issued", "capability_claimed"],
                ]
            )
            if index == 0
            else (
                [
                    ["recovery_reacquired", "capability_claimed"],
                    ["recovery_reacquired", "recovery_prefix_accepted", "capability_claimed"],
                ]
                if index == len(quiesce_capabilities) - 1
                else [
                    ["recovery_reacquired"],
                    ["recovery_reacquired", "recovery_prefix_accepted", "capability_claimed"],
                ]
            )
        )
        require(
            observed_outcomes in allowed_outcomes
            and all(entry["capability_manifest_sha256"] in ({"intent": "0" * 64}.get(entry["outcome"], opened.digest),) for entry in epoch_rows),
            "writer quiesce journal graph is invalid",
        )
        if "recovery_prefix_accepted" in observed_outcomes:
            overlay_row = epoch_rows[1]
            require(
                overlay_row["accepted_object_kind"] == "writer_quiesce_recovery_overlay"
                and hex64(overlay_row["accepted_object_sha256"]),
                "writer quiesce recovery overlay acceptance is invalid",
            )
        expected_rows.extend(epoch_rows)
    require(expected_rows == quiesce_rows, "writer quiesce journal recovery epochs are interleaved")
    intent_entry = quiesce_rows[0]
    capability_checkpoint_file = Opened(
        os.path.join(run_root, f"writer-quiesce-capability-checkpoint-{run_id}-{capability['lease_epoch']}.json"),
        "writer quiesce capability checkpoint",
        0o600,
    )
    input_checkpoint_file = Opened(
        os.path.join(run_root, f"writer-quiesce-input-checkpoint-{run_id}-{capability['lease_epoch']}.json"),
        "writer quiesce input checkpoint",
        0o600,
    )
    def quiesce_checkpoint_matches(value, entry):
        exact(value, CHECKPOINT_KEYS, "writer quiesce checkpoint")
        return (
            value["schema_version"] == "megacampus.q12.cutover-checkpoint/v1"
            and value["run_id"] == run_id
            and value["seq"] == entry["seq"]
            and value["phase"] == entry["phase"]
            and value["journal_entry_hash"] == entry["entry_hash"]
            and value["previous_journal_entry_hash"] == entry["previous_hash"]
            and value["journal_device"] == str(journal_file.identity[0])
            and value["journal_inode"] == str(journal_file.identity[1])
            and value["accepted_object_kind"] == entry["accepted_object_kind"]
            and value["accepted_object_sha256"] == entry["accepted_object_sha256"]
            and value["resume_authority_sha256"] is None
            and value["lease_epoch"] == entry["lease_epoch"]
        )
    capability_predecessor = intent_entry
    if capability["lease_epoch"] != "cutover":
        first_quiesce_index = journal_entries.index(intent_entry)
        require(first_quiesce_index > 0, "writer quiesce recovery predecessor is missing")
        capability_predecessor = journal_entries[first_quiesce_index - 1]
    require(
        quiesce_checkpoint_matches(capability_checkpoint_file.json(), capability_predecessor)
        and capability_checkpoint_file.digest == capability["capability_input_checkpoint_sha256"],
        "writer quiesce capability checkpoint is invalid",
    )
    for index, (_, _, historical_capability) in enumerate(quiesce_capabilities):
        historical_checkpoint = Opened(
            os.path.join(
                run_root,
                f"writer-quiesce-capability-checkpoint-{run_id}-{historical_capability['lease_epoch']}.json",
            ),
            "historical writer quiesce capability checkpoint",
            0o600,
        )
        expected_checkpoint_entry = intent_entry if index == 0 else capability_predecessor
        require(
            quiesce_checkpoint_matches(historical_checkpoint.json(), expected_checkpoint_entry)
            and historical_checkpoint.digest == historical_capability["capability_input_checkpoint_sha256"],
            "historical writer quiesce capability checkpoint is invalid",
        )
    require(
        quiesce_checkpoint_matches(input_checkpoint_file.json(), head)
        and input_checkpoint_file.data == checkpoint_file.data,
        "writer quiesce input checkpoint is invalid",
    )

    def publish_immutable(path, label, value):
        encoded = canonical_json(value, label) + b"\n"
        if os.path.lexists(path):
            existing = Opened(path, label, 0o400)
            require(existing.data == encoded, f"existing {label} is non-exact")
            return existing
        temporary = path + ".tmp"
        require(not os.path.lexists(temporary), f"unknown {label} temporary residue exists")
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
        try:
            os.write(fd, encoded)
            os.fchown(fd, uid, gid)
            os.fchmod(fd, 0o400)
            os.fsync(fd)
        finally:
            os.close(fd)
        rename_noreplace(temporary, path)
        directory_fd = os.open(run_root, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
        published = Opened(path, label, 0o400)
        require(published.data == encoded, f"published {label} identity is invalid")
        return published

    def raw_inspect(writer_id):
        rows = strict_json_loads(docker("inspect", writer_id), "Docker writer inspection")
        require(isinstance(rows, list) and len(rows) == 1, "writer identity is missing or duplicated")
        return rows[0]

    def probe_closed_inbound():
        for host in ("ai.megacampus.ru", "dev.ai.megacampus.ru"):
            probe_directory = tempfile.mkdtemp(prefix=".inbound-probe.", dir=run_root)
            headers_path = os.path.join(probe_directory, "headers")
            body_path = os.path.join(probe_directory, "body")
            try:
                probe = subprocess.run(
                    [
                        auxiliary_bin,
                        "--silent", "--show-error", "--http1.1", "--proto", "=https",
                        "--max-redirs", "0", "--user-agent", "mc2-q12-inbound-probe/1",
                        "--dump-header", headers_path, "--output", body_path,
                        "--write-out", "%{http_code}", "--max-filesize", "512",
                        "--resolve", f"{host}:443:127.0.0.1", "--connect-timeout", "10",
                        "--max-time", "30", f"https://{host}/",
                    ],
                    text=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    env=docker_environment,
                    close_fds=True,
                )
                require(probe.returncode == 0, f"closed inbound probe failed for {host}")
                directory_stat = os.lstat(probe_directory)
                require(
                    stat.S_ISDIR(directory_stat.st_mode)
                    and directory_stat.st_uid == uid
                    and directory_stat.st_gid == gid
                    and stat.S_IMODE(directory_stat.st_mode) == 0o700,
                    "closed inbound probe directory identity is invalid",
                )
                headers = Opened(headers_path, "closed inbound probe headers", 0o600).data
                body = Opened(body_path, "closed inbound probe body", 0o600).data
                require(len(body) <= 512 and headers.endswith(b"\r\n\r\n"), "closed inbound probe framing is invalid")
                lines = headers[:-4].split(b"\r\n")
                require(lines and all(lines), "closed inbound probe headers are invalid")
                status_match = re.fullmatch(rb"HTTP/1\.1 (502 Bad Gateway|503 Service Temporarily Unavailable)", lines[0])
                require(status_match is not None, "closed inbound probe status is invalid")
                reason = status_match.group(1).decode("ascii")
                require(probe.stdout == reason.split(" ", 1)[0], "closed inbound probe reported status is invalid")
                values = {}
                for raw in lines[1:]:
                    require(b":" in raw and raw[:1] not in b" \t", "closed inbound probe header is malformed")
                    raw_name, raw_value = raw.split(b":", 1)
                    try:
                        name = raw_name.decode("ascii").lower()
                        value = raw_value.strip(b" \t").decode("ascii")
                    except UnicodeDecodeError as exc:
                        raise ResumeError("closed inbound probe header is non-ASCII") from exc
                    require(re.fullmatch(r"[!#$%&'*+.^_`|~0-9a-z-]+", name) is not None, "closed inbound probe header name is invalid")
                    values.setdefault(name, []).append(value)
                require(
                    all(len(values.get(key, [])) == 1 for key in ("server", "content-type", "content-length"))
                    and "transfer-encoding" not in values
                    and values["content-type"][0] == "text/html",
                    "closed inbound probe critical headers are invalid",
                )
                server = values["server"][0]
                require(
                    re.fullmatch(r"nginx(?:/[0-9]+\.[0-9]+\.[0-9]+(?: \([A-Za-z0-9][A-Za-z0-9 ._+~:-]{0,63}\))?)?", server) is not None,
                    "closed inbound probe server header is invalid",
                )
                content_length = values["content-length"][0]
                require(
                    re.fullmatch(r"0|[1-9][0-9]*", content_length) is not None
                    and int(content_length) == len(body),
                    "closed inbound probe content length is invalid",
                )
                expected_body = (
                    f"<html>\r\n<head><title>{reason}</title></head>\r\n<body>\r\n"
                    f"<center><h1>{reason}</h1></center>\r\n<hr><center>{server}</center>\r\n"
                    "</body>\r\n</html>\r\n"
                ).encode("ascii")
                require(body == expected_body, "closed inbound probe body is invalid")
            finally:
                for path in (headers_path, body_path):
                    try:
                        os.unlink(path)
                    except FileNotFoundError:
                        pass
                os.rmdir(probe_directory)

    inventory_path = os.path.join(run_root, f"writer-quiesce-inventory-{run_id}.json")
    planned_path = os.path.join(run_root, f"writer-quiesce-policy-change-planned-{run_id}.json")
    policy_path = os.path.join(run_root, f"writer-quiesce-policy-no-verified-{run_id}.json")
    final_path = os.path.join(run_root, f"writer-quiesce-{run_id}.json")
    terminal_path = os.path.join(run_root, f"writer-quiesce-quiesced-{run_id}.json")
    for name in os.listdir(run_root):
        require(
            not (
                (name.startswith("writer-quiesce-") or name.startswith(".writer-quiesce-"))
                and (name.endswith(".tmp") or "abandon" in name)
            ),
            "unknown writer quiesce temporary or abandonment residue exists",
        )

    quiesce_writer_keys = {
        "class", "id", "name", "project", "service", "config_files", "working_dir",
        "image_id", "image_ref", "prior_running", "prior_status", "healthcheck_present",
        "prior_health_status", "prior_restart_policy", "temporary_restart_policy",
    }
    def validate_quiesce_writers(values):
        require(isinstance(values, list) and len(values) == 10, "writer quiesce inventory is not exact")
        require(values == sorted(values, key=lambda value: (value["project"], value["service"], value["id"])), "writer quiesce inventory order is invalid")
        require(len({value.get("id") for value in values}) == 10, "writer quiesce identities are duplicated")
        for writer in values:
            exact(writer, quiesce_writer_keys, "writer quiesce inventory row")
            require(
                writer["class"] in CLASSES
                and hex64(writer["id"])
                and all(isinstance(writer[key], str) and writer[key] for key in ("name", "project", "service", "config_files", "working_dir", "image_id", "image_ref"))
                and isinstance(writer["prior_running"], bool)
                and writer["prior_status"] == ("running" if writer["prior_running"] else writer["prior_status"])
                and (writer["prior_running"] or writer["prior_status"] in {"created", "exited"})
                and isinstance(writer["healthcheck_present"], bool)
                and writer["prior_health_status"] == ("healthy" if writer["healthcheck_present"] else None)
                and policy(writer["prior_restart_policy"])
                and writer["temporary_restart_policy"] == {"name": "no", "maximum_retry_count": 0},
                "writer quiesce inventory row is invalid",
            )
        require(
            sum(value["class"] == "production-api" for value in values) == 1
            and sum(value["class"] == "production-web" for value in values) == 1
            and sum(value["class"] == "production-worker" for value in values) == 3
            and sum(value["class"] == "development-api" for value in values) == 1
            and sum(value["class"] == "development-web" for value in values) == 1
            and sum(value["class"] == "development-worker" for value in values) == 3,
            "writer quiesce class counts are invalid",
        )

    existing_inventory = os.path.lexists(inventory_path)
    if fault_point == "before-inventory" and not existing_inventory:
        os.kill(os.getpid(), signal.SIGKILL)
    policy_already_published = False
    if existing_inventory:
        inventory_file = Opened(inventory_path, "writer quiesce inventory", 0o400)
        inventory_value = inventory_file.json()
        exact(inventory_value, {
            "schema_version", "run_id", "command_id", "lease_epoch", "capability_sha256",
            "capability_input_checkpoint_sha256", "input_checkpoint_sha256",
            "database_barrier_receipt_sha256", "writers",
        }, "writer quiesce inventory")
        require(
            inventory_file.data == canonical_json(inventory_value) + b"\n"
            and inventory_value["schema_version"] == "megacampus.q12.writer-quiesce-inventory/v1"
            and inventory_value["run_id"] == run_id
            and inventory_value["command_id"] == "writers.quiesce"
            and inventory_value["lease_epoch"] == quiesce_capabilities[0][2]["lease_epoch"] == "cutover"
            and inventory_value["capability_sha256"] == quiesce_capabilities[0][1].digest
            and inventory_value["capability_input_checkpoint_sha256"] == quiesce_capabilities[0][2]["capability_input_checkpoint_sha256"]
            and hex64(inventory_value["input_checkpoint_sha256"])
            and inventory_value["database_barrier_receipt_sha256"] == barrier_file.digest,
            "writer quiesce inventory binding is invalid",
        )
        initial_claimed_entry = next(
            entry
            for entry in quiesce_rows
            if entry["lease_epoch"] == "cutover" and entry["outcome"] == "capability_claimed"
        )
        initial_input_checkpoint = Opened(
            os.path.join(run_root, f"writer-quiesce-input-checkpoint-{run_id}-cutover.json"),
            "initial writer quiesce input checkpoint",
            0o600,
        )
        require(
            quiesce_checkpoint_matches(initial_input_checkpoint.json(), initial_claimed_entry)
            and initial_input_checkpoint.digest == inventory_value["input_checkpoint_sha256"],
            "initial writer quiesce input checkpoint is invalid",
        )
        writers = inventory_value["writers"]
        validate_quiesce_writers(writers)
        raw_rows = {}
        for writer in writers:
            row = raw_inspect(writer["id"])
            raw_rows[writer["id"]] = row
            labels = row.get("Config", {}).get("Labels", {})
            state = row.get("State", {})
            health = state.get("Health")
            require(
                row.get("Id") == writer["id"]
                and row.get("Name") == writer["name"]
                and labels.get("com.docker.compose.project") == writer["project"]
                and labels.get("com.docker.compose.service") == writer["service"]
                and labels.get("com.docker.compose.project.config_files") == writer["config_files"]
                and labels.get("com.docker.compose.project.working_dir") == writer["working_dir"]
                and row.get("Image") == writer["image_id"]
                and row.get("Config", {}).get("Image") == writer["image_ref"]
                and (health is not None) == writer["healthcheck_present"]
                and state.get("Restarting") is False
                and not (writer["prior_running"] is False and state.get("Running") is True),
                "writer quiesce durable identity changed",
            )

        planned_file = Opened(planned_path, "writer quiesce planned transition", 0o400) if os.path.lexists(planned_path) else None
        policy_file = Opened(policy_path, "writer quiesce policy-no transition", 0o400) if os.path.lexists(policy_path) else None
        policy_already_published = policy_file is not None
        final_file = Opened(final_path, "writer quiesce manifest", 0o400) if os.path.lexists(final_path) else None
        terminal_file = Opened(terminal_path, "writer quiesce terminal transition", 0o400) if os.path.lexists(terminal_path) else None
        require(not (policy_file and not planned_file) and not (final_file and not policy_file) and not (terminal_file and not final_file), "writer quiesce evidence is not a prefix")
        transition_base = {
            "schema_version": "megacampus.q12.writer-quiesce-transition/v1",
            "run_id": run_id,
            "inventory_sha256": inventory_file.digest,
            "input_checkpoint_sha256": inventory_value["input_checkpoint_sha256"],
            "database_barrier_receipt_sha256": barrier_file.digest,
        }
        planned_value = {**transition_base, "state": "policy_change_planned", "previous_transition_sha256": None, "writer_quiesce_manifest_sha256": None}
        if planned_file:
            require(planned_file.data == canonical_json(planned_value) + b"\n", "existing writer quiesce planned transition is non-exact")
        policy_value = {**transition_base, "state": "policy_no_verified", "previous_transition_sha256": planned_file.digest if planned_file else None, "writer_quiesce_manifest_sha256": None}
        if policy_file:
            require(policy_file.data == canonical_json(policy_value) + b"\n", "existing writer quiesce policy-no transition is non-exact")

        if final_file:
            final_value = {
                "schema_version": "megacampus.q12.writer-quiesce/v1",
                "run_id": run_id,
                "status": "quiesced",
                "barrier": {
                    "state": barrier["state"],
                    "zero_guard_residue": barrier["zero_guard_residue"],
                    "expected_catalog_sha256": barrier["expected_catalog_sha256"],
                    "probe_receipt_sha256": barrier["probe_receipt_sha256"],
                },
                "writers": writers,
            }
            require(final_file.data == canonical_json(final_value) + b"\n", "existing writer quiesce manifest is non-exact")
            for writer in writers:
                require(is_stopped_no(raw_rows[writer["id"]]), "writer final quiesce state changed")
            terminal_value = {**transition_base, "state": "quiesced", "previous_transition_sha256": policy_file.digest, "writer_quiesce_manifest_sha256": final_file.digest}
            publish_immutable(terminal_path, "writer quiesce terminal transition", terminal_value)
            return

        require(capability["lease_epoch"] != "cutover", "writer quiesce prefix requires a recovery capability")
        overlay_names = [
            name for name in os.listdir(run_root)
            if name.startswith(f"writer-quiesce-recovery-overlay-{run_id}-")
        ]
        overlay_names.sort(
            key=lambda name: int(
                re.fullmatch(
                    rf"writer-quiesce-recovery-overlay-{re.escape(run_id)}-cutover-recovery-([1-9][0-9]*)\.json",
                    name,
                ).group(1)
            )
            if re.fullmatch(
                rf"writer-quiesce-recovery-overlay-{re.escape(run_id)}-cutover-recovery-([1-9][0-9]*)\.json",
                name,
            )
            else -1
        )
        require(len(overlay_names) == len(quiesce_capabilities) - 1, "writer quiesce recovery overlay lifecycle is ambiguous")
        previous_overlay_sha256 = None
        for index, name in enumerate(overlay_names, start=1):
            expected_epoch = f"cutover-recovery-{index}"
            require(name == f"writer-quiesce-recovery-overlay-{run_id}-{expected_epoch}.json", "writer quiesce recovery overlay basename is invalid")
            overlay_file = Opened(os.path.join(run_root, name), "writer quiesce recovery overlay", 0o400)
            overlay = overlay_file.json()
            exact(overlay, {
                "schema_version", "run_id", "lease_epoch", "prior_capability_sha256",
                "new_capability_sha256", "recovery_checkpoint_sha256", "inventory_sha256",
                "initial_capability_input_checkpoint_sha256", "initial_input_checkpoint_sha256",
                "last_transition_state", "last_transition_sha256", "previous_overlay_sha256",
                "continuation",
            }, "writer quiesce recovery overlay")
            recovery_row = next(entry for entry in quiesce_rows if entry["lease_epoch"] == expected_epoch and entry["outcome"] == "recovery_reacquired")
            recovery_checkpoint_value = {
                "schema_version": "megacampus.q12.cutover-checkpoint/v1",
                "run_id": run_id,
                "seq": recovery_row["seq"],
                "phase": recovery_row["phase"],
                "journal_entry_hash": recovery_row["entry_hash"],
                "previous_journal_entry_hash": recovery_row["previous_hash"],
                "journal_device": str(journal_file.identity[0]),
                "journal_inode": str(journal_file.identity[1]),
                "accepted_object_kind": recovery_row["accepted_object_kind"],
                "accepted_object_sha256": recovery_row["accepted_object_sha256"],
                "resume_authority_sha256": None,
                "lease_epoch": recovery_row["lease_epoch"],
            }
            declared_last_state = overlay["last_transition_state"]
            expected_last_sha256 = {
                "inventory_only": None,
                "policy_change_planned": planned_file.digest if planned_file else "missing",
                "policy_no_verified": policy_file.digest if policy_file else "missing",
            }.get(declared_last_state, "invalid")
            require(overlay_file.data == canonical_json(overlay) + b"\n", "writer quiesce recovery overlay bytes are non-canonical")
            require(
                overlay["schema_version"] == "megacampus.q12.writer-quiesce-recovery-overlay/v1"
                and overlay["run_id"] == run_id
                and overlay["lease_epoch"] == expected_epoch,
                "writer quiesce recovery overlay identity is invalid",
            )
            require(
                overlay["prior_capability_sha256"] == quiesce_capabilities[index - 1][1].digest
                and overlay["new_capability_sha256"] == quiesce_capabilities[index][1].digest,
                "writer quiesce recovery overlay capability chain is invalid",
            )
            require(
                overlay["recovery_checkpoint_sha256"] == sha(canonical_json(recovery_checkpoint_value) + b"\n"),
                "writer quiesce recovery overlay checkpoint binding is invalid",
            )
            require(
                overlay["inventory_sha256"] == inventory_file.digest
                and overlay["initial_capability_input_checkpoint_sha256"] == inventory_value["capability_input_checkpoint_sha256"]
                and overlay["initial_input_checkpoint_sha256"] == inventory_value["input_checkpoint_sha256"],
                "writer quiesce recovery overlay initial prefix binding is invalid",
            )
            require(
                expected_last_sha256 not in {"missing", "invalid"}
                and overlay["last_transition_sha256"] == expected_last_sha256,
                "writer quiesce recovery overlay last transition is invalid",
            )
            require(
                overlay["previous_overlay_sha256"] == previous_overlay_sha256
                and overlay["continuation"] == "monotonic_quiesce_only",
                "writer quiesce recovery overlay continuation chain is invalid",
            )
            accepted_rows = [entry for entry in quiesce_rows if entry["lease_epoch"] == expected_epoch and entry["outcome"] == "recovery_prefix_accepted"]
            require(
                (len(accepted_rows) == 1 and accepted_rows[0]["accepted_object_sha256"] == overlay_file.digest)
                if index == len(overlay_names)
                else len(accepted_rows) in {0, 1} and (not accepted_rows or accepted_rows[0]["accepted_object_sha256"] == overlay_file.digest),
                "writer quiesce recovery overlay acceptance hash is invalid",
            )
            previous_overlay_sha256 = overlay_file.digest
    else:
        writer_ids = []
        for project in ("megacampus-blue", "megacampus-green", "megacampus"):
            writer_ids.extend(
                value for value in docker("ps", "-aq", "--no-trunc", "--filter", f"label=com.docker.compose.project={project}").splitlines()
                if value
            )
        require(len(writer_ids) == 10 and len(set(writer_ids)) == 10, "writer quiesce inventory is not exact")
        writers = []
        raw_rows = {}
        for writer_id in writer_ids:
            row = raw_inspect(writer_id)
            raw_rows[writer_id] = row
            labels = row.get("Config", {}).get("Labels", {})
            project = labels.get("com.docker.compose.project")
            service = labels.get("com.docker.compose.service")
            if service in {"api", "web"}:
                writer_class = f"production-{service}"
            elif service in {"api-dev", "web-dev"}:
                writer_class = f"development-{service[:-4]}"
            else:
                writer_class = "development-worker" if isinstance(service, str) and service.endswith("-dev") else "production-worker"
            state = row.get("State", {})
            health = state.get("Health")
            restart = row.get("HostConfig", {}).get("RestartPolicy", {})
            writer = {
                "class": writer_class,
                "id": row.get("Id"),
                "name": row.get("Name"),
                "project": project,
                "service": service,
                "config_files": labels.get("com.docker.compose.project.config_files"),
                "working_dir": labels.get("com.docker.compose.project.working_dir"),
                "image_id": row.get("Image"),
                "image_ref": row.get("Config", {}).get("Image"),
                "prior_running": state.get("Running"),
                "prior_status": state.get("Status"),
                "healthcheck_present": health is not None,
                "prior_health_status": None if health is None else health.get("Status"),
                "prior_restart_policy": {"name": restart.get("Name"), "maximum_retry_count": restart.get("MaximumRetryCount")},
                "temporary_restart_policy": {"name": "no", "maximum_retry_count": 0},
            }
            writers.append(writer)
        writers.sort(key=lambda value: (value["project"], value["service"], value["id"]))
        validate_quiesce_writers(writers)
    require(
        sum(value["class"] == "production-api" for value in writers) == 1
        and sum(value["class"] == "production-web" for value in writers) == 1
        and sum(value["class"] == "production-worker" for value in writers) == 3
        and sum(value["class"] == "development-api" for value in writers) == 1
        and sum(value["class"] == "development-web" for value in writers) == 1
        and sum(value["class"] == "development-worker" for value in writers) == 3,
        "writer quiesce class counts are invalid",
    )
    if not existing_inventory:
        inventory_value = {
            "schema_version": "megacampus.q12.writer-quiesce-inventory/v1",
            "run_id": run_id,
            "command_id": "writers.quiesce",
            "lease_epoch": capability["lease_epoch"],
            "capability_sha256": capability_file.digest,
            "capability_input_checkpoint_sha256": capability_checkpoint_file.digest,
            "input_checkpoint_sha256": input_checkpoint_file.digest,
            "database_barrier_receipt_sha256": barrier_file.digest,
            "writers": writers,
        }
        inventory_file = publish_immutable(inventory_path, "writer quiesce inventory", inventory_value)
    if fault_point == "after-inventory": os.kill(os.getpid(), signal.SIGKILL)
    transition_base = {
        "schema_version": "megacampus.q12.writer-quiesce-transition/v1",
        "run_id": run_id,
        "inventory_sha256": inventory_file.digest,
        "input_checkpoint_sha256": inventory_value["input_checkpoint_sha256"],
        "database_barrier_receipt_sha256": barrier_file.digest,
    }
    planned_value = {**transition_base, "state": "policy_change_planned", "previous_transition_sha256": None, "writer_quiesce_manifest_sha256": None}
    planned_file = publish_immutable(os.path.join(run_root, f"writer-quiesce-policy-change-planned-{run_id}.json"), "writer quiesce planned transition", planned_value)
    if fault_point == "after-planned": os.kill(os.getpid(), signal.SIGKILL)
    if not policy_already_published:
        for writer in writers:
            docker("update", "--restart=no", writer["id"], capture=False)
    for writer in writers:
        row = raw_inspect(writer["id"])
        require(row.get("HostConfig", {}).get("RestartPolicy") == {"Name": "no", "MaximumRetryCount": 0}, "writer restart=no policy did not persist")
    policy_value = {**transition_base, "state": "policy_no_verified", "previous_transition_sha256": planned_file.digest, "writer_quiesce_manifest_sha256": None}
    policy_file = publish_immutable(os.path.join(run_root, f"writer-quiesce-policy-no-verified-{run_id}.json"), "writer quiesce policy-no transition", policy_value)
    if fault_point == "after-policy-no": os.kill(os.getpid(), signal.SIGKILL)
    for writer_class in ("production-api", "development-api", "production-web", "development-web"):
        for writer in writers:
            if writer["class"] == writer_class and raw_rows[writer["id"]].get("State", {}).get("Running"):
                docker("stop", "--time", "30", writer["id"], capture=False)
    probe_closed_inbound()
    for writer_class in ("production-worker", "development-worker"):
        for writer in writers:
            if writer["class"] == writer_class and raw_rows[writer["id"]].get("State", {}).get("Running"):
                docker("stop", "--time", "30", writer["id"], capture=False)
    for writer in writers:
        row = raw_inspect(writer["id"])
        require(is_stopped_no(row), "writer did not reach exact stopped/no quiesce state")
    final_value = {
        "schema_version": "megacampus.q12.writer-quiesce/v1",
        "run_id": run_id,
        "status": "quiesced",
        "barrier": {
            "state": barrier["state"],
            "zero_guard_residue": barrier["zero_guard_residue"],
            "expected_catalog_sha256": barrier["expected_catalog_sha256"],
            "probe_receipt_sha256": barrier["probe_receipt_sha256"],
        },
        "writers": writers,
    }
    final_file = publish_immutable(os.path.join(run_root, f"writer-quiesce-{run_id}.json"), "writer quiesce manifest", final_value)
    if fault_point == "after-final": os.kill(os.getpid(), signal.SIGKILL)
    terminal_value = {**transition_base, "state": "quiesced", "previous_transition_sha256": policy_file.digest, "writer_quiesce_manifest_sha256": final_file.digest}
    publish_immutable(os.path.join(run_root, f"writer-quiesce-quiesced-{run_id}.json"), "writer quiesce terminal transition", terminal_value)

if mode == "quiesce":
    run_quiesce()
    raise SystemExit(0)

paths = {
    "db_capability": os.path.join(run_root, "secrets", "db-capability"),
    "capabilities": os.path.join(run_root, "capabilities"),
    "barrier": os.path.join(run_root, "database-barrier-receipt.json"),
    "probe": os.path.join(run_root, "database-barrier-probe-receipt.json"),
    "quiesce": os.path.join(run_root, f"writer-quiesce-{run_id}.json"),
    "recovery": os.path.join(run_root, f"writer-recovery-state-{run_id}.json"),
    "final": os.path.join(run_root, f"final-writer-manifest-{mode}-{run_id}.json"),
    "handoff": os.path.join(run_root, f"writer-handoff-state-{run_id}.json"),
    "rollback": os.path.join(run_root, f"writer-rollback-state-{run_id}.json"),
    "authority": os.path.join(run_root, f"writer-resume-authority-{run_id}.json"),
    "terminal": os.path.join(run_root, f"writer-resume-state-{run_id}.json"),
    "terminal_temporary": os.path.join(run_root, ".writer-resume-state.tmp"),
    "journal": os.path.join(run_root, "phase.jsonl"),
    "checkpoint": os.path.join(run_root, "phase-checkpoint.json"),
}
require(
    not os.path.lexists(paths["db_capability"]),
    "database capability still exists and must be absent before writer resume",
)
unexpected_terminal_residue = [
    name for name in os.listdir(run_root)
    if name.startswith(".writer-resume-state.")
    and os.path.join(run_root, name) != paths["terminal_temporary"]
]
require(not unexpected_terminal_residue, "unexpected writer resume temporary residue exists")
startup_terminal_temporary = None
if os.path.lexists(paths["terminal_temporary"]):
    startup_terminal_temporary = Opened(
        paths["terminal_temporary"], "writer resume temporary", 0o400,
    )

barrier_file = Opened(paths["barrier"], "database barrier receipt", 0o400)
barrier = barrier_file.json()
exact(barrier, {"schema_version","run_id","state","expected_catalog_sha256","zero_guard_residue","last_command","rollback_probes_verified","probe_receipt_sha256","terminal_proof_sha256","database_capability_deleted"}, "database barrier receipt")
require(
    barrier_file.data == canonical_json(barrier, "database barrier receipt") + b"\n"
    and barrier["schema_version"] == "megacampus.q12.database-barrier-receipt/v2"
    and barrier["run_id"] == run_id
    and barrier["state"] == "guard_cleanup_complete"
    and barrier["zero_guard_residue"] is True
    and barrier["database_capability_deleted"] is True
    and hex64(barrier["expected_catalog_sha256"])
    and hex64(barrier["terminal_proof_sha256"]),
    "database barrier receipt v2 is not exact terminal authority",
)
database_operation = "cleanup" if mode == "forward" else "rollback"
if mode == "forward":
    require(barrier["last_command"] == "cleanup" and barrier["rollback_probes_verified"] is True and hex64(barrier["probe_receipt_sha256"]), "forward cleanup receipt is invalid")
    probe_file = Opened(paths["probe"], "database barrier probe receipt", 0o400)
    require(probe_file.digest == barrier["probe_receipt_sha256"], "database barrier probe receipt hash mismatch")
    probe = probe_file.json()
    exact(probe, {"schema_version","run_id","expected_catalog_sha256","completed_at","probes","residue"}, "database barrier probe receipt")
    require(probe["schema_version"] == "megacampus.q12.database-barrier-probes/v1" and probe["run_id"] == run_id and probe["expected_catalog_sha256"] == barrier["expected_catalog_sha256"] and isinstance(probe["completed_at"], str) and re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z", probe["completed_at"]), "database barrier probe receipt binding is invalid")
    expected_probes = {
        "postgrest_anon":"rejected",
        "postgrest_authenticated":"rejected",
        "postgrest_service_role_without_capability":"rejected",
        "postgrest_service_role_with_capability":"rolled_back",
        "postgrest_preference_applied":"tx=rollback",
        "auth_profile":"rejected_zero_residue",
        "storage_object":"rejected_zero_metadata_zero_bytes",
        "cron_rpc":"rejected_exact_jobs_unchanged",
        "pg_net_rpc":"rejected_zero_queue_zero_external_request",
        "direct_supervisor":"rolled_back",
    }
    expected_residue = {
        "guard_probe_rows":0,
        "auth_rows":0,
        "storage_metadata_rows":0,
        "storage_object_bytes":0,
        "cron_job_set_unchanged":True,
        "pg_net_queue_rows":0,
        "external_requests":0,
    }
    require(
        probe["probes"] == expected_probes and probe["residue"] == expected_residue,
        "database barrier probe receipt nested projection is not exact",
    )
else:
    require(barrier["last_command"] == "rollback" and barrier["rollback_probes_verified"] is False and barrier["probe_receipt_sha256"] is None, "rollback cleanup receipt is invalid")

database_baseline_file = Opened(
    os.path.join(run_root, "database-barrier-baseline.json"),
    "database barrier baseline",
    0o400,
)
database_baseline = database_baseline_file.json()
exact(database_baseline, {"schema_version","run_id","state","source_baseline_sha256","baseline_sha256","predecessor_checkpoint_sha256","predecessor_journal_entry_hash","resource_manifest_sha256","expected_post_migration_catalog_sha256","database_capability_sha256","baseline"}, "database barrier baseline")
exact(database_baseline["baseline"], {"baseline_structural_catalog_sha256","database_default_sha256","cron_jobs_sha256","guarded_relations_sha256","pg_net_queue_count"}, "database barrier baseline projection")
require(
    database_baseline_file.data == canonical_json(database_baseline, "database barrier baseline") + b"\n"
    and database_baseline["schema_version"] == "megacampus.q12.database-barrier-baseline/v1"
    and database_baseline["run_id"] == run_id
    and database_baseline["state"] == "maintenance_guarded_baseline"
    and database_baseline["expected_post_migration_catalog_sha256"] == barrier["expected_catalog_sha256"]
    and all(hex64(database_baseline[key]) for key in ("source_baseline_sha256","baseline_sha256","predecessor_checkpoint_sha256","predecessor_journal_entry_hash","resource_manifest_sha256","database_capability_sha256"))
    and all(hex64(database_baseline["baseline"][key]) for key in ("baseline_structural_catalog_sha256","database_default_sha256","cron_jobs_sha256","guarded_relations_sha256"))
    and database_baseline["baseline"]["pg_net_queue_count"] == 0
    and database_baseline["baseline_sha256"] == sha(canonical_json(database_baseline["baseline"], "database barrier baseline projection")),
    "database barrier baseline is invalid",
)
database_archive_file = Opened(
    os.path.join(run_root, f"database-barrier-receipt-v1-before-{database_operation}.json"),
    "database barrier predecessor receipt archive",
    0o400,
)
database_archive = database_archive_file.json()
exact(database_archive, {"schema_version","run_id","state","zero_guard_residue","expected_catalog_sha256","last_command","rollback_probes_verified","probe_receipt_sha256"}, "database barrier predecessor receipt archive")
require(
    database_archive_file.data == canonical_json(database_archive, "database barrier predecessor receipt archive") + b"\n"
    and database_archive["schema_version"] == "megacampus.q12.database-barrier-receipt/v1"
    and database_archive["run_id"] == run_id
    and database_archive["expected_catalog_sha256"] == barrier["expected_catalog_sha256"]
    and database_archive["zero_guard_residue"] is False,
    "database barrier predecessor receipt archive is invalid",
)
if mode == "forward":
    require(
        database_archive["state"] == "activated"
        and database_archive["last_command"] == "activate"
        and database_archive["rollback_probes_verified"] is True
        and database_archive["probe_receipt_sha256"] == barrier["probe_receipt_sha256"],
        "cleanup predecessor receipt archive is invalid",
    )
else:
    rollback_receipt_commands = {
        "maintenance_guarded": "install",
        "20260711140000_guard_verified": "verify-extended",
        "20260711151000_guard_verified": "verify-extended",
        "recovery_ready_guarded": "prepare-recovery",
    }
    require(
        database_archive["state"] in rollback_receipt_commands
        and database_archive["last_command"] == rollback_receipt_commands[database_archive["state"]]
        and database_archive["rollback_probes_verified"] is False
        and database_archive["probe_receipt_sha256"] is None,
        "rollback predecessor receipt archive is invalid",
    )
database_proof_file = Opened(
    os.path.join(run_root, f"database-barrier-{database_operation}-terminal-proof.json"),
    "database barrier terminal proof",
    0o400,
)
database_proof = database_proof_file.json()
exact(database_proof, {"schema_version","run_id","operation","state","expected_post_migration_catalog_sha256","database_barrier_baseline_sha256","predecessor_receipt_sha256","predecessor_receipt_archive_sha256","database_barrier_rollback_intent_sha256","input_checkpoint_sha256","intent_journal_entry_hash","structural_catalog_sha256","database_default_sha256","cron_jobs_sha256","guard_residue","required_phase_receipts_sha256","database_capability_sha256","completed_at"}, "database barrier terminal proof")
exact(database_proof["guard_residue"], {"q12_guard_schema_count","q12_guard_relation_count","q12_guard_function_count","q12_guard_type_count","q12_guard_trigger_count","q12_guard_event_trigger_count","barrier_era_session_count"}, "database barrier terminal residue")
require(
    database_proof_file.data == canonical_json(database_proof, "database barrier terminal proof") + b"\n"
    and database_proof_file.digest == barrier["terminal_proof_sha256"]
    and database_proof["schema_version"] == "megacampus.q12.database-barrier-terminal-proof/v1"
    and database_proof["run_id"] == run_id
    and database_proof["operation"] == database_operation
    and database_proof["state"] == "guard_cleanup_complete"
    and database_proof["expected_post_migration_catalog_sha256"] == barrier["expected_catalog_sha256"]
    and database_proof["database_barrier_baseline_sha256"] == database_baseline_file.digest
    and database_proof["predecessor_receipt_sha256"] == database_archive_file.digest
    and database_proof["predecessor_receipt_archive_sha256"] == database_archive_file.digest
    and database_proof["database_capability_sha256"] == database_baseline["database_capability_sha256"]
    and database_proof["database_default_sha256"] == database_baseline["baseline"]["database_default_sha256"]
    and database_proof["cron_jobs_sha256"] == database_baseline["baseline"]["cron_jobs_sha256"]
    and database_proof["guard_residue"] == {key: 0 for key in database_proof["guard_residue"]}
    and hex64(database_proof["input_checkpoint_sha256"])
    and hex64(database_proof["intent_journal_entry_hash"])
    and hex64(database_proof["structural_catalog_sha256"])
    and isinstance(database_proof["completed_at"], str)
    and re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z", database_proof["completed_at"]),
    "database barrier terminal proof binding is invalid",
)
require(
    database_proof["structural_catalog_sha256"]
    == (barrier["expected_catalog_sha256"] if mode == "forward" else database_baseline["baseline"]["baseline_structural_catalog_sha256"]),
    "database barrier terminal structural catalog is invalid",
)
database_rollback_intent_file = None
if mode == "forward":
    require(
        database_proof["database_barrier_rollback_intent_sha256"] is None
        and database_proof["required_phase_receipts_sha256"] is None,
        "cleanup terminal proof has rollback evidence",
    )
else:
    database_rollback_intent_file = Opened(
        os.path.join(run_root, "database-barrier-rollback-intent.json"),
        "database barrier rollback intent",
        0o400,
    )
    database_rollback_intent = database_rollback_intent_file.json()
    exact(database_rollback_intent, {"schema_version","run_id","state","expected_post_migration_catalog_sha256","database_barrier_baseline_sha256","predecessor_receipt_sha256","input_checkpoint_sha256","intent_journal_entry_hash","required_phase_receipts","required_phase_receipts_sha256"}, "database barrier rollback intent")
    rollback_required = database_rollback_intent["required_phase_receipts"]
    require(isinstance(rollback_required, list), "database barrier rollback required receipts are invalid")
    rollback_required_phases = []
    for receipt in rollback_required:
        exact(receipt, {"phase","receipt_sha256"}, "database barrier rollback required receipt")
        require(receipt["phase"] in ROLLBACK_CONDITIONAL_PHASES and hex64(receipt["receipt_sha256"]), "database barrier rollback required receipt is invalid")
        rollback_required_phases.append(receipt["phase"])
    require(
        database_rollback_intent_file.data == canonical_json(database_rollback_intent, "database barrier rollback intent") + b"\n"
        and database_rollback_intent["schema_version"] == "megacampus.q12.database-barrier-rollback-intent/v1"
        and database_rollback_intent["run_id"] == run_id
        and database_rollback_intent["state"] == "rollback_intent"
        and database_rollback_intent["expected_post_migration_catalog_sha256"] == barrier["expected_catalog_sha256"]
        and database_rollback_intent["database_barrier_baseline_sha256"] == database_baseline_file.digest
        and database_rollback_intent["predecessor_receipt_sha256"] == database_archive_file.digest
        and database_rollback_intent["intent_journal_entry_hash"] == database_proof["intent_journal_entry_hash"]
        and rollback_required_phases == sorted(rollback_required_phases)
        and len(rollback_required_phases) == len(set(rollback_required_phases))
        and database_rollback_intent["required_phase_receipts_sha256"] == sha(canonical_json(rollback_required, "database barrier rollback required receipts"))
        and database_proof["database_barrier_rollback_intent_sha256"] == database_rollback_intent_file.digest
        and database_proof["required_phase_receipts_sha256"] == database_rollback_intent["required_phase_receipts_sha256"],
        "database barrier rollback intent binding is invalid",
    )

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
original_frontends = [
    item for item in original.values()
    if item["class"] in {"production-api", "production-web"}
]
require(
    len(original_frontends) == 2
    and len({item["project"] for item in original_frontends}) == 1,
    "original writer topology has no exact active project color",
)
active_project = original_frontends[0]["project"]
require(
    active_project in {"megacampus-blue", "megacampus-green"},
    "original writer topology has an invalid active project color",
)
expected_original_topology = {
    (active_project, "api", "production-api"),
    (active_project, "web", "production-web"),
    ("megacampus", "worker", "production-worker"),
    ("megacampus", "worker-stage6", "production-worker"),
    ("megacampus", "worker-stage7", "production-worker"),
    ("megacampus", "api-dev", "development-api"),
    ("megacampus", "web-dev", "development-web"),
    ("megacampus", "worker-dev", "development-worker"),
    ("megacampus", "worker-stage6-dev", "development-worker"),
    ("megacampus", "worker-stage7-dev", "development-worker"),
}
require(
    {(item["project"], item["service"], item["class"]) for item in original.values()}
    == expected_original_topology,
    "original writer topology is not the exact ten-service projection",
)

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
target_project = "megacampus-green" if active_project == "megacampus-blue" else "megacampus-blue"
expected_target_topology = [
    (target_project, "api", "production-api"),
    (target_project, "web", "production-web"),
    ("megacampus", "worker", "production-worker"),
    ("megacampus", "worker-stage6", "production-worker"),
    ("megacampus", "worker-stage7", "production-worker"),
]
target_topology = [
    (item["project"], item["service"], item["class"])
    for item in target
]
if mode == "forward":
    require(
        target_topology == expected_target_topology,
        "forward target topology or project color is invalid",
    )
else:
    require(
        target_topology == expected_target_topology[:len(target_topology)],
        "rollback target creation prefix or project color is invalid",
    )
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
    require(
        set(phases).issubset(set(ROLLBACK_CONDITIONAL_PHASES)),
        "rollback conditional phase receipt is unknown",
    )
    require(
        canonical_json(required, "writer rollback required phase receipts")
        == canonical_json(
            database_rollback_intent["required_phase_receipts"],
            "database rollback intent required phase receipts",
        )
        and rollback["required_phase_receipts_sha256"]
        == database_rollback_intent["required_phase_receipts_sha256"],
        "writer rollback required phase receipts differ from database rollback intent",
    )

authority_file = Opened(paths["authority"], "writer resume authority", 0o400)
authority = authority_file.json()
exact(authority, {"schema_version","run_id","state","mode","release_sha","expected_catalog_sha256","writer_quiesce_manifest_sha256","final_writer_manifest_sha256","database_barrier_receipt_sha256","recovery_state_sha256","handoff_state_sha256","rollback_state_sha256","authority_intent_journal_entry_hash","input_checkpoint_sha256","lease_epoch"}, "writer resume authority")
require(authority["schema_version"] == "megacampus.q12.writer-resume-authority/v1" and authority["run_id"] == run_id and authority["mode"] == mode and authority["release_sha"] == final_manifest["release_sha"] and authority["expected_catalog_sha256"] == barrier["expected_catalog_sha256"] and authority["writer_quiesce_manifest_sha256"] == quiesce_file.digest and authority["final_writer_manifest_sha256"] == final_file.digest and authority["database_barrier_receipt_sha256"] == barrier_file.digest and hex64(authority["authority_intent_journal_entry_hash"]) and hex64(authority["input_checkpoint_sha256"]) and RESUME_LEASE.fullmatch(authority["lease_epoch"]), "writer resume authority binding is invalid")
require(authority["lease_epoch"] == final_manifest["lease_epoch"] == "cutover", "writer resume authority/final lease transition is invalid")
if mode == "forward":
    require(authority["state"] == "handoff_ready_writers_quiesced" and authority["recovery_state_sha256"] == recovery_file.digest and authority["handoff_state_sha256"] == handoff_file.digest and authority["rollback_state_sha256"] is None, "forward resume authority is invalid")
else:
    require(authority["state"] == "rollback_ready_writers_quiesced" and authority["recovery_state_sha256"] is None and authority["handoff_state_sha256"] is None and authority["rollback_state_sha256"] == rollback_file.digest, "rollback resume authority is invalid")

journal_file = Opened(paths["journal"], "cutover journal", 0o600)
checkpoint_file = Opened(paths["checkpoint"], "cutover checkpoint", 0o600)
checkpoint = checkpoint_file.json()
exact(checkpoint, CHECKPOINT_KEYS, "cutover checkpoint")
require(checkpoint["schema_version"] == "megacampus.q12.cutover-checkpoint/v1" and checkpoint["run_id"] == run_id and isinstance(checkpoint["seq"], int) and checkpoint["seq"] > 1 and checkpoint["phase"] == f"resume_committing_{mode}" and hex64(checkpoint["journal_entry_hash"]) and hex64(checkpoint["previous_journal_entry_hash"]) and checkpoint["accepted_object_kind"] == "none" and checkpoint["accepted_object_sha256"] is None and checkpoint["resume_authority_sha256"] == authority_file.digest and RESUME_LEASE.fullmatch(checkpoint["lease_epoch"]), "resume checkpoint projection is invalid")
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
        entry = strict_json_loads(encoded_entry.decode("utf-8"), "cutover journal entry")
    except ResumeError:
        raise
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

def checkpoint_matches_entry(value, entry, label):
    exact(value, CHECKPOINT_KEYS, label)
    require(
        value["schema_version"] == "megacampus.q12.cutover-checkpoint/v1"
        and value["run_id"] == run_id
        and value["seq"] == entry["seq"]
        and value["phase"] == entry["phase"]
        and value["journal_entry_hash"] == entry["entry_hash"]
        and value["previous_journal_entry_hash"] == entry["previous_hash"]
        and value["journal_device"] == str(journal_file.identity[0])
        and value["journal_inode"] == str(journal_file.identity[1])
        and value["accepted_object_kind"] == entry["accepted_object_kind"]
        and value["accepted_object_sha256"] == entry["accepted_object_sha256"]
        and value["resume_authority_sha256"] == authority_file.digest
        and value["lease_epoch"] == entry["lease_epoch"],
        f"{label} does not copy the exact journal checkpoint",
    )

exact_directory(paths["capabilities"], "host capability root")
capability_directories = {
    name: os.path.join(paths["capabilities"], name)
    for name in ("issued", "claimed", "completed", "superseded")
}
for name, directory in capability_directories.items():
    exact_directory(directory, f"host capability {name} directory")

database_lifecycle_entries = [
    entry for entry in journal_lines
    if entry["phase"] == "guard_cleanup_complete"
    and entry["command_id"] == f"barrier.{database_operation}"
]
require(database_lifecycle_entries, "accepted database barrier lifecycle is missing")
database_lifecycle_indexes = [journal_lines.index(entry) for entry in database_lifecycle_entries]
require(
    database_lifecycle_indexes
    == list(range(database_lifecycle_indexes[0], database_lifecycle_indexes[-1] + 1)),
    "database barrier lifecycle is interleaved",
)
database_outcomes = [entry["outcome"] for entry in database_lifecycle_entries]
database_epoch_groups = []
for entry in database_lifecycle_entries:
    if not database_epoch_groups or database_epoch_groups[-1][0] != entry["lease_epoch"]:
        database_epoch_groups.append((entry["lease_epoch"], []))
    database_epoch_groups[-1][1].append(entry)
database_epochs = [epoch for epoch, _ in database_epoch_groups]
require(
    database_epochs
    == ["cutover"] + [
        f"cutover-recovery-{ordinal}"
        for ordinal in range(1, len(database_epochs))
    ],
    "database barrier recovery epochs are not consecutive",
)
if len(database_epoch_groups) == 1:
    require(
        database_outcomes == [
            "intent", "capability_issued", "capability_claimed",
            "capability_completed", "accepted",
        ],
        "database barrier accepted lifecycle graph is invalid",
    )
else:
    initial_outcomes = [entry["outcome"] for entry in database_epoch_groups[0][1]]
    require(
        initial_outcomes in [
            ["intent"],
            ["intent", "capability_issued"],
            ["intent", "capability_issued", "capability_claimed"],
        ],
        "database barrier initial recovery prefix is invalid",
    )
    for _, entries in database_epoch_groups[1:-1]:
        require(
            [entry["outcome"] for entry in entries]
            in [["recovery_reacquired"], ["recovery_reacquired", "capability_claimed"]],
            "database barrier intermediate recovery prefix is invalid",
        )
    database_terminal_outcomes = [
        entry["outcome"] for entry in database_epoch_groups[-1][1]
    ]
    database_existing_proof_completion = (
        database_terminal_outcomes == ["capability_completed", "accepted"]
    )
    require(
        database_terminal_outcomes
        == ["recovery_reacquired", "capability_claimed", "capability_completed", "accepted"]
        or (
            database_existing_proof_completion
            and database_epoch_groups[-2][1][-1]["outcome"] == "capability_claimed"
        ),
        "database barrier terminal recovery lifecycle is invalid",
    )
if len(database_epoch_groups) == 1:
    database_existing_proof_completion = False
database_intent_entry = database_epoch_groups[0][1][0]
database_terminal_entries = database_epoch_groups[-1][1]
database_execution_entries = (
    database_epoch_groups[-2][1]
    if database_existing_proof_completion
    else database_terminal_entries
)
database_claimed_entry = next(
    entry for entry in database_execution_entries
    if entry["outcome"] == "capability_claimed"
)
database_completed_entry = database_terminal_entries[-2]
database_accepted_entry = database_terminal_entries[-1]
database_group_capability_hashes = []
for _, entries in database_epoch_groups:
    hashes = {
        entry["capability_manifest_sha256"]
        for entry in entries
        if entry["outcome"] != "intent"
    }
    require(
        len(hashes) <= 1 and all(hex64(value) for value in hashes),
        "database barrier epoch capability binding is invalid",
    )
    database_group_capability_hashes.append(next(iter(hashes)) if hashes else None)
require(
    database_intent_entry["entry_hash"] == database_proof["intent_journal_entry_hash"]
    and database_intent_entry["capability_manifest_sha256"] == "0" * 64
    and database_claimed_entry["lease_epoch"] == database_execution_entries[0]["lease_epoch"]
    and database_completed_entry["lease_epoch"] == database_terminal_entries[0]["lease_epoch"]
    and database_accepted_entry["lease_epoch"] == database_terminal_entries[0]["lease_epoch"]
    and database_completed_entry["capability_manifest_sha256"]
    == database_claimed_entry["capability_manifest_sha256"]
    and database_accepted_entry["capability_manifest_sha256"]
    == database_claimed_entry["capability_manifest_sha256"]
    and database_accepted_entry["accepted_object_kind"] == "database_barrier_receipt"
    and database_accepted_entry["accepted_object_sha256"] == barrier_file.digest
    and all(
        entry["accepted_object_kind"] == "none"
        and entry["accepted_object_sha256"] is None
        for entry in database_lifecycle_entries[:-1]
    )
    and database_group_capability_hashes[-1] is not None,
    "database barrier lifecycle binding is invalid",
)
database_execution_epoch = database_claimed_entry["lease_epoch"]
database_completion_epoch = database_completed_entry["lease_epoch"]
require(
    database_execution_epoch == database_completion_epoch
    or (
        database_existing_proof_completion
        and database_epochs.index(database_completion_epoch)
        == database_epochs.index(database_execution_epoch) + 1
    ),
    "database barrier execution/completion epoch transition is invalid",
)
database_input_checkpoint_file = Opened(
    os.path.join(
        run_root,
        f"database-barrier-input-checkpoint-{database_operation}-{database_execution_epoch}.json",
    ),
    "database barrier input checkpoint",
    0o600,
)
database_input_checkpoint = database_input_checkpoint_file.json()
exact(database_input_checkpoint, CHECKPOINT_KEYS, "database barrier input checkpoint")
require(
    database_input_checkpoint_file.digest == database_proof["input_checkpoint_sha256"]
    and database_input_checkpoint["schema_version"] == "megacampus.q12.cutover-checkpoint/v1"
    and database_input_checkpoint["run_id"] == run_id
    and database_input_checkpoint["seq"] == database_claimed_entry["seq"]
    and database_input_checkpoint["phase"] == "guard_cleanup_complete"
    and database_input_checkpoint["journal_entry_hash"] == database_claimed_entry["entry_hash"]
    and database_input_checkpoint["previous_journal_entry_hash"] == database_claimed_entry["previous_hash"]
    and database_input_checkpoint["journal_device"] == str(journal_file.identity[0])
    and database_input_checkpoint["journal_inode"] == str(journal_file.identity[1])
    and database_input_checkpoint["accepted_object_kind"] == "none"
    and database_input_checkpoint["accepted_object_sha256"] is None
    and database_input_checkpoint["resume_authority_sha256"] is None
    and database_input_checkpoint["lease_epoch"] == database_execution_epoch,
    "database barrier input checkpoint binding is invalid",
)

barrier_command_ids = {
    "barrier.install",
    "barrier.activate",
    "barrier.verify-after-base",
    "barrier.verify-after-observability",
    "barrier.prepare-recovery",
    "barrier.cleanup",
    "barrier.rollback",
}
barrier_terminal_command_ids = {"barrier.cleanup", "barrier.rollback"}
historical_barrier_contexts = {
    "barrier.install": ("maintenance_guarded", "0" * 64),
    "barrier.verify-after-base": ("base_migration_guarded", quiesce_file.digest),
    "barrier.verify-after-observability": ("observability_migration_guarded", quiesce_file.digest),
    "barrier.prepare-recovery": ("recovery_ready_guarded", quiesce_file.digest),
    "barrier.activate": ("activated", quiesce_file.digest),
}
barrier_command_pattern = "|".join(
    re.escape(command_id) for command_id in sorted(barrier_command_ids)
)
database_capability_records = []
historical_barrier_capability_records = []
for location, directory in capability_directories.items():
    for directory_entry in os.scandir(directory):
        if not directory_entry.name.startswith("barrier."):
            continue
        match = re.fullmatch(
            rf"({barrier_command_pattern})"
            r"--((?:cutover|cutover-recovery-[1-9][0-9]*))\.json",
            directory_entry.name,
        )
        require(match is not None, "barrier capability command or basename is invalid")
        barrier_command_id = match.group(1)
        barrier_lease_epoch = match.group(2)
        if barrier_command_id in barrier_terminal_command_ids:
            require(
                barrier_command_id == f"barrier.{database_operation}",
                "conflicting database barrier terminal capability exists",
            )
        opened = Opened(
            directory_entry.path,
            f"{location} barrier host capability",
            0o400,
        )
        value = opened.json()
        exact(value, CAPABILITY_KEYS, "barrier host capability")
        require(
            opened.data == canonical_json(value, "barrier host capability") + b"\n"
            and value["schema_version"] == "megacampus.q12.host-command-capability/v1"
            and value["run_id"] == run_id
            and value["command_id"] == barrier_command_id
            and hex64(value["command_sha256"])
            and isinstance(value["release_sha"], str)
            and re.fullmatch(r"[a-f0-9]{40}", value["release_sha"])
            and hex64(value["operator_digest"])
            and hex64(value["resource_manifest_sha256"])
            and hex64(value["quiesce_manifest_sha256"])
            and value["resume_authority_sha256"] is None
            and hex64(value["capability_input_checkpoint_sha256"])
            and value["lease_epoch"] == barrier_lease_epoch
            and (
                value["supersedes_capability_sha256"] is None
                or hex64(value["supersedes_capability_sha256"])
            ),
            "barrier host capability binding is invalid",
        )
        if barrier_command_id not in barrier_terminal_command_ids:
            historical_barrier_capability_records.append({
                "location": location,
                "file": opened,
                "value": value,
            })
            continue
        require(
            value["command_sha256"] == database_claimed_entry["command_sha256"]
            and value["release_sha"] == database_claimed_entry["release_sha"]
            and value["operator_digest"] == database_claimed_entry["operator_digest"]
            and value["resource_manifest_sha256"] == database_claimed_entry["resource_manifest_sha256"]
            and value["quiesce_manifest_sha256"] == quiesce_file.digest,
            "database barrier host capability binding is invalid",
        )
        database_capability_records.append({
            "location": location,
            "file": opened,
            "value": value,
        })

historical_barrier_capabilities_by_command = {}
for record in historical_barrier_capability_records:
    historical_barrier_capabilities_by_command.setdefault(
        record["value"]["command_id"], []
    ).append(record)
for historical_command_id, historical_records in historical_barrier_capabilities_by_command.items():
    historical_operation = historical_command_id.removeprefix("barrier.")
    for historical_record in historical_records:
        historical_value = historical_record["value"]
        historical_copy_path = os.path.join(
            run_root,
            "retained-barrier-capability-checkpoint-"
            f"{historical_operation}-{historical_value['lease_epoch']}.json",
        )
        require(
            os.path.lexists(historical_copy_path),
            "retained barrier checkpoint provenance is invalid",
        )
        historical_copy_file = Opened(
            historical_copy_path,
            f"retained barrier checkpoint {historical_command_id} "
            f"{historical_value['lease_epoch']}",
            0o600,
        )
        historical_copy = historical_copy_file.json()
        exact(
            historical_copy,
            CHECKPOINT_KEYS,
            f"retained barrier checkpoint {historical_command_id}",
        )
        historical_copy_entries = [
            entry
            for entry in journal_lines
            if entry["entry_hash"] == historical_copy["journal_entry_hash"]
        ]
        require(
            historical_copy_file.identity[6] == 1
            and historical_copy_file.digest
            == historical_value["capability_input_checkpoint_sha256"]
            and historical_copy_file.identity[:2] != checkpoint_file.identity[:2]
            and historical_copy["schema_version"]
            == "megacampus.q12.cutover-checkpoint/v1"
            and historical_copy["run_id"] == run_id
            and historical_copy["journal_device"] == str(journal_file.identity[0])
            and historical_copy["journal_inode"] == str(journal_file.identity[1])
            and historical_copy["resume_authority_sha256"] is None
            and len(historical_copy_entries) == 1,
            "retained barrier checkpoint provenance is invalid",
        )
        historical_copy_entry = historical_copy_entries[0]
        require(
            historical_copy["seq"] == historical_copy_entry["seq"]
            and historical_copy["phase"] == historical_copy_entry["phase"]
            and historical_copy["previous_journal_entry_hash"]
            == historical_copy_entry["previous_hash"]
            and historical_copy["accepted_object_kind"]
            == historical_copy_entry["accepted_object_kind"]
            and historical_copy["accepted_object_sha256"]
            == historical_copy_entry["accepted_object_sha256"]
            and historical_copy["lease_epoch"]
            == historical_copy_entry["lease_epoch"],
            "retained barrier checkpoint journal projection is invalid",
        )
        historical_record["checkpoint_file"] = historical_copy_file
    historical_completed_records = [
        record for record in historical_records
        if record["location"] == "completed"
    ]
    require(
        len(historical_completed_records) == 1,
        "historical barrier completed authority is ambiguous",
    )
    historical_records_by_digest = {
        record["file"].digest: record for record in historical_records
    }
    require(
        len(historical_records_by_digest) == len(historical_records),
        "historical barrier capability digest is duplicated",
    )
    historical_chain = []
    historical_chain_digests = set()
    historical_cursor = historical_completed_records[0]
    while historical_cursor is not None:
        historical_cursor_digest = historical_cursor["file"].digest
        require(
            historical_cursor_digest not in historical_chain_digests,
            "historical barrier capability supersession cycle exists",
        )
        historical_chain.append(historical_cursor)
        historical_chain_digests.add(historical_cursor_digest)
        historical_predecessor_digest = historical_cursor["value"]["supersedes_capability_sha256"]
        if historical_predecessor_digest is None:
            historical_cursor = None
        else:
            require(
                historical_predecessor_digest in historical_records_by_digest,
                "historical barrier capability supersession link is missing",
            )
            historical_cursor = historical_records_by_digest[historical_predecessor_digest]
    historical_chain.reverse()
    require(
        len(historical_chain) == len(historical_records),
        "historical barrier capability fork or orphan exists",
    )
    historical_epochs = [
        record["value"]["lease_epoch"] for record in historical_chain
    ]
    require(
        historical_epochs
        == ["cutover"] + [
            f"cutover-recovery-{ordinal}"
            for ordinal in range(1, len(historical_epochs))
        ],
        "historical barrier capability lifecycle is unsupported or ambiguous",
    )
    for historical_index, historical_record in enumerate(historical_chain):
        historical_predecessor = historical_chain[historical_index - 1] if historical_index else None
        require(
            historical_record["location"]
            == ("completed" if historical_index == len(historical_chain) - 1 else "superseded")
            and historical_record["value"]["supersedes_capability_sha256"]
            == (historical_predecessor["file"].digest if historical_predecessor else None),
            "historical barrier capability location or supersession is invalid",
        )
    historical_tip = historical_chain[-1]
    historical_value = historical_tip["value"]
    expected_historical_phase, expected_historical_quiesce = historical_barrier_contexts[
        historical_command_id
    ]
    historical_contract = historical_chain[0]["value"]
    require(
        all(
            record["value"]["command_id"] == historical_command_id
            and record["value"]["run_id"] == historical_contract["run_id"]
            and record["value"]["release_sha"] == historical_contract["release_sha"]
            and record["value"]["operator_digest"] == historical_contract["operator_digest"]
            and record["value"]["resource_manifest_sha256"]
            == historical_contract["resource_manifest_sha256"]
            and record["value"]["command_sha256"]
            == historical_contract["command_sha256"]
            for record in historical_chain
        ),
        "historical barrier command contract chain is invalid",
    )
    require(
        all(
            record["value"]["quiesce_manifest_sha256"] == expected_historical_quiesce
            for record in historical_chain
        ),
        "historical barrier command phase or context chain is invalid",
    )
    historical_journal_entries = [
        entry for entry in journal_lines
        if entry["phase"] == expected_historical_phase
        and entry["outcome"] == "completed"
        and entry["command_id"] == historical_command_id
        and entry["command_sha256"] == historical_value["command_sha256"]
        and entry["capability_manifest_sha256"] == historical_tip["file"].digest
        and entry["release_sha"] == historical_value["release_sha"]
        and entry["operator_digest"] == historical_value["operator_digest"]
        and entry["resource_manifest_sha256"] == historical_value["resource_manifest_sha256"]
        and entry["quiesce_manifest_sha256"] == historical_value["quiesce_manifest_sha256"]
        and entry["accepted_object_kind"] == "none"
        and entry["accepted_object_sha256"] is None
    ]
    require(
        len(historical_journal_entries) == 1,
        "historical barrier command phase or context binding is invalid",
    )
    historical_completion_epoch = historical_journal_entries[0]["lease_epoch"]
    historical_execution_epoch = historical_value["lease_epoch"]
    require(
        historical_completion_epoch == historical_execution_epoch
        or (
            len(historical_chain) == 1
            and historical_execution_epoch == "cutover"
            and historical_completion_epoch == "cutover-recovery-1"
        ),
        "historical barrier execution/completion epoch transition is invalid",
    )

database_capability_by_digest = {
    record["file"].digest: record for record in database_capability_records
}
require(
    len(database_capability_by_digest) == len(database_capability_records),
    "duplicate database barrier host capability exists",
)
database_referenced_capabilities = []
for epoch, group_hash in zip(database_epochs, database_group_capability_hashes):
    if group_hash is None:
        continue
    if not database_referenced_capabilities or database_referenced_capabilities[-1][0] != group_hash:
        database_referenced_capabilities.append((group_hash, epoch))
database_completed_capabilities = [
    record for record in database_capability_records
    if record["location"] == "completed"
]
require(
    len(database_completed_capabilities) == 1,
    "database barrier completed execution capability is ambiguous",
)
database_capability_chain = []
database_capability_chain_digests = set()
database_capability_cursor = database_completed_capabilities[0]
while database_capability_cursor is not None:
    cursor_digest = database_capability_cursor["file"].digest
    require(
        cursor_digest not in database_capability_chain_digests,
        "database barrier host capability supersession cycle exists",
    )
    database_capability_chain.append(database_capability_cursor)
    database_capability_chain_digests.add(cursor_digest)
    predecessor_digest = database_capability_cursor["value"]["supersedes_capability_sha256"]
    if predecessor_digest is None:
        database_capability_cursor = None
    else:
        require(
            predecessor_digest in database_capability_by_digest,
            "database barrier host capability supersession link is missing",
        )
        database_capability_cursor = database_capability_by_digest[predecessor_digest]
database_capability_chain.reverse()
require(
    len(database_capability_chain) == len(database_capability_records),
    "orphan, forked, or unreferenced database barrier host capability exists",
)
for index, record in enumerate(database_capability_chain):
    require(
        record["value"]["supersedes_capability_sha256"]
        == (database_capability_chain[index - 1]["file"].digest if index else None)
        and record["location"]
        == ("completed" if index == len(database_capability_chain) - 1 else "superseded"),
        "database barrier host capability lifecycle location or supersession is invalid",
    )

database_referenced_capability_epochs = dict(database_referenced_capabilities)
database_journal_capability_chain = [
    (record["file"].digest, record["value"]["lease_epoch"])
    for record in database_capability_chain
    if record["file"].digest in database_referenced_capability_epochs
]
require(
    database_journal_capability_chain == database_referenced_capabilities,
    "database barrier journal capability chain is invalid",
)
database_journalless_capabilities = [
    record for record in database_capability_chain
    if record["file"].digest not in database_referenced_capability_epochs
]
database_preissuance_orphan = None
if database_journalless_capabilities:
    database_preissuance_orphan = database_journalless_capabilities[0]
    require(
        len(database_journalless_capabilities) == 1
        and database_preissuance_orphan is database_capability_chain[0]
        and len(database_capability_chain) > 1
        and database_preissuance_orphan["location"] == "superseded"
        and database_preissuance_orphan["value"]["lease_epoch"] == "cutover"
        and [entry["outcome"] for entry in database_epoch_groups[0][1]] == ["intent"]
        and database_capability_chain[1]["value"]["lease_epoch"] == "cutover-recovery-1"
        and database_capability_chain[1]["file"].digest
        in database_referenced_capability_epochs,
        "database barrier pre-issuance orphan is invalid",
    )
database_capability_file = database_capability_chain[-1]["file"]
database_capability = database_capability_chain[-1]["value"]
require(
    database_capability_file.digest == database_claimed_entry["capability_manifest_sha256"]
    and database_capability["lease_epoch"] == database_execution_epoch,
    "completed database barrier host capability is not the execution capability",
)

database_capability_checkpoint_files = {}
for record in database_capability_chain:
    capability_epoch = record["value"]["lease_epoch"]
    capability_journal_entries = [
        entry for entry in database_lifecycle_entries
        if entry["capability_manifest_sha256"] == record["file"].digest
        and entry["outcome"] in {"capability_issued", "recovery_reacquired"}
    ]
    require(
        len(capability_journal_entries) <= 1,
        "database barrier capability issuance journal binding is ambiguous",
    )
    if not capability_journal_entries:
        require(
            record is database_preissuance_orphan,
            "unlisted database barrier host capability exists",
        )
        database_capability_anchor_entry = database_intent_entry
    elif capability_epoch == "cutover":
        database_capability_anchor_entry = database_intent_entry
    else:
        capability_journal_entry = capability_journal_entries[0]
        capability_journal_index = journal_lines.index(capability_journal_entry)
        database_accepted_predecessors = [
            entry for entry in journal_lines[:capability_journal_index]
            if entry["outcome"] == "accepted"
        ]
        require(
            database_accepted_predecessors,
            "database barrier recovery accepted predecessor is missing",
        )
        database_capability_anchor_entry = database_accepted_predecessors[-1]
    capability_checkpoint_file = Opened(
        os.path.join(
            run_root,
            f"database-barrier-capability-checkpoint-{database_operation}-{capability_epoch}.json",
        ),
        f"database barrier capability checkpoint {capability_epoch}",
        0o600,
    )
    capability_checkpoint = capability_checkpoint_file.json()
    exact(
        capability_checkpoint,
        CHECKPOINT_KEYS,
        f"database barrier capability checkpoint {capability_epoch}",
    )
    require(
        capability_checkpoint_file.digest
        == record["value"]["capability_input_checkpoint_sha256"]
        and capability_checkpoint["schema_version"] == "megacampus.q12.cutover-checkpoint/v1"
        and capability_checkpoint["run_id"] == run_id
        and capability_checkpoint["journal_entry_hash"] == database_capability_anchor_entry["entry_hash"]
        and capability_checkpoint["previous_journal_entry_hash"] == database_capability_anchor_entry["previous_hash"]
        and capability_checkpoint["seq"] == database_capability_anchor_entry["seq"]
        and capability_checkpoint["phase"] == database_capability_anchor_entry["phase"]
        and capability_checkpoint["journal_device"] == str(journal_file.identity[0])
        and capability_checkpoint["journal_inode"] == str(journal_file.identity[1])
        and capability_checkpoint["accepted_object_kind"] == database_capability_anchor_entry["accepted_object_kind"]
        and capability_checkpoint["accepted_object_sha256"] == database_capability_anchor_entry["accepted_object_sha256"]
        and capability_checkpoint["resume_authority_sha256"] is None
        and capability_checkpoint["lease_epoch"] == database_capability_anchor_entry["lease_epoch"],
        "database barrier capability checkpoint binding is invalid",
    )
    database_capability_checkpoint_files[record["file"].digest] = capability_checkpoint_file
database_capability_checkpoint_file = database_capability_checkpoint_files[
    database_capability_file.digest
]
if mode == "rollback":
    require(
        database_rollback_intent["input_checkpoint_sha256"]
        == database_capability_checkpoint_file.digest,
        "database barrier rollback intent capability checkpoint is invalid",
    )

command_id = f"writers.resume.{mode}"

capability_records = []
for location, directory in capability_directories.items():
    for directory_entry in os.scandir(directory):
        if not directory_entry.name.startswith("writers.resume."):
            continue
        require(
            directory_entry.name.startswith(f"{command_id}--"),
            "cross-mode writer resume capability exists",
        )
        match = re.fullmatch(
            re.escape(command_id) + r"--((?:cutover|cutover-recovery-[1-9][0-9]*))\.json",
            directory_entry.name,
        )
        require(match is not None, "writer resume capability basename is invalid")
        opened = Opened(directory_entry.path, f"{location} writer resume capability", 0o400)
        value = opened.json()
        exact(value, CAPABILITY_KEYS, "writer resume capability")
        require(
            opened.data == canonical_json(value, "writer resume capability") + b"\n",
            "writer resume capability bytes are not canonical",
        )
        require(
            value["schema_version"] == "megacampus.q12.host-command-capability/v1"
            and value["run_id"] == run_id
            and value["command_id"] == command_id
            and value["command_sha256"] == head["command_sha256"]
            and value["release_sha"] == final_manifest["release_sha"]
            and value["operator_digest"] == head["operator_digest"]
            and value["resource_manifest_sha256"] == head["resource_manifest_sha256"]
            and value["quiesce_manifest_sha256"] == quiesce_file.digest
            and value["resume_authority_sha256"] == authority_file.digest
            and hex64(value["capability_input_checkpoint_sha256"])
            and value["lease_epoch"] == match.group(1)
            and (
                value["supersedes_capability_sha256"] is None
                or hex64(value["supersedes_capability_sha256"])
            ),
            "writer resume capability binding is invalid",
        )
        capability_records.append({
            "location": location,
            "file": opened,
            "value": value,
        })

claimed_records = [record for record in capability_records if record["location"] == "claimed"]
require(
    len(claimed_records) == 1
    and not any(record["location"] in {"issued", "completed"} for record in capability_records),
    "writer resume capability lifecycle is ambiguous",
)
current_capability = claimed_records[0]
require(
    current_capability["value"]["lease_epoch"] == checkpoint["lease_epoch"],
    "claimed writer resume capability epoch does not match the current checkpoint",
)
by_digest = {record["file"].digest: record for record in capability_records}
require(len(by_digest) == len(capability_records), "duplicate writer resume capability exists")
capability_chain = []
cursor = current_capability
while cursor is not None:
    require(cursor not in capability_chain, "writer resume capability supersession cycle exists")
    capability_chain.append(cursor)
    predecessor_sha256 = cursor["value"]["supersedes_capability_sha256"]
    if predecessor_sha256 is None:
        cursor = None
    else:
        require(predecessor_sha256 in by_digest, "writer resume capability supersession link is missing")
        cursor = by_digest[predecessor_sha256]
capability_chain.reverse()
require(
    len(capability_chain) == len(capability_records)
    and capability_chain[0]["value"]["lease_epoch"] == "cutover"
    and capability_chain[0]["location"] in {"claimed", "superseded"}
    and all(record["location"] == "superseded" for record in capability_chain[:-1]),
    "orphan or misplaced writer resume capability exists",
)
for ordinal, record in enumerate(capability_chain[1:], start=1):
    require(
        record["value"]["lease_epoch"] == f"cutover-recovery-{ordinal}",
        "writer resume capability recovery epochs are not consecutive",
    )

authority_intent_index = next(
    index for index, entry in enumerate(journal_lines)
    if entry["entry_hash"] == authority["authority_intent_journal_entry_hash"]
)
authority_accepted_index = authority_intent_index + 1
authority_accepted_entry = journal_lines[authority_accepted_index]
lifecycle_entries = journal_lines[authority_accepted_index + 1:]
require(
    lifecycle_entries
    and all(
        entry["phase"] == f"resume_committing_{mode}"
        and entry["command_id"] == command_id
        and entry["accepted_object_kind"] == "none"
        and entry["accepted_object_sha256"] is None
        for entry in lifecycle_entries
    ),
    f"{mode} capability journal/checkpoint binding graph is invalid",
)
resume_rows_by_epoch = {}
for entry in lifecycle_entries:
    resume_rows_by_epoch.setdefault(entry["lease_epoch"], []).append(entry)
require(
    list(resume_rows_by_epoch) == [record["value"]["lease_epoch"] for record in capability_chain],
    f"{mode} capability recovery epochs are missing or interleaved",
)
for index, record in enumerate(capability_chain):
    lease_epoch = record["value"]["lease_epoch"]
    epoch_rows = resume_rows_by_epoch[lease_epoch]
    observed_outcomes = [entry["outcome"] for entry in epoch_rows]
    allowed_outcomes = (
        [["intent", "capability_issued", "capability_claimed"]]
        if index == 0 and len(capability_chain) == 1
        else (
            [
                ["intent"],
                ["intent", "capability_issued"],
                ["intent", "capability_issued", "capability_claimed"],
            ]
            if index == 0
            else (
                [["recovery_reacquired"], ["recovery_reacquired", "capability_claimed"]]
                if index < len(capability_chain) - 1
                else [["recovery_reacquired", "capability_claimed"]]
            )
        )
    )
    require(
        observed_outcomes in allowed_outcomes
        and all(
            entry["capability_manifest_sha256"]
            == ("0" * 64 if entry["outcome"] == "intent" else record["file"].digest)
            for entry in epoch_rows
        ),
        f"{mode} capability journal/checkpoint binding graph is invalid",
    )
resume_intent_entry = resume_rows_by_epoch["cutover"][0]
opened_capability_checkpoints = []
opened_input_checkpoints = []
for index, record in enumerate(capability_chain):
    lease_epoch = record["value"]["lease_epoch"]
    capability_checkpoint_file = Opened(
        os.path.join(run_root, f"writer-resume-capability-checkpoint-{mode}-{lease_epoch}.json"),
        f"writer resume capability checkpoint {lease_epoch}",
        0o600,
    )
    capability_checkpoint = capability_checkpoint_file.json()
    expected_capability_entry = resume_intent_entry if index == 0 else authority_accepted_entry
    checkpoint_matches_entry(
        capability_checkpoint,
        expected_capability_entry,
        f"writer resume capability checkpoint {lease_epoch}",
    )
    require(
        capability_checkpoint_file.digest
        == record["value"]["capability_input_checkpoint_sha256"],
        "writer resume capability checkpoint hash mismatch",
    )
    opened_capability_checkpoints.append(capability_checkpoint_file)
    claimed_entries = [
        entry for entry in resume_rows_by_epoch[lease_epoch]
        if entry["outcome"] == "capability_claimed"
    ]
    input_checkpoint_path = os.path.join(
        run_root, f"writer-resume-input-checkpoint-{mode}-{lease_epoch}.json",
    )
    if claimed_entries:
        input_checkpoint_file = Opened(
            input_checkpoint_path,
            f"writer resume input checkpoint {lease_epoch}",
            0o600,
        )
        checkpoint_matches_entry(
            input_checkpoint_file.json(),
            claimed_entries[0],
            f"writer resume input checkpoint {lease_epoch}",
        )
        opened_input_checkpoints.append(input_checkpoint_file)
    else:
        require(
            not os.path.lexists(input_checkpoint_path),
            f"unclaimed writer resume input checkpoint exists for {lease_epoch}",
        )
require(
    checkpoint_file.data == opened_input_checkpoints[-1].data,
    "current fixed checkpoint does not equal the child-input checkpoint",
)

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

# Amendment sections 4-6 (D5J command-binding-and-FWM amendment,
# SHA-256 e952f72410c9d49555cd780108e2b94c47284872da69e506b6c2e9ab86fcd4b1):
# the closed ordinary-row grammar for the real Root joined prefix. Transcribed
# from the frozen tables; the deployed core q12-lifecycle-core.py validates the
# same literals in validate_journal_entry_grammar / validate_stable_binding_walk.
# This is the SOLE acceptance path: it is selected only for a genuine Root
# prefix (genesis operator.self-check row). The former fabricated common_phase_graph
# path has been removed — a non-genesis prefix is rejected outright at the genesis
# gate below.
JOINED_ORDINARY_GRAMMAR = {
    "operator.self-check": ("preflight", "preflight"),
    "pg.backup": ("snapshot_exported", "backup_committed"),
    "pg.restore": ("restore_verified", "restore_verified"),
    "migration.base.apply": ("restore_verified", "restore_verified"),
    "migration.observability.apply": ("base_migration_guarded", "base_migration_guarded"),
    "source.forward": ("source_recovered", "source_recovered"),
    "reindex.plan": ("reindex_started", "reindex_started"),
    "reindex.worker.create": ("reindex_started", "reindex_started"),
    "reindex.execute": ("reindex_started", "reindex_started"),
    "reindex.verify": ("qdrant_verified", "qdrant_verified"),
    "deploy.prepare": ("qdrant_verified", "qdrant_verified"),
    "deploy.commit": ("activation_ready", "activation_ready"),
}
JOINED_MILESTONE_WITNESSES = {"migrations_applied": "migration.observability.apply"}
JOINED_FWM_ROW_PHASES = {
    "writers.resume.forward": "prepared_quiesced",
    "writers.resume.rollback": "rollback_preparing",
}
JOINED_BARRIER_TARGET_PHASES = {
    "barrier.install": "maintenance_guarded",
    "barrier.verify-after-base": "base_migration_guarded",
    "barrier.verify-after-observability": "observability_migration_guarded",
    "barrier.prepare-recovery": "recovery_ready_guarded",
    "barrier.activate": "activated",
}
JOINED_BARRIER_SELECTOR_PHASES = {
    **JOINED_BARRIER_TARGET_PHASES,
    "barrier.activate": "activation_committing",
}

def validate_joined_prefix(prefix, quiesce_digest):
    require(prefix, "joined prefix is empty")
    genesis = prefix[0]
    require(
        genesis["command_id"] == "operator.self-check"
        and genesis["phase"] == "preflight"
        and genesis["outcome"] == "intent"
        and genesis["seq"] == 1,
        "joined prefix genesis row is invalid",
    )
    switched = False
    previous_resource = None
    final_manifest_acceptances = 0
    for entry in prefix:
        command_id = entry["command_id"]
        outcome = entry["outcome"]
        phase = entry["phase"]
        accepted_kind = entry["accepted_object_kind"]
        command_sha256 = entry["command_sha256"]
        require(command_id != "root.advance", "joined prefix rejects root.advance")
        # Amendment section 8: no zero or 9*64 sentinel command hash in a joined positive.
        require(
            command_sha256 not in ("0" * 64, "9" * 64),
            "joined prefix rejects a sentinel command hash",
        )
        if command_id in JOINED_FWM_ROW_PHASES:
            valid = phase == JOINED_FWM_ROW_PHASES[command_id] and (
                (outcome == "intent" and accepted_kind == "none")
                or (outcome == "accepted" and accepted_kind == "final_writer_manifest")
            )
            if outcome == "accepted":
                final_manifest_acceptances += 1
        elif command_id == "writers.quiesce":
            valid = phase == "quiesced"
            if valid and outcome in ("intent", "capability_issued", "capability_claimed", "capability_completed"):
                valid = accepted_kind == "none"
            elif valid and outcome == "accepted":
                valid = accepted_kind == "writer_quiesce_manifest"
            else:
                valid = False
        elif command_id in JOINED_ORDINARY_GRAMMAR:
            selector_phase, target_phase = JOINED_ORDINARY_GRAMMAR[command_id]
            valid = accepted_kind == "none"
            if valid and outcome == "intent":
                valid = phase == selector_phase
            elif valid and outcome in ("capability_issued", "capability_claimed"):
                valid = phase == target_phase
            elif valid and outcome == "completed":
                valid = phase == target_phase or JOINED_MILESTONE_WITNESSES.get(phase) == command_id
            else:
                valid = False
        elif command_id in JOINED_BARRIER_TARGET_PHASES:
            valid = accepted_kind == "none"
            if valid and outcome == "intent":
                valid = phase == JOINED_BARRIER_SELECTOR_PHASES[command_id]
            elif valid and outcome in ("capability_issued", "recovery_reacquired", "capability_claimed", "completed"):
                valid = phase == JOINED_BARRIER_TARGET_PHASES[command_id]
            else:
                valid = False
        else:
            valid = False
        require(valid, "joined prefix outcome/phase/command grammar mismatch")
        # Amendment section 4 item 8: two-segment quiesce binding with the
        # request-value fallback before the sole accepted switch.
        if command_id == "writers.quiesce" and outcome == "accepted":
            switched = True
        quiesce_value = entry["quiesce_manifest_sha256"]
        if switched:
            require(quiesce_value == quiesce_digest, "joined prefix quiesce binding mismatch")
        else:
            require(
                quiesce_value in ("0" * 64, quiesce_digest),
                "joined prefix quiesce binding mismatch",
            )
        # Amendment section 4 item 8: resource manifest steps only at the two
        # frozen evidence rows (pg.backup selector intent, deploy.prepare completion).
        resource_value = entry["resource_manifest_sha256"]
        if previous_resource is not None and resource_value != previous_resource:
            stepping = (command_id == "pg.backup" and outcome == "intent") or (
                command_id == "deploy.prepare" and outcome == "completed"
            )
            require(stepping, "joined prefix resource-manifest step is invalid")
        previous_resource = resource_value
    require(
        final_manifest_acceptances == 1,
        "joined prefix must publish exactly one final writer manifest",
    )
    # Amendment section 4 item 6 / section 5 group 9: the migrations_applied
    # milestone requires its durable witness lifecycle earlier in the same run.
    for entry in prefix:
        if entry["phase"] == "migrations_applied":
            require(
                entry["outcome"] == "completed"
                and entry["command_id"] == "migration.observability.apply",
                "joined prefix milestone binding is invalid",
            )
            require(
                any(
                    row["command_id"] == "migration.observability.apply"
                    and row["outcome"] == "completed"
                    and row["phase"] == "base_migration_guarded"
                    for row in prefix
                ),
                "joined prefix milestone witness lifecycle is missing",
            )

genesis_joined_prefix = (
    bool(journal_lines)
    and journal_lines[0]["command_id"] == "operator.self-check"
    and journal_lines[0]["phase"] == "preflight"
    and journal_lines[0]["outcome"] == "intent"
    and journal_lines[0]["seq"] == 1
)
# The genesis-rooted real Root joined prefix is the sole accepted journal shape:
# a writer resume must run against a genuine materialized run (operator.self-check
# genesis row), and section 5 is the only acceptance. A fabricated legacy prefix
# is rejected here at the genesis gate, before any Docker, database, or writer
# mutation (see the D4 genesis-gate negative in the runtime suite).
require(
    genesis_joined_prefix,
    "writer resume requires a genesis-rooted joined journal prefix",
)
# The W suffix is everything the controller itself appends after the Root
# prefix: forward = handoff -> db cleanup -> authority -> resume; rollback =
# reverse receipts -> db rollback -> rollback-state -> authority -> resume.
# The boundary is the first row that enters one of those W-owned phases.
if mode == "forward":
    w_suffix_phases = {
        "handoff_ready_writers_quiesced",
        "guard_cleanup_complete",
        "resume_authority_forward",
        "resume_committing_forward",
    }
else:
    w_suffix_phases = set(ROLLBACK_CONDITIONAL_PHASES) | {
        "guard_cleanup_complete",
        "rollback_ready_writers_quiesced",
        "resume_authority_rollback",
        "resume_committing_rollback",
    }
joined_suffix_start = next(
    (
        index
        for index, entry in enumerate(journal_lines)
        if entry["phase"] in w_suffix_phases
    ),
    None,
)
require(joined_suffix_start is not None, "joined prefix has no writer state suffix")
validate_joined_prefix(journal_lines[:joined_suffix_start], quiesce_file.digest)
expected_phase_graph = [
    (
        entry["phase"],
        entry["outcome"],
        entry["accepted_object_kind"],
        entry["accepted_object_sha256"],
    )
    for entry in journal_lines[:joined_suffix_start]
]
if mode == "forward":
    expected_phase_graph.extend([
        ("handoff_ready_writers_quiesced", "intent", "none", None),
        (
            "handoff_ready_writers_quiesced",
            "accepted",
            "writer_handoff_state",
            handoff_file.digest,
        ),
    ])
else:
    required_phase_set = {entry["phase"] for entry in rollback["required_phase_receipts"]}
    expected_phase_graph.extend([
        (phase, "completed", "none", None)
        for phase in ROLLBACK_CONDITIONAL_PHASES
        if phase in required_phase_set
    ])
expected_phase_graph.extend([
    (
        entry["phase"], entry["outcome"],
        entry["accepted_object_kind"], entry["accepted_object_sha256"],
    )
    for entry in database_lifecycle_entries
])
if mode == "rollback":
    expected_phase_graph.extend([
        ("rollback_ready_writers_quiesced", "intent", "none", None),
        (
            "rollback_ready_writers_quiesced",
            "accepted",
            "writer_rollback_state",
            rollback_file.digest,
        ),
    ])
expected_phase_graph.extend([
    (f"resume_authority_{mode}", "intent", "none", None),
    (
        f"resume_authority_{mode}",
        "accepted",
        "writer_resume_authority",
        authority_file.digest,
    ),
])
expected_phase_graph.extend([
    (entry["phase"], entry["outcome"], "none", None)
    for entry in lifecycle_entries
])
actual_phase_graph = [
    (
        entry["phase"],
        entry["outcome"],
        entry["accepted_object_kind"],
        entry["accepted_object_sha256"],
    )
    for entry in journal_lines
]
require(
    actual_phase_graph == expected_phase_graph,
    (
        "rollback conditional phase receipt journal graph is invalid"
        if mode == "rollback"
        else "forward journal phase graph is invalid"
    ),
)
if mode == "rollback":
    rollback_intent_index = next(
        index for index, entry in enumerate(journal_lines)
        if entry["entry_hash"] == final_manifest["publication_intent_journal_entry_hash"]
    )
    required_phase_set = {entry["phase"] for entry in rollback["required_phase_receipts"]}
    expected_rollback_suffix = ["rollback_preparing", "rollback_preparing"]
    expected_rollback_suffix.extend(
        phase for phase in ROLLBACK_CONDITIONAL_PHASES if phase in required_phase_set
    )
    expected_rollback_suffix.extend([
        *( ["guard_cleanup_complete"] * len(database_lifecycle_entries) ),
        "rollback_ready_writers_quiesced", "rollback_ready_writers_quiesced",
        "resume_authority_rollback", "resume_authority_rollback",
        *(["resume_committing_rollback"] * len(lifecycle_entries)),
    ])
    require(
        [entry["phase"] for entry in journal_lines[rollback_intent_index:]]
        == expected_rollback_suffix,
        "rollback conditional phase receipt journal is missing or out of reverse order",
    )
require(
    head["seq"] == checkpoint["seq"]
    and head["phase"] == checkpoint["phase"] == f"resume_committing_{mode}"
    and head["outcome"] == "capability_claimed"
    and head["command_id"] == command_id
    and head["entry_hash"] == checkpoint["journal_entry_hash"]
    and head["previous_hash"] == checkpoint["previous_journal_entry_hash"]
    and head["accepted_object_kind"] == checkpoint["accepted_object_kind"] == "none"
    and head["accepted_object_sha256"] is checkpoint["accepted_object_sha256"] is None
    and head["lease_epoch"] == checkpoint["lease_epoch"] == current_capability["value"]["lease_epoch"]
    and head["capability_manifest_sha256"] == current_capability["file"].digest
    and head["quiesce_manifest_sha256"] == quiesce_file.digest,
    "cutover journal/checkpoint binding is invalid",
)

known_writers = [*final_writers, *held_writers]
for project in sorted({item["project"] for item in target}):
    observed = {
        value for value in docker(
            "ps", "-aq", "--no-trunc",
            "--filter", f"label=com.docker.compose.project={project}",
        ).splitlines() if value
    }
    expected = {
        item["id"] for item in known_writers
        if item["project"] == project
    }
    require(observed == expected, "unrecorded target inventory exists")

opened_inputs = [
    barrier_file, quiesce_file, final_file, authority_file, checkpoint_file, journal_file,
    database_baseline_file, database_archive_file, database_proof_file,
    database_input_checkpoint_file, database_capability_file,
    database_capability_checkpoint_file,
    *[record["file"] for record in capability_chain],
    *opened_capability_checkpoints,
    *opened_input_checkpoints,
]
if mode == "forward": opened_inputs.extend([probe_file, recovery_file, handoff_file])
else: opened_inputs.extend([rollback_file, database_rollback_intent_file])

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
        "resume_intent_journal_entry_hash":resume_intent_entry["entry_hash"],
        "input_checkpoint_sha256":opened_input_checkpoints[-1].digest,
        "lease_epoch":current_capability["value"]["lease_epoch"],
        "final_inventory_sha256":canonical_inventory(final_projection),
        "held_inventory_sha256":canonical_inventory(held_projection),
    }

def fsync_run_root():
    directory_fd = os.open(run_root, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)

def publish_receipt(value):
    encoded = canonical_json(value, "writer resume state") + b"\n"
    if os.path.exists(paths["terminal"]):
        existing = Opened(paths["terminal"], "writer resume state", 0o400)
        require(existing.data == encoded, "existing writer resume state is ambiguous")
        if startup_terminal_temporary is not None:
            startup_terminal_temporary.recheck()
            require(
                startup_terminal_temporary.data == encoded,
                "existing writer resume temporary is ambiguous",
            )
            os.unlink(paths["terminal_temporary"])
            fsync_run_root()
        return
    fd = -1
    temporary = paths["terminal_temporary"]
    try:
        if startup_terminal_temporary is None:
            fd = os.open(
                temporary,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                0o600,
            )
            os.write(fd, encoded)
            os.fchown(fd, uid, gid)
            os.fchmod(fd, 0o400)
            os.fsync(fd)
            os.close(fd); fd = -1
            fsync_run_root()
        else:
            startup_terminal_temporary.recheck()
            require(
                startup_terminal_temporary.data == encoded,
                "existing writer resume temporary is ambiguous",
            )
        if fault_point == "after-terminal-temp-fsync":
            os.kill(os.getpid(), signal.SIGKILL)
        try:
            rename_noreplace(temporary, paths["terminal"])
            temporary = None
        except FileExistsError:
            existing = Opened(paths["terminal"], "writer resume state", 0o400)
            require(existing.data == encoded, "existing writer resume state is ambiguous")
            os.unlink(temporary)
            temporary = None
            fsync_run_root()
            return
        if fault_point == "after-terminal-rename":
            os.kill(os.getpid(), signal.SIGKILL)
        fsync_run_root()
    finally:
        if fd >= 0: os.close(fd)
        if temporary is not None and fault_point != "after-terminal-temp-fsync":
            try:
                os.unlink(temporary)
                fsync_run_root()
            except FileNotFoundError:
                pass

recovery_epoch = checkpoint["lease_epoch"].startswith("cutover-recovery-")
if startup_terminal_temporary is not None and not os.path.exists(paths["terminal"]):
    require(
        recovery_epoch,
        "writer resume temporary residue requires an approved recovery epoch",
    )
if os.path.exists(paths["terminal"]):
    final_projection, held_projection = terminal_projection()
    publish_receipt(expected_receipt(final_projection, held_projection))
    sys.exit(0)

initial_final, initial_held = observe_all(True)
prove_held(initial_held)
if recovery_epoch:
    if all(is_terminal(row, item) for item, row, _ in initial_final):
        final_projection, held_projection = terminal_projection()
        for item in opened_inputs: item.recheck()
        publish_receipt(expected_receipt(final_projection, held_projection))
        sys.exit(0)
    if not all(is_stopped_no(row) for _, row, _ in initial_final):
        compensate()
        raise ResumeError("recovered partial resume was compensated; a new recovery epoch is required")
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
