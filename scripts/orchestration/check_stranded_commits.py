#!/usr/bin/env python3
"""Report commits that live only on a side branch and never reached the delivery branch.

Why this exists: on 2026-07-27 a branch audit found three finished, reviewed, bead-closed
pieces of work that had never been delivered (mc2-jc275, mc2-v31gc, mc2-sjpbx). Each was
committed inside a worktree parked on a non-delivery branch. Bead status records intent,
not delivery, so nothing detected the gap for weeks.

Detection cannot rely on sha, tree or patch-id: most work here is delivered by cherry-pick
or squash, which changes all three. Commit SUBJECT containment is what separates "delivered
under a different sha" from "never delivered", so that is the signal used, with a small set
of bookkeeping subjects and all merge commits treated as noise.

Read-only: no fetch, no ref mutation. Exit 0 clean, 1 stranded commits found, 2 usage error.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

DEFAULT_IGNORED_SUBJECTS = (r"^bd sync:", r"^chore\(beads\)")
DEFAULT_ALLOWLIST = ".codex/stranded-commit-allowlist.txt"
UNIT_SEPARATOR = "\x1f"
SUBJECT_RULE_PREFIX = "subject:"
SKIPPED_REF_NAMES = frozenset({"origin"})
SHORT_SHA_WIDTH = 9


class CheckError(Exception):
    """Usage or environment problem that must not be reported as a clean result."""


@dataclass(frozen=True)
class StrandedCommit:
    sha: str
    subject: str
    date: str


@dataclass(frozen=True)
class Finding:
    ref: str
    commits: tuple[StrandedCommit, ...]


@dataclass(frozen=True)
class Allowed:
    ref: str
    reason: str


def git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise CheckError(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout


def resolve_target(repo: Path, target: str) -> str:
    for candidate in (target, f"origin/{target}"):
        probe = subprocess.run(
            ["git", "-C", str(repo), "rev-parse", "--verify", "--quiet", candidate],
            capture_output=True,
            text=True,
            check=False,
        )
        if probe.returncode == 0:
            return candidate
    raise CheckError(
        f"delivery branch {target!r} does not exist in {repo} (tried {target!r} and "
        f"'origin/{target}'); pass --target explicitly"
    )


def load_allowlist(path: Path | None) -> tuple[list[tuple[str, str]], list[str]]:
    """Return (branch patterns with reasons, extra ignored-subject regexes).

    A line is either `<branch-glob><TAB><reason>` or `subject:<regex><TAB><reason>`. The second
    form exists for content-free commits that sit on many branches at once, such as an empty
    CI trigger: allowlisting ten branches to silence one such commit would hide real work.
    """
    if path is None or not path.is_file():
        return [], []
    entries: list[tuple[str, str]] = []
    subject_patterns: list[str] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        pattern, _, reason = line.partition("\t")
        if not reason:
            pattern, _, reason = line.partition("  ")
        pattern = pattern.strip()
        if pattern.startswith(SUBJECT_RULE_PREFIX):
            subject_patterns.append(pattern[len(SUBJECT_RULE_PREFIX) :].strip())
            continue
        entries.append((pattern, reason.strip() or "no reason recorded"))
    return entries, subject_patterns


def match_allowlist(ref: str, entries: list[tuple[str, str]]) -> str | None:
    bare = ref[len("origin/") :] if ref.startswith("origin/") else ref
    for pattern, reason in entries:
        if fnmatch.fnmatch(ref, pattern) or fnmatch.fnmatch(bare, pattern):
            return reason
    return None


def candidate_refs(repo: Path, target: str) -> list[str]:
    listing = git(repo, "for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes")
    bare_target = target[len("origin/") :] if target.startswith("origin/") else target
    excluded = {target, bare_target, f"origin/{bare_target}"}
    refs: list[str] = []
    for name in listing.splitlines():
        ref = name.strip()
        if not ref or ref in excluded or ref in SKIPPED_REF_NAMES:
            continue
        if ref.endswith("/HEAD") or "__dolt" in ref:
            continue
        refs.append(ref)
    return refs


def is_ancestor(repo: Path, ref: str, target: str) -> bool:
    probe = subprocess.run(
        ["git", "-C", str(repo), "merge-base", "--is-ancestor", ref, target],
        capture_output=True,
        text=True,
        check=False,
    )
    return probe.returncode == 0


def delivered_subjects(repo: Path, target: str) -> set[str]:
    return {line for line in git(repo, "log", "--format=%s", target).splitlines()}


def was_delivered(subject: str, delivered: set[str]) -> bool:
    """True when the target already carries this commit, possibly under an annotated subject.

    Recovered work is normally re-delivered with the bead id appended — `fix(x): y` becomes
    `fix(x): y (mc2-abc12)`. Exact matching alone would keep flagging the source branch after
    the work landed, and a report that cries wolf gets ignored. Only a trailing parenthesised
    or bracketed annotation counts, so unrelated commits that merely share a prefix still show.
    """
    if subject in delivered:
        return True
    for candidate in delivered:
        if not candidate.startswith(subject) or len(candidate) == len(subject):
            continue
        if candidate[len(subject) :].lstrip().startswith(("(", "[")):
            return True
    return False


def stranded_on(
    repo: Path,
    ref: str,
    target: str,
    delivered: set[str],
    ignored: list[re.Pattern[str]],
) -> tuple[StrandedCommit, ...]:
    listing = git(
        repo,
        "log",
        "--no-merges",
        # %H, sliced below: git's own abbreviation length varies with repository size, and a
        # report that changes width between repositories is a bad machine contract.
        f"--format=%H{UNIT_SEPARATOR}%cs{UNIT_SEPARATOR}%s",
        f"{target}..{ref}",
    )
    commits: list[StrandedCommit] = []
    for line in listing.splitlines():
        sha, _, rest = line.partition(UNIT_SEPARATOR)
        date, _, subject = rest.partition(UNIT_SEPARATOR)
        if not sha or was_delivered(subject, delivered):
            continue
        if any(pattern.search(subject) for pattern in ignored):
            continue
        commits.append(StrandedCommit(sha=sha[:SHORT_SHA_WIDTH], subject=subject, date=date))
    return tuple(commits)


def audit(
    repo: Path,
    target_arg: str,
    allowlist_path: Path | None,
    ignore_patterns: list[str],
) -> tuple[list[Finding], list[Allowed], str, int]:
    target = resolve_target(repo, target_arg)
    entries, subject_rules = load_allowlist(allowlist_path)
    ignored = [re.compile(pattern) for pattern in [*ignore_patterns, *subject_rules]]
    delivered = delivered_subjects(repo, target)

    findings: list[Finding] = []
    allowed: list[Allowed] = []
    checked = 0
    for ref in candidate_refs(repo, target):
        if is_ancestor(repo, ref, target):
            continue
        reason = match_allowlist(ref, entries)
        if reason is not None:
            allowed.append(Allowed(ref=ref, reason=reason))
            continue
        checked += 1
        commits = stranded_on(repo, ref, target, delivered, ignored)
        if commits:
            findings.append(Finding(ref=ref, commits=commits))
    findings.sort(key=lambda finding: finding.ref)
    allowed.sort(key=lambda entry: entry.ref)
    return findings, allowed, target, checked


def render_human(findings: list[Finding], allowed: list[Allowed], target: str, checked: int) -> str:
    lines: list[str] = []
    if not findings:
        lines.append(f"stranded-commit check OK: nothing missing from {target} ({checked} refs scanned)")
        for entry in allowed:
            lines.append(f"  allowlisted: {entry.ref} - {entry.reason}")
        return "\n".join(lines) + "\n"
    total = sum(len(finding.commits) for finding in findings)
    lines.append(f"stranded-commit check FAILED: {total} commit(s) never reached {target}")
    for finding in findings:
        lines.append(f"  {finding.ref}")
        for entry in finding.commits:
            lines.append(f"    {entry.sha} {entry.date} {entry.subject}")
    for entry in allowed:
        lines.append(f"  allowlisted: {entry.ref} - {entry.reason}")
    lines.append("")
    lines.append(
        f"Deliver the work, or record the branch in {DEFAULT_ALLOWLIST} with the reason it is parked."
    )
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=".", help="repository to audit (default: cwd)")
    parser.add_argument("--target", default="develop", help="delivery branch (default: develop)")
    parser.add_argument("--allowlist", default=None, help=f"allowlist file (default: {DEFAULT_ALLOWLIST})")
    parser.add_argument(
        "--ignore-subject",
        action="append",
        default=None,
        help="regex of bookkeeping subjects to ignore; repeatable",
    )
    parser.add_argument("--json", action="store_true", help="emit a machine-readable report")
    args = parser.parse_args(argv)

    repo = Path(args.repo).resolve()
    allowlist_path = Path(args.allowlist) if args.allowlist else repo / DEFAULT_ALLOWLIST
    ignore_patterns = args.ignore_subject if args.ignore_subject else list(DEFAULT_IGNORED_SUBJECTS)

    try:
        findings, allowed, target, checked = audit(repo, args.target, allowlist_path, ignore_patterns)
    except CheckError as error:
        print(str(error), file=sys.stderr)
        return 2

    if args.json:
        print(
            json.dumps(
                {
                    "target": target,
                    "checked": checked,
                    "stranded": [
                        {
                            "ref": finding.ref,
                            "commits": [
                                {"sha": entry.sha, "subject": entry.subject}
                                for entry in finding.commits
                            ],
                        }
                        for finding in findings
                    ],
                    "allowlisted": [
                        {"ref": entry.ref, "reason": entry.reason} for entry in allowed
                    ],
                },
                indent=2,
                sort_keys=True,
            )
        )
    else:
        sys.stdout.write(render_human(findings, allowed, target, checked))

    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
