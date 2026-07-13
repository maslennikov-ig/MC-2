#!/usr/bin/env python3
"""Run stage close verification based on the repo-local orchestration contract."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import fcntl
import json
import pathlib
import re
import subprocess
import sys
import tomllib

DEBT_MARKER_PATTERN = re.compile(r"\b(TODO|FIXME|HACK|XXX)\b", re.IGNORECASE)
DEBT_POLICY_REFERENCE_PATTERNS = (
    "TODO/FIXME/HACK/XXX",
    "DEBT_MARKER_PATTERN",
    "debt marker",
    "debt markers",
)
PROJECT_INDEX_REVIEW_MARKER = "project-index: reviewed-no-change"
DOCS_REVIEW_MARKER = "docs-reviewed:"
PLACEHOLDERS = {"", "n/a", "<short cleanup result or blocker>"}
STRUCTURAL_CHANGE_PREFIXES = (
    "app/",
    "apps/",
    "api/",
    "pages/",
    "routes/",
    "packages/",
    "src/api/",
    "src/app/",
    "src/integrations/",
    "src/routes/",
    "src/server/",
    "src/services/",
    "migrations/",
    "db/migrations/",
    "supabase/migrations/",
    ".github/workflows/",
    "scripts/orchestration/",
    "frontend/",
)
STRUCTURAL_CHANGE_FILES = {
    "AGENTS.md",
    "README.md",
    "package.json",
    "pnpm-workspace.yaml",
    "pyproject.toml",
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.dev.yml",
    ".codex/orchestrator.toml",
    "src/main.py",
    "src/worker.py",
}
VERIFICATION_TIER_ORDER = ("inner", "delta", "integration", "release")


def parse_frontmatter(text: str) -> tuple[str, str]:
    if not text.startswith("---\n"):
        raise ValueError("file must start with YAML frontmatter")

    end = text.find("\n---\n", 4)
    if end == -1:
        raise ValueError("frontmatter closing marker not found")

    return text[4:end], text[end + 5 :]


def parse_artifact(path: pathlib.Path) -> dict[str, object]:
    frontmatter, _ = parse_frontmatter(path.read_text())
    data: dict[str, object] = {}
    current_key: str | None = None

    for raw_line in frontmatter.splitlines():
        if not raw_line:
            continue
        if raw_line.startswith("  - ") or raw_line.startswith("- "):
            if current_key is not None:
                values = data.setdefault(current_key, [])
                if isinstance(values, list):
                    values.append(raw_line.split("-", 1)[1].strip())
            continue
        if ":" not in raw_line:
            continue
        key, value = raw_line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if value:
            data[key] = value
            current_key = None
        else:
            data[key] = []
            current_key = key

    return data


def load_stage_artifacts(repo_root: pathlib.Path, stage_id: str) -> list[dict[str, object]]:
    artifacts_dir = repo_root / ".codex" / "stages" / stage_id / "artifacts"
    if not artifacts_dir.exists():
        return []

    return [parse_artifact(path) for path in sorted(artifacts_dir.glob("*.md"))]


def meaningful_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [
        item.strip().lower()
        for item in value
        if isinstance(item, str)
        and item.strip()
        and not item.strip().startswith("<")
        and item.strip().lower() not in {"n/a", "none"}
    ]


def append_unique(groups: list[str], additions: object) -> None:
    if not isinstance(additions, list):
        return
    for group in additions:
        if isinstance(group, str) and group and group not in groups:
            groups.append(group)


def append_policy_groups(
    groups: list[str],
    verification: dict[str, object],
    mapping: dict[str, object],
    mapping_name: str,
    selector: str,
) -> None:
    additions = mapping.get(selector)
    if not isinstance(additions, list) or not additions:
        raise SystemExit(
            f"verification_policy.{mapping_name}.{selector!r} must be a non-empty command-group list"
        )
    for group in additions:
        if not isinstance(group, str) or not group:
            raise SystemExit(
                f"verification_policy.{mapping_name}.{selector!r} contains an invalid command group"
            )
        if not isinstance(verification.get(group), list) or not verification[group]:
            raise SystemExit(
                f"verification group {group!r} selected by {mapping_name}.{selector!r} is missing, empty, or not a list"
            )
        if group not in groups:
            groups.append(group)


def artifact_metadata(artifacts: list[dict[str, object]]) -> tuple[str, set[str], set[str], bool]:
    tiers: set[str] = set()
    risk_tags: set[str] = set()
    surfaces: set[str] = set()
    present = False
    for artifact in artifacts:
        tier = artifact.get("verification_tier")
        if isinstance(tier, str) and tier.strip().lower() in VERIFICATION_TIER_ORDER:
            tiers.add(tier.strip().lower())
            present = True
        tags = meaningful_list(artifact.get("risk_tags"))
        affected = meaningful_list(artifact.get("affected_surfaces"))
        if tags or affected:
            present = True
        risk_tags.update(tags)
        surfaces.update(affected)

    selected_tier = ""
    for tier in reversed(VERIFICATION_TIER_ORDER):
        if tier in tiers:
            selected_tier = tier
            break
    return selected_tier, risk_tags, surfaces, present


def artifact_has_adaptive_metadata(artifact: dict[str, object]) -> bool:
    return artifact_metadata([artifact])[3]


def split_adaptive_artifacts(
    artifacts: list[dict[str, object]],
) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    modern: list[dict[str, object]] = []
    legacy: list[dict[str, object]] = []
    for artifact in artifacts:
        (modern if artifact_has_adaptive_metadata(artifact) else legacy).append(artifact)
    return modern, legacy


def infer_legacy_groups(contract: dict[str, object], artifacts: list[dict[str, object]], include_optional: bool) -> list[str]:
    verification = contract.get("verification", {})
    if not isinstance(verification, dict):
        return []

    groups: list[str] = []
    workspace = contract.get("workspace", {})
    multi_repo = bool(workspace.get("multi_repo")) if isinstance(workspace, dict) else False
    touched_repos: set[str] = set()
    has_changed_files = False

    for artifact in artifacts:
        repo = artifact.get("repo")
        if isinstance(repo, str) and repo and repo not in {"n/a", "<repo-or-n/a>"}:
            touched_repos.add(repo)

        changed_files = artifact.get("changed_files")
        if isinstance(changed_files, list) and any(item and not str(item).startswith("<") for item in changed_files):
            has_changed_files = True

    if multi_repo:
        for repo in sorted(touched_repos):
            group = f"{repo}_commands"
            if group in verification:
                groups.append(group)
    elif has_changed_files and "code_change_commands" in verification:
        groups.append("code_change_commands")

    if include_optional and "stage_level_optional_commands" in verification:
        groups.append("stage_level_optional_commands")

    return groups


def infer_adaptive_groups(
    contract: dict[str, object], artifacts: list[dict[str, object]], include_optional: bool
) -> list[str]:
    verification = contract.get("verification", {})
    policy = contract.get("verification_policy")
    if not isinstance(verification, dict) or not isinstance(policy, dict):
        raise SystemExit("risk-adaptive verification requires [verification] and [verification_policy]")
    if policy.get("mode") != "risk_adaptive":
        raise SystemExit("verification_policy.mode must be 'risk_adaptive' for artifacts with adaptive metadata")

    tier, risk_tags, surfaces, metadata_present = artifact_metadata(artifacts)
    if not metadata_present:
        raise SystemExit("adaptive verification requires artifact metadata")

    tier = tier or str(policy.get("default_tier", "integration")).strip().lower()
    if tier not in VERIFICATION_TIER_ORDER:
        raise SystemExit(f"unsupported verification tier: {tier!r}")
    tier_groups = policy.get("tier_groups")
    if not isinstance(tier_groups, dict):
        raise SystemExit("verification_policy.tier_groups must be a table")

    groups: list[str] = []
    append_policy_groups(groups, verification, tier_groups, "tier_groups", tier)

    risk_tag_groups = policy.get("risk_tag_groups", {})
    if not isinstance(risk_tag_groups, dict):
        raise SystemExit("verification_policy.risk_tag_groups must be a table")
    for tag in sorted(risk_tags):
        append_policy_groups(groups, verification, risk_tag_groups, "risk_tag_groups", tag)

    surface_groups = policy.get("surface_groups", {})
    if not isinstance(surface_groups, dict):
        raise SystemExit("verification_policy.surface_groups must be a table")
    for surface in sorted(surfaces):
        append_policy_groups(groups, verification, surface_groups, "surface_groups", surface)

    if include_optional and "stage_level_optional_commands" in verification:
        append_unique(groups, ["stage_level_optional_commands"])

    return groups


def infer_groups(contract: dict[str, object], artifacts: list[dict[str, object]], include_optional: bool) -> list[str]:
    """Choose adaptive groups per modern artifact and preserve legacy evidence for older artifacts."""
    policy = contract.get("verification_policy")
    modern, legacy = split_adaptive_artifacts(artifacts)
    if isinstance(policy, dict) and policy.get("mode") == "risk_adaptive" and high_risk_artifacts_missing_metadata(artifacts):
        raise SystemExit(
            "high-risk changed artifacts require verification_tier, risk_tags, affected_surfaces, and invariants"
        )
    if not modern:
        return infer_legacy_groups(contract, artifacts, include_optional)
    if not isinstance(policy, dict) or policy.get("mode") != "risk_adaptive":
        raise SystemExit("artifacts with adaptive metadata require verification_policy.mode = 'risk_adaptive'")

    groups = infer_adaptive_groups(contract, modern, include_optional)
    if legacy:
        append_unique(groups, infer_legacy_groups(contract, legacy, include_optional))
    return groups


def artifact_has_changed_files(artifact: dict[str, object]) -> bool:
    changed_files = artifact.get("changed_files")
    return isinstance(changed_files, list) and any(
        item and not str(item).startswith("<") for item in changed_files
    )


def high_risk_artifacts_missing_metadata(artifacts: list[dict[str, object]]) -> bool:
    for artifact in artifacts:
        risk_level = artifact.get("risk_level")
        if not (
            artifact_has_changed_files(artifact)
            and isinstance(risk_level, str)
            and risk_level.lower() == "high"
        ):
            continue
        tier = artifact.get("verification_tier")
        if not isinstance(tier, str) or tier.strip().lower() not in VERIFICATION_TIER_ORDER:
            return True
        if not meaningful_list(artifact.get("risk_tags")):
            return True
        if not meaningful_list(artifact.get("affected_surfaces")):
            return True
        if not meaningful_list(artifact.get("invariants")):
            return True
    return False


def stage_has_high_risk_artifact(artifacts: list[dict[str, object]]) -> bool:
    for artifact in artifacts:
        risk_level = artifact.get("risk_level")
        if artifact_has_changed_files(artifact) and isinstance(risk_level, str) and risk_level.lower() == "high":
            return True
    return False


def meaningful_scalar(value: object) -> str:
    if not isinstance(value, str):
        return ""
    stripped = value.strip()
    if not stripped or (stripped.startswith("<") and stripped.endswith(">")):
        return ""
    if stripped in PLACEHOLDERS:
        return ""
    return stripped


def check_child_acceptance_cleanup(artifacts: list[dict[str, object]]) -> None:
    failures: list[str] = []
    for artifact in artifacts:
        task_id = meaningful_scalar(artifact.get("task_id")) or "<unknown-task>"
        status = meaningful_scalar(artifact.get("status"))
        accepted = meaningful_scalar(artifact.get("accepted_by_orchestrator"))
        if status not in {"accepted", "merged"} and accepted != "yes":
            continue

        delivery_method = meaningful_scalar(artifact.get("delivery_method"))
        cleanup_status = meaningful_scalar(artifact.get("cleanup_status"))
        cleanup_notes = meaningful_scalar(artifact.get("cleanup_notes"))

        if delivery_method in {"", "not accepted"}:
            failures.append(f"{task_id}: accepted stream missing delivery_method")
        if accepted != "yes":
            failures.append(f"{task_id}: accepted stream missing accepted_by_orchestrator: yes")
        if cleanup_status not in {"cleaned", "blocked"}:
            failures.append(f"{task_id}: accepted stream cleanup_status must be cleaned or blocked")
        if not cleanup_notes:
            failures.append(f"{task_id}: accepted stream missing cleanup_notes")

    if not failures:
        print("child acceptance cleanup OK")
        return

    print("Accepted child streams require mini-closeout before stage close:", file=sys.stderr)
    for failure in failures:
        print(f"- {failure}", file=sys.stderr)
    raise SystemExit(1)


def resolve_review_state_path(repo_root: pathlib.Path, inbox: dict[str, object]) -> pathlib.Path:
    raw_path = inbox.get("review_state_file")
    if not isinstance(raw_path, str) or not raw_path:
        raise SystemExit("completion_inbox.review_state_file is required for blocking-review checks")
    path = pathlib.Path(raw_path)
    if inbox.get("scope", "repo_root") != "git_common_dir":
        return repo_root / path

    common_dir_raw = subprocess.check_output(
        ["git", "rev-parse", "--git-common-dir"], cwd=repo_root, text=True
    ).strip()
    common_dir = pathlib.Path(common_dir_raw)
    if not common_dir.is_absolute():
        common_dir = (repo_root / common_dir).resolve()
    return common_dir / path


def load_reviewed_state(path: pathlib.Path) -> dict[str, dict[str, object]]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"cannot read completion review state {path}: {exc}") from exc
    reviewed = payload.get("reviewed") if isinstance(payload, dict) else None
    if not isinstance(reviewed, dict):
        raise SystemExit(f"completion review state {path} is missing a reviewed object")
    if any(not isinstance(event_id, str) or not isinstance(entry, dict) for event_id, entry in reviewed.items()):
        raise SystemExit(f"completion review state {path} contains an invalid reviewed entry")
    return reviewed


@contextmanager
def review_state_read_lock(path: pathlib.Path):
    lock_path = path.with_name(f".{path.name}.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+", encoding="utf-8") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_SH)
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def unresolved_blocking_review_findings(
    reviewed: dict[str, dict[str, object]], stage_id: str | None = None
) -> list[str]:
    scoped = {
        event_id: entry
        for event_id, entry in reviewed.items()
        if stage_id is None or entry.get("stage_id") == stage_id
    }
    resolved: set[str] = set()
    for entry in scoped.values():
        if entry.get("decision") != "accepted":
            continue
        if entry.get("verify") != "passed" or not isinstance(entry.get("artifact_path"), str):
            continue
        links = entry.get("resolves_review")
        if isinstance(links, list):
            resolved.update(link for link in links if isinstance(link, str) and link)

    failures: list[str] = []
    for event_id, entry in scoped.items():
        severity = entry.get("severity")
        if severity not in {"P0", "P1"}:
            continue
        decision = entry.get("decision")
        if decision == "accepted":
            failures.append(f"{event_id}: P0/P1 finding cannot be accepted directly; record a linked correction")
        elif event_id not in resolved:
            failures.append(f"{event_id}: {severity} finding has no linked accepted correction")
    return failures


def check_blocking_review_findings(
    repo_root: pathlib.Path, contract: dict[str, object], stage_id: str | None = None
) -> None:
    limits = contract.get("stage_limits")
    if not isinstance(limits, dict) or limits.get("p0_p1_block_acceptance") is not True:
        return
    inbox = contract.get("completion_inbox")
    if not isinstance(inbox, dict):
        raise SystemExit("p0_p1_block_acceptance requires a [completion_inbox] section")
    state_path = resolve_review_state_path(repo_root, inbox)
    with review_state_read_lock(state_path):
        reviewed = load_reviewed_state(state_path)
    failures = unresolved_blocking_review_findings(reviewed, stage_id)
    if not failures:
        print("blocking review findings OK")
        return
    print("P0/P1 review findings must be fixed before stage acceptance:", file=sys.stderr)
    for failure in failures:
        print(f"- {failure}", file=sys.stderr)
    raise SystemExit(1)


def add_e2e_group_when_requested(
    groups: list[str],
    verification: dict[str, object],
    requested: bool,
) -> list[str]:
    if not requested:
        return groups

    commands = verification.get("e2e_commands")
    if not isinstance(commands, list) or not commands:
        print("E2E command is not configured (skipped)")
        return groups

    if "e2e_commands" not in groups:
        groups.append("e2e_commands")
    return groups


def run_shell(command: str, cwd: pathlib.Path, dry_run: bool) -> None:
    print(f"$ {command}")
    if dry_run:
        return
    subprocess.run(command, shell=True, cwd=cwd, executable="/bin/bash", check=True)


def git_available(repo_root: pathlib.Path) -> bool:
    return subprocess.run(
        ["git", "rev-parse", "--is-inside-work-tree"],
        cwd=repo_root,
        text=True,
        capture_output=True,
    ).returncode == 0


def git_diff_text(repo_root: pathlib.Path) -> str:
    result = subprocess.run(
        ["git", "diff", "--unified=0", "HEAD", "--", "."],
        cwd=repo_root,
        text=True,
        capture_output=True,
    )
    if result.returncode == 0:
        return result.stdout

    fallback = subprocess.run(
        ["git", "diff", "--unified=0", "--", "."],
        cwd=repo_root,
        text=True,
        capture_output=True,
    )
    return fallback.stdout if fallback.returncode == 0 else ""


def changed_line_debt_hits(repo_root: pathlib.Path) -> list[str]:
    if not git_available(repo_root):
        return []

    hits: list[str] = []
    current_file = "<unknown>"
    for line in git_diff_text(repo_root).splitlines():
        if line.startswith("+++ b/"):
            current_file = line.removeprefix("+++ b/")
            continue
        if not line.startswith("+") or line.startswith("+++"):
            continue
        content = line[1:].strip()
        if any(pattern in content for pattern in DEBT_POLICY_REFERENCE_PATTERNS):
            continue
        if DEBT_MARKER_PATTERN.search(content):
            hits.append(f"{current_file}: {content}")

    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"],
        cwd=repo_root,
        text=True,
        capture_output=True,
    )
    if untracked.returncode != 0:
        return hits

    for raw_path in untracked.stdout.splitlines():
        path = repo_root / raw_path
        if not path.is_file():
            continue
        try:
            for line_number, line in enumerate(path.read_text(errors="ignore").splitlines(), start=1):
                if any(pattern in line for pattern in DEBT_POLICY_REFERENCE_PATTERNS):
                    continue
                if DEBT_MARKER_PATTERN.search(line):
                    hits.append(f"{raw_path}:{line_number}: {line.strip()}")
        except OSError:
            continue

    return hits


def explicit_defers_body(repo_root: pathlib.Path, contract: dict[str, object]) -> str:
    handoff_path = repo_root / str(contract.get("handoff_file", ".codex/handoff.md"))
    if not handoff_path.exists():
        return ""

    match = re.search(
        r"^## Explicit defers\s*\n(?P<body>.*?)(?=^## |\Z)",
        handoff_path.read_text(),
        re.MULTILINE | re.DOTALL,
    )
    return match.group("body").strip() if match else ""


def git_changed_files(repo_root: pathlib.Path) -> list[str]:
    if not git_available(repo_root):
        return []

    changed: list[str] = []
    result = subprocess.run(
        ["git", "diff", "--name-only", "HEAD", "--", "."],
        cwd=repo_root,
        text=True,
        capture_output=True,
    )
    if result.returncode == 0:
        changed.extend(line.strip() for line in result.stdout.splitlines() if line.strip())

    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"],
        cwd=repo_root,
        text=True,
        capture_output=True,
    )
    if untracked.returncode == 0:
        changed.extend(line.strip() for line in untracked.stdout.splitlines() if line.strip())

    return sorted(set(changed))


def stage_summary_text(repo_root: pathlib.Path, stage_id: str) -> str:
    summary = repo_root / ".codex" / "stages" / stage_id / "summary.md"
    if not summary.exists():
        return ""
    return summary.read_text(errors="ignore")


def check_project_index_review(repo_root: pathlib.Path, contract: dict[str, object], stage_id: str) -> None:
    project_index_path = str(contract.get("project_index_file", ".codex/project-index.md"))
    changed = git_changed_files(repo_root)
    if not changed:
        print("project index review OK (no changed files)")
        return

    if project_index_path in changed:
        print("project index review OK (index updated)")
        return

    structural_changes = [
        path
        for path in changed
        if path in STRUCTURAL_CHANGE_FILES
        or any(path.startswith(prefix) for prefix in STRUCTURAL_CHANGE_PREFIXES)
    ]
    if not structural_changes:
        print("project index review OK (no structural changes detected)")
        return

    summary = stage_summary_text(repo_root, stage_id).lower()
    if PROJECT_INDEX_REVIEW_MARKER in summary:
        print("project index review OK (stage summary records no-change review)")
        return

    print("Structural changes require project index review before stage close:", file=sys.stderr)
    for path in structural_changes[:20]:
        print(f"- {path}", file=sys.stderr)
    if len(structural_changes) > 20:
        print(f"- ... {len(structural_changes) - 20} more", file=sys.stderr)
    print(
        f"Update {project_index_path} or add `{PROJECT_INDEX_REVIEW_MARKER}` to the stage summary with a brief reason.",
        file=sys.stderr,
    )
    raise SystemExit(1)


def documentation_impact(changed: list[str]) -> list[str]:
    if not changed:
        return ["none"]

    categories: set[str] = set()
    non_docs = [
        path
        for path in changed
        if not (
            path.endswith(".md")
            or path.startswith("docs/")
            or path.startswith(".codex/stages/")
            or path == ".codex/handoff.md"
        )
    ]
    if not non_docs:
        return ["docs-only"]

    if all(path.startswith("tests/") or "/tests/" in path or path.endswith((".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx", "_test.py")) for path in non_docs):
        categories.add("tests-only")

    structural = [
        path
        for path in non_docs
        if path in STRUCTURAL_CHANGE_FILES
        or any(path.startswith(prefix) for prefix in STRUCTURAL_CHANGE_PREFIXES)
    ]
    if structural:
        categories.add("structural")

    if any(path.startswith(("migrations/", "db/migrations/", "supabase/migrations/")) for path in non_docs):
        categories.add("migration")

    if any(
        path in {"Dockerfile", "docker-compose.yml", "docker-compose.dev.yml"}
        or path.startswith((".github/workflows/", "deploy/", "infra/", "ops/"))
        for path in non_docs
    ):
        categories.add("ops-deploy")

    if any(
        path.startswith(("api/", "src/api/", "src/server/", "packages/shared", "packages/shared-types"))
        or "contract" in path.lower()
        or "schema" in path.lower()
        for path in non_docs
    ):
        categories.add("api-contract")

    if not categories:
        categories.add("behavior")
    return sorted(categories)


def check_documentation_review(repo_root: pathlib.Path, stage_id: str) -> None:
    changed = git_changed_files(repo_root)
    if not changed:
        print("documentation review OK (no changed files)")
        return

    summary = stage_summary_text(repo_root, stage_id).lower()
    if DOCS_REVIEW_MARKER in summary:
        impact = ", ".join(documentation_impact(changed))
        print(f"documentation review OK ({impact})")
        return

    impact = documentation_impact(changed)
    print("Stage close requires a documentation review marker:", file=sys.stderr)
    print(f"- impact: {', '.join(impact)}", file=sys.stderr)
    print(
        "- add `docs-reviewed: updated - <what changed>` or "
        "`docs-reviewed: no-change-needed - <reason>` to the stage summary",
        file=sys.stderr,
    )
    print("- update stable docs first when the impact changes navigation, contracts, ops, migrations, integrations, or durable behavior", file=sys.stderr)
    raise SystemExit(1)


def has_tracked_defer(body: str) -> bool:
    normalized = body.strip().lower()
    if not normalized or normalized in {"none", "- none"}:
        return False
    return re.search(r"\b(bd|bead|beads|task|tracked)\b", normalized) is not None


def check_debt_markers(repo_root: pathlib.Path, contract: dict[str, object]) -> None:
    debt_scan = contract.get("debt_scan", {})
    if isinstance(debt_scan, dict) and debt_scan.get("enabled") is False:
        print("debt marker scan skipped (debt_scan.enabled = false)")
        return

    hits = changed_line_debt_hits(repo_root)
    if not hits:
        print("debt marker scan OK")
        return

    defer_body = explicit_defers_body(repo_root, contract)
    if has_tracked_defer(defer_body):
        print("debt marker scan OK (tracked defer recorded)")
        return

    print("Changed-line debt markers require action before stage close:", file=sys.stderr)
    for hit in hits[:20]:
        print(f"- {hit}", file=sys.stderr)
    if len(hits) > 20:
        print(f"- ... {len(hits) - 20} more", file=sys.stderr)
    print(
        "Fix the marker or create/update a Beads task and list the defer under ## Explicit defers.",
        file=sys.stderr,
    )
    raise SystemExit(1)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", required=True, dest="stage_id")
    parser.add_argument("--verify-group", action="append", default=[])
    parser.add_argument("--include-optional", action="store_true")
    parser.add_argument("--include-e2e", action="store_true")
    parser.add_argument("--skip-process-check", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv[1:])

    repo_root = pathlib.Path.cwd()
    contract = tomllib.loads((repo_root / ".codex" / "orchestrator.toml").read_text())
    artifacts = load_stage_artifacts(repo_root, args.stage_id)
    verification = contract.get("verification", {})
    if not isinstance(verification, dict):
        verification = {}

    explicit_groups = bool(args.verify_group)
    _, legacy_artifacts = split_adaptive_artifacts(artifacts)
    groups = list(args.verify_group) if explicit_groups else infer_groups(contract, artifacts, args.include_optional)
    if not groups and "stage_close_commands" in verification:
        groups = ["stage_close_commands"]
    groups = add_e2e_group_when_requested(
        groups,
        verification,
        requested=args.include_e2e
        or (not explicit_groups and stage_has_high_risk_artifact(legacy_artifacts)),
    )

    check_blocking_review_findings(repo_root, contract, args.stage_id)
    check_child_acceptance_cleanup(artifacts)
    check_project_index_review(repo_root, contract, args.stage_id)
    check_documentation_review(repo_root, args.stage_id)
    check_debt_markers(repo_root, contract)

    for group in groups:
        commands = verification.get(group)
        if not isinstance(commands, list) or not commands:
            raise SystemExit(f"Verification group {group!r} is missing, empty, or not a list")
        print(f"== verification group: {group} ==")
        for command in commands:
            run_shell(str(command), repo_root, args.dry_run)

    if not args.skip_process_check:
        enforcement = contract.get("enforcement", {})
        if not isinstance(enforcement, dict):
            enforcement = {}
        entrypoint = enforcement.get("process_verification_entrypoint", "scripts/orchestration/run_process_verification.sh")
        if not isinstance(entrypoint, str) or not entrypoint:
            raise SystemExit("Missing process_verification_entrypoint")
        cmd = [str(repo_root / entrypoint), "--stage", args.stage_id]
        print("$ " + " ".join(cmd))
        if not args.dry_run:
            subprocess.run(cmd, cwd=repo_root, check=True)

    check_blocking_review_findings(repo_root, contract, args.stage_id)
    print("stage closeout verification OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
