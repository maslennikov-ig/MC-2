#!/usr/bin/env python3
"""Content-addressed verification evidence with fail-closed reuse."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import glob
import hashlib
import json
import os
import pathlib
import platform
import shutil
import subprocess
import sys
import time
from collections.abc import Callable, Mapping
from typing import Any


MANIFEST_SCHEMA = "verification-manifest/v2"
EVIDENCE_SCHEMA = "verification-evidence/v2"
RECEIPT_SCHEMA = "acceptance-receipt/v2"
PRODUCER_NAME = "orchestration-setup"
KILL_SWITCH_ENV = "ORCHESTRATION_EVIDENCE_REUSE_DISABLED"
TRUTHY = {"1", "true", "yes", "on"}
ORCHESTRATION_LEVELS = frozenset(
    {"inner_loop", "slice_acceptance", "integration", "release"}
)


class EvidenceError(RuntimeError):
    """The evidence contract is unsafe, incomplete, or malformed."""


def normalize_orchestration_level(value: object) -> str:
    if not isinstance(value, str):
        raise EvidenceError("orchestration level must be a string")
    normalized = value.strip().lower()
    if normalized not in ORCHESTRATION_LEVELS:
        raise EvidenceError(f"unsupported orchestration level: {value!r}")
    return normalized


def _canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )


def _digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _digest_json(value: object) -> str:
    return _digest_bytes(_canonical(value))


def _read_json(path: pathlib.Path) -> dict[str, Any] | None:
    if path.is_symlink() or not path.is_file():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


def _atomic_json(path: pathlib.Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        temporary.write_bytes(_canonical(value) + b"\n")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _safe_relative(raw: object, *, label: str) -> pathlib.PurePosixPath:
    if not isinstance(raw, str) or not raw.strip():
        raise EvidenceError(f"{label} must be a non-empty repo-relative path")
    normalized = raw.replace("\\", "/")
    path = pathlib.PurePosixPath(normalized)
    if path.is_absolute() or ".." in path.parts:
        raise EvidenceError(f"{label} rejects absolute and parent paths: {raw!r}")
    return path


def _reject_symlink_chain(repo_root: pathlib.Path, relative: pathlib.PurePosixPath) -> pathlib.Path:
    current = repo_root
    for component in relative.parts:
        current = current / component
        if current.is_symlink():
            raise EvidenceError(f"verification inputs may not traverse symlinks: {relative}")
    return current


def _expand_declared_paths(
    repo_root: pathlib.Path,
    raw_paths: object,
    *,
    label: str,
    digest_cache: dict[pathlib.Path, str] | None = None,
) -> list[dict[str, object]]:
    if not isinstance(raw_paths, list) or any(not isinstance(item, str) for item in raw_paths):
        raise EvidenceError(f"{label} must be a list of repo-relative paths or globs")
    records: dict[str, dict[str, object]] = {}
    for index, raw in enumerate(raw_paths):
        relative = _safe_relative(raw, label=f"{label}[{index}]")
        matches = sorted(
            pathlib.PurePosixPath(item)
            for item in glob.glob(relative.as_posix(), root_dir=repo_root, recursive=True)
        )
        if not matches:
            raise EvidenceError(f"{label}[{index}] matched no files: {raw!r}")
        for match in matches:
            candidate = _reject_symlink_chain(repo_root, match)
            if candidate.is_dir():
                descendants = sorted(path for path in candidate.rglob("*") if path.is_file())
                for descendant in descendants:
                    descendant_relative = pathlib.PurePosixPath(
                        descendant.relative_to(repo_root).as_posix()
                    )
                    _reject_symlink_chain(repo_root, descendant_relative)
                    digest = (
                        digest_cache.get(descendant)
                        if digest_cache is not None
                        else None
                    )
                    if digest is None:
                        digest = _digest_bytes(descendant.read_bytes())
                        if digest_cache is not None:
                            digest_cache[descendant] = digest
                    records[descendant_relative.as_posix()] = {
                        "path": descendant_relative.as_posix(),
                        "digest": digest,
                    }
                continue
            if not candidate.is_file():
                raise EvidenceError(f"{label}[{index}] is not a regular file: {match}")
            digest = digest_cache.get(candidate) if digest_cache is not None else None
            if digest is None:
                digest = _digest_bytes(candidate.read_bytes())
                if digest_cache is not None:
                    digest_cache[candidate] = digest
            records[match.as_posix()] = {
                "path": match.as_posix(),
                "digest": digest,
            }
    return [records[key] for key in sorted(records)]


def _tool_identity(raw_tools: object, *, label: str) -> list[dict[str, str]]:
    if not isinstance(raw_tools, list):
        raise EvidenceError(f"{label} must be a list")
    identities: list[dict[str, str]] = []
    for index, raw in enumerate(raw_tools):
        if not isinstance(raw, dict):
            raise EvidenceError(f"{label}[{index}] must be an object")
        name = raw.get("name")
        executable = raw.get("executable")
        if not isinstance(name, str) or not name.strip():
            raise EvidenceError(f"{label}[{index}].name must be non-empty")
        if not isinstance(executable, str) or not executable.strip():
            raise EvidenceError(f"{label}[{index}].executable must be non-empty")
        resolved = shutil.which(executable)
        if not resolved:
            raise EvidenceError(f"{label}[{index}] executable not found: {executable}")
        path = pathlib.Path(resolved).resolve()
        if not path.is_file():
            raise EvidenceError(f"{label}[{index}] executable is not a file: {path}")
        try:
            version_result = subprocess.run(
                [str(path), "--version"],
                text=True,
                capture_output=True,
                check=False,
                timeout=5,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise EvidenceError(f"cannot identify tool {name!r}: {exc}") from exc
        version_lines = (version_result.stdout or version_result.stderr).strip().splitlines()
        identities.append(
            {
                "name": name.strip(),
                "path": str(path),
                "digest": _digest_bytes(path.read_bytes()),
                "version": version_lines[0] if version_lines else f"exit:{version_result.returncode}",
            }
        )
    return sorted(identities, key=lambda item: item["name"])


def _environment_identity(raw_names: object, environment: Mapping[str, str]) -> list[dict[str, str]]:
    if not isinstance(raw_names, list) or any(not isinstance(item, str) or not item for item in raw_names):
        raise EvidenceError("step.environment must be a list of non-empty variable names")
    if len(set(raw_names)) != len(raw_names):
        raise EvidenceError("step.environment contains duplicate names")
    return [
        {
            "name": name,
            "value_digest": _digest_bytes(environment.get(name, "<unset>").encode("utf-8")),
        }
        for name in sorted(raw_names)
    ]


def _producer_identity() -> dict[str, str]:
    implementation = pathlib.Path(__file__).resolve()
    return {
        "name": PRODUCER_NAME,
        "schema": EVIDENCE_SCHEMA,
        "implementation": implementation.name,
        "implementation_digest": _digest_bytes(implementation.read_bytes()),
    }


def load_manifest(repo_root: pathlib.Path, manifest_path: pathlib.Path) -> dict[str, Any]:
    root = repo_root.resolve()
    path = manifest_path if manifest_path.is_absolute() else root / manifest_path
    try:
        relative = pathlib.PurePosixPath(path.relative_to(root).as_posix())
    except ValueError as exc:
        raise EvidenceError("verification manifest must be inside the repository") from exc
    _reject_symlink_chain(root, relative)
    payload = _read_json(path)
    if payload is None:
        raise EvidenceError("verification manifest is missing, malformed, or a symlink")
    if payload.get("schema_version") != MANIFEST_SCHEMA:
        raise EvidenceError(f"verification manifest must declare {MANIFEST_SCHEMA}")
    if payload.get("producer") != PRODUCER_NAME:
        raise EvidenceError(f"verification manifest producer must be {PRODUCER_NAME!r}")
    required = payload.get("required_steps")
    steps = payload.get("steps")
    if not isinstance(required, list) or any(not isinstance(item, str) or not item for item in required):
        raise EvidenceError("required_steps must be a list of non-empty step ids")
    if len(required) != len(set(required)):
        raise EvidenceError("required_steps contains duplicates")
    if not required:
        raise EvidenceError("required_steps must not be empty in an active manifest")
    if not isinstance(steps, list) or any(not isinstance(item, dict) for item in steps):
        raise EvidenceError("steps must be a list of objects")
    step_ids = [item.get("id") for item in steps]
    if required != step_ids:
        raise EvidenceError("required_steps must exactly match the ordered step id set")
    known: set[str] = set()
    for index, step in enumerate(steps):
        step_id = step.get("id")
        command = step.get("command")
        cwd = _safe_relative(step.get("cwd", "."), label=f"steps[{index}].cwd")
        cwd_path = _reject_symlink_chain(root, cwd)
        if not cwd_path.is_dir():
            raise EvidenceError(f"steps[{index}].cwd is not a directory: {cwd}")
        if not isinstance(command, str) or not command.strip():
            raise EvidenceError(f"steps[{index}].command must be non-empty")
        dependencies = step.get("dependencies", [])
        if not isinstance(dependencies, list) or any(item not in known for item in dependencies):
            raise EvidenceError(
                f"steps[{index}].dependencies must name earlier required steps"
            )
        if len(dependencies) != len(set(dependencies)):
            raise EvidenceError(f"steps[{index}].dependencies contains duplicates")
        cache = step.get("cache")
        eligible = False
        if cache is not None:
            if not isinstance(cache, dict):
                raise EvidenceError(f"steps[{index}].cache must be an object")
            eligible = cache.get("eligible") is True
            reason = cache.get("reason")
            if not isinstance(reason, str) or not reason.strip():
                raise EvidenceError(f"steps[{index}].cache needs a one-line reason")
            if "\n" in reason:
                raise EvidenceError(f"steps[{index}].cache.reason must be one line")
        if eligible and step.get("inputs_complete") is not True:
            raise EvidenceError(
                f"steps[{index}] cannot be cache-eligible without inputs_complete = true"
            )
        if eligible and step.get("external") is True:
            raise EvidenceError(f"steps[{index}] external steps cannot be cache-eligible")
        known.add(str(step_id))
    return payload


def build_identity(
    repo_root: pathlib.Path,
    manifest_path: pathlib.Path,
    manifest: dict[str, Any],
    *,
    orchestration_level: str,
    environment: Mapping[str, str],
) -> dict[str, Any]:
    root = repo_root.resolve()
    level = normalize_orchestration_level(orchestration_level)
    manifest_file = manifest_path if manifest_path.is_absolute() else root / manifest_path
    manifest_relative = manifest_file.relative_to(root).as_posix()
    producer = _producer_identity()
    python_path = pathlib.Path(sys.executable).resolve()
    runner = {
        "python_path": str(python_path),
        "python_digest": _digest_bytes(python_path.read_bytes()),
        "python_version": platform.python_version(),
    }
    platform_identity = {
        "system": platform.system(),
        "machine": platform.machine(),
        "release": platform.release(),
    }
    step_identities: list[dict[str, Any]] = []
    fingerprints: dict[str, str] = {}
    file_digest_cache: dict[pathlib.Path, str] = {}
    tool_cache: dict[bytes, list[dict[str, str]]] = {}
    for index, step in enumerate(manifest["steps"]):
        inputs = _expand_declared_paths(
            root,
            step.get("inputs", []),
            label=f"steps[{index}].inputs",
            digest_cache=file_digest_cache,
        )
        lockfiles = _expand_declared_paths(
            root,
            step.get("lockfiles", []),
            label=f"steps[{index}].lockfiles",
            digest_cache=file_digest_cache,
        ) if step.get("lockfiles", []) else []
        raw_tools = step.get("tools", [])
        tool_key = _canonical(raw_tools)
        if tool_key not in tool_cache:
            tool_cache[tool_key] = _tool_identity(
                raw_tools, label=f"steps[{index}].tools"
            )
        tools = tool_cache[tool_key]
        env = _environment_identity(step.get("environment", []), environment)
        dependencies = list(step.get("dependencies", []))
        cache = step.get("cache") if isinstance(step.get("cache"), dict) else {}
        identity = {
            "id": step["id"],
            "orchestration_level": level,
            "command": step["command"].strip(),
            "cwd": pathlib.PurePosixPath(str(step.get("cwd", "."))).as_posix(),
            "cwd_absolute": str(
                (root / pathlib.PurePosixPath(str(step.get("cwd", ".")))).resolve()
            ),
            "inputs": inputs,
            "lockfiles": lockfiles,
            "tools": tools,
            "environment": env,
            "dependencies": dependencies,
            "dependency_fingerprints": [fingerprints[item] for item in dependencies],
            "external": step.get("external") is True,
            "cache_eligible": cache.get("eligible") is True,
            "cache_reason": str(cache.get("reason") or "default-never"),
            "inputs_complete": step.get("inputs_complete") is True,
            "producer": producer,
            "runner": runner,
            "platform": platform_identity,
        }
        identity["fingerprint"] = _digest_json(identity)
        fingerprints[str(step["id"])] = str(identity["fingerprint"])
        step_identities.append(identity)
    aggregate = {
        "orchestration_level": level,
        "manifest": {
            "path": manifest_relative,
            "digest": _digest_bytes(manifest_file.read_bytes()),
            "schema": MANIFEST_SCHEMA,
        },
        "producer": producer,
        "required_steps": list(manifest["required_steps"]),
        "steps": step_identities,
        "runner": runner,
        "cwd": str(root),
        "platform": platform_identity,
    }
    aggregate["identity_digest"] = _digest_json(aggregate)
    return aggregate


def _git_common_dir(repo_root: pathlib.Path) -> pathlib.Path:
    done = subprocess.run(
        ["git", "rev-parse", "--git-common-dir"],
        cwd=repo_root,
        text=True,
        capture_output=True,
        check=False,
    )
    if done.returncode != 0 or not done.stdout.strip():
        raise EvidenceError("verification evidence requires a Git repository")
    raw = pathlib.Path(done.stdout.strip())
    return (repo_root / raw).resolve() if not raw.is_absolute() else raw.resolve()


def _safe_report_dir(repo_root: pathlib.Path, report_dir: pathlib.Path) -> tuple[pathlib.Path, pathlib.Path]:
    common = _git_common_dir(repo_root)
    resolved = report_dir.resolve()
    try:
        relative = resolved.relative_to(common)
    except ValueError as exc:
        raise EvidenceError("generated report directory must be inside the Git common directory") from exc
    current = common
    for component in relative.parts:
        current = current / component
        if current.exists() and current.is_symlink():
            raise EvidenceError("generated report directory may not traverse symlinks")
    return common, resolved


def _safe_receipt_path(repo_root: pathlib.Path, receipt_path: pathlib.Path) -> pathlib.Path:
    root = repo_root.resolve()
    candidate = receipt_path if receipt_path.is_absolute() else root / receipt_path
    try:
        relative = pathlib.PurePosixPath(candidate.absolute().relative_to(root).as_posix())
    except ValueError as exc:
        raise EvidenceError("acceptance receipt path must be inside the repository") from exc
    current = root
    for component in relative.parts:
        current = current / component
        if current.exists() and current.is_symlink():
            raise EvidenceError("acceptance receipt path may not traverse symlinks")
    return candidate


def _report_self_digest(report: dict[str, Any]) -> str:
    unsigned = dict(report)
    unsigned.pop("self_digest", None)
    return _digest_json(unsigned)


def _load_previous_report(
    repo_root: pathlib.Path,
    receipt_path: pathlib.Path,
    report_dir: pathlib.Path,
    *,
    stage_id: str,
    orchestration_level: str,
    required_steps: list[str],
) -> dict[str, Any] | None:
    level = normalize_orchestration_level(orchestration_level)
    receipt = _read_json(receipt_path)
    if receipt is None or receipt.get("schema_version") != RECEIPT_SCHEMA:
        return None
    if (
        receipt.get("result") != "passed"
        or receipt.get("stage_id") != stage_id
        or receipt.get("orchestration_level") != level
    ):
        return None
    common, safe_dir = _safe_report_dir(repo_root, report_dir)
    raw_path = receipt.get("report_path")
    try:
        relative = _safe_relative(raw_path, label="receipt.report_path")
    except EvidenceError:
        return None
    report_path = common.joinpath(*relative.parts)
    try:
        report_path.resolve().relative_to(safe_dir)
    except (OSError, ValueError):
        return None
    if report_path.is_symlink() or not report_path.is_file():
        return None
    try:
        report_bytes = report_path.read_bytes()
        report = json.loads(report_bytes.decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(report, dict):
        return None
    report_digest = _digest_bytes(report_bytes)
    if receipt.get("report_digest") != report_digest:
        return None
    if report.get("schema_version") != EVIDENCE_SCHEMA or report.get("result") != "PASS":
        return None
    if report.get("orchestration_level") != level:
        return None
    report_identity = report.get("identity")
    if (
        not isinstance(report_identity, dict)
        or report_identity.get("orchestration_level") != level
    ):
        return None
    if report.get("self_digest") != _report_self_digest(report):
        return None
    if report.get("required_steps") != required_steps:
        return None
    if receipt.get("report_self_digest") != report.get("self_digest"):
        return None
    return report


def validate_reusable_receipt(
    *,
    repo_root: pathlib.Path,
    manifest_path: pathlib.Path,
    receipt_path: pathlib.Path,
    report_dir: pathlib.Path,
    stage_id: str,
    orchestration_level: str,
    environment: Mapping[str, str] | None = None,
) -> dict[str, Any] | None:
    level = normalize_orchestration_level(orchestration_level)
    manifest = load_manifest(repo_root, manifest_path)
    identity = build_identity(
        repo_root,
        manifest_path,
        manifest,
        orchestration_level=level,
        environment=environment or os.environ,
    )
    report = _load_previous_report(
        repo_root,
        receipt_path,
        report_dir,
        stage_id=stage_id,
        orchestration_level=level,
        required_steps=list(manifest["required_steps"]),
    )
    if report is None or report.get("identity_digest") != identity["identity_digest"]:
        return None
    receipt = _read_json(receipt_path)
    if receipt is None or receipt.get("identity_digest") != identity["identity_digest"]:
        return None
    return report


def _write_report(
    repo_root: pathlib.Path, report_dir: pathlib.Path, report: dict[str, Any]
) -> tuple[pathlib.Path, str]:
    common, safe_dir = _safe_report_dir(repo_root, report_dir)
    report["self_digest"] = _report_self_digest(report)
    path = safe_dir / f"{report['self_digest']}.json"
    payload = _canonical(report) + b"\n"
    if path.exists():
        if path.is_symlink() or path.read_bytes() != payload:
            raise EvidenceError(f"immutable report collision: {path}")
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
    return pathlib.Path(path.relative_to(common)), _digest_bytes(payload)


def run_verification(
    *,
    repo_root: pathlib.Path,
    manifest_path: pathlib.Path,
    receipt_path: pathlib.Path,
    report_dir: pathlib.Path,
    stage_id: str,
    orchestration_level: str,
    reuse_requested: bool,
    must_run: bool,
    shadow: bool,
    reuse_policy_enabled: bool,
    environment: Mapping[str, str] | None = None,
    pre_reuse_gate: Callable[[], None] | None = None,
    post_execution_gate: Callable[[], None] | None = None,
) -> dict[str, Any]:
    root = repo_root.resolve()
    level = normalize_orchestration_level(orchestration_level)
    env = os.environ if environment is None else environment
    receipt_path = _safe_receipt_path(root, receipt_path)
    manifest = load_manifest(root, manifest_path)
    identity = build_identity(
        root,
        manifest_path,
        manifest,
        orchestration_level=level,
        environment=env,
    )
    if pre_reuse_gate is not None:
        pre_reuse_gate()
    killed = env.get(KILL_SWITCH_ENV, "").strip().lower() in TRUTHY
    reuse_allowed = (
        (reuse_requested or shadow)
        and reuse_policy_enabled
        and not must_run
        and not killed
    )
    previous = _load_previous_report(
        root,
        receipt_path,
        report_dir,
        stage_id=stage_id,
        orchestration_level=level,
        required_steps=list(manifest["required_steps"]),
    )
    previous_steps = {
        str(item.get("id")): item
        for item in (previous or {}).get("steps", [])
        if isinstance(item, dict)
    }
    results: list[dict[str, Any]] = []
    result_by_id: dict[str, str] = {}
    for step, current in zip(manifest["steps"], identity["steps"], strict=True):
        step_id = str(step["id"])
        dependencies = list(step.get("dependencies", []))
        if any(result_by_id.get(item) != "passed" for item in dependencies):
            entry = {
                "id": step_id,
                "fingerprint": current["fingerprint"],
                "result": "blocked",
                "disposition": "blocked",
                "blocked_by": [item for item in dependencies if result_by_id.get(item) != "passed"],
            }
            results.append(entry)
            result_by_id[step_id] = "blocked"
            continue
        previous_step = previous_steps.get(step_id)
        would_hit = bool(
            reuse_allowed
            and current["cache_eligible"]
            and previous_step
            and previous_step.get("fingerprint") == current["fingerprint"]
            and previous_step.get("result") == "passed"
        )
        if would_hit and not shadow:
            entry = {
                "id": step_id,
                "fingerprint": current["fingerprint"],
                "result": "passed",
                "disposition": "cached",
                "cache_decision": "hit",
            }
        else:
            started = time.monotonic()
            completed = subprocess.run(
                str(step["command"]),
                cwd=root / pathlib.PurePosixPath(str(step.get("cwd", "."))),
                shell=True,
                text=True,
                capture_output=True,
                check=False,
                env=dict(env),
            )
            entry = {
                "id": step_id,
                "fingerprint": current["fingerprint"],
                "result": "passed" if completed.returncode == 0 else "failed",
                "disposition": "executed",
                "cache_decision": "would-hit" if would_hit and shadow else "miss",
                "exit_code": completed.returncode,
                "duration_seconds": round(time.monotonic() - started, 3),
                "stdout_digest": _digest_bytes(completed.stdout.encode("utf-8")),
                "stderr_digest": _digest_bytes(completed.stderr.encode("utf-8")),
            }
        results.append(entry)
        result_by_id[step_id] = str(entry["result"])

    if post_execution_gate is not None:
        post_execution_gate()

    aggregate_result = "PASS" if all(item["result"] == "passed" for item in results) else "FAIL"
    report: dict[str, Any] = {
        "schema_version": EVIDENCE_SCHEMA,
        "orchestration_level": level,
        "producer": identity["producer"],
        "identity": identity,
        "identity_digest": identity["identity_digest"],
        "required_steps": list(manifest["required_steps"]),
        "steps": results,
        "result": aggregate_result,
        "reuse": {
            "requested": reuse_requested,
            "policy_enabled": reuse_policy_enabled,
            "must_run": must_run,
            "shadow": shadow,
            "kill_switch": killed,
        },
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    report_relative, report_digest = _write_report(root, report_dir, report)
    if aggregate_result == "PASS":
        _atomic_json(
            receipt_path,
            {
                "schema_version": RECEIPT_SCHEMA,
                "result": "passed",
                "stage_id": stage_id,
                "orchestration_level": level,
                "identity_digest": identity["identity_digest"],
                "required_steps": list(manifest["required_steps"]),
                "manifest_path": identity["manifest"]["path"],
                "manifest_digest": identity["manifest"]["digest"],
                "report_path": report_relative.as_posix(),
                "report_digest": report_digest,
                "report_self_digest": report["self_digest"],
                "producer": identity["producer"],
            },
        )
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=pathlib.Path, default=pathlib.Path.cwd())
    parser.add_argument("--manifest", type=pathlib.Path, required=True)
    parser.add_argument("--receipt", type=pathlib.Path, required=True)
    parser.add_argument("--report-dir", type=pathlib.Path, required=True)
    parser.add_argument("--stage", required=True)
    parser.add_argument("--level", required=True, choices=sorted(ORCHESTRATION_LEVELS))
    parser.add_argument("--reuse-policy-enabled", action="store_true")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--reuse", action="store_true")
    mode.add_argument("--must-run", action="store_true")
    parser.add_argument("--shadow", action="store_true")
    args = parser.parse_args(argv)
    report = run_verification(
        repo_root=args.repo,
        manifest_path=args.manifest,
        receipt_path=args.receipt,
        report_dir=args.report_dir,
        stage_id=args.stage,
        orchestration_level=args.level,
        reuse_requested=args.reuse,
        must_run=args.must_run or (not args.reuse and not args.shadow),
        shadow=args.shadow,
        reuse_policy_enabled=args.reuse_policy_enabled,
    )
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["result"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
