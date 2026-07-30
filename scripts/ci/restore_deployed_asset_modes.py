#!/usr/bin/env python3
"""mc2-o0g75 — put the Q12 asset modes back after an ordinary deploy's scp.

`deploy/qdrant/**` is deployed read-only (0444, or 0555 where the file is executable). scp cannot
overwrite a read-only file, so the deploy job now makes the tree writable first — and this restores
the modes afterwards, from the same tracked manifest that the window pre-flight's H2 probe checks
against. Without it an ordinary deploy would silently leave the tree world-writable-ish and H2 would
start failing on mode drift instead of on something real.

Only modes are restored, never ownership: scp writes as the deploy user, which already owns the
tree, and changing owner would need privileges this step deliberately does not have. Paths outside
the deploy root, and manifest entries with no `mode`, are skipped — CI-delivered assets carry
`"mode": null` precisely because scp rewrites their identity on every deploy.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys

MANIFEST_RELATIVE = "deploy/qdrant/q12-deployed-asset-manifest.json"
EXPECTED_SCHEMA = "megacampus.q12.deployed-asset-manifest/v1"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--deploy-root", required=True)
    arguments = parser.parse_args()

    root = pathlib.Path(arguments.deploy_root).resolve()
    manifest_path = root / MANIFEST_RELATIVE
    if not manifest_path.is_file():
        print(f"asset manifest is absent, nothing to restore: {manifest_path}")
        return 0

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema_version") != EXPECTED_SCHEMA:
        print(f"unexpected asset manifest schema: {manifest.get('schema_version')}", file=sys.stderr)
        return 1

    restored, skipped = 0, 0
    for asset in manifest.get("assets", []):
        mode = asset.get("mode")
        relative = asset.get("path")
        if not mode or not relative:
            skipped += 1
            continue
        target = (root / relative).resolve()
        # Never follow a path out of the deploy root, and never chmod through a symlink.
        if root not in target.parents or not target.is_file() or target.is_symlink():
            skipped += 1
            continue
        desired = int(mode, 8)
        if (target.stat().st_mode & 0o7777) == desired:
            continue
        try:
            os.chmod(target, desired)
        except PermissionError:
            # The root-owned Q12 launcher and its payload are not copied by an ordinary deploy and
            # are not this step's to touch. Anything else that lands here is a real surprise, so it
            # is counted and named rather than swallowed.
            print(f"not ours to chmod, left alone: {relative}")
            skipped += 1
            continue
        restored += 1

    print(f"deployed asset modes restored: {restored} changed, {skipped} skipped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
