#!/usr/bin/python3
"""mc2-lzft4 — proves the deployed-asset manifest takes its identity from the consuming script.

Window attempt #10 burned its run-id at C2 because the manifest declared
``q12-writer-resume.py`` mode 0444 (derived from the git executable bit) while
``source-recovery-run.sh`` refuses anything but exactly root:root 0644. Probe H2 asserts against
the manifest, so it certified a host the wrapper rejects.

Infra-free: loads the real pre-flight module and exercises the emitter's guards. No database, no
docker, no host. Prints one JSON object to stdout.
"""

from __future__ import annotations

import importlib.util
import json
import pathlib
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[5]
PREFLIGHT = REPO / "deploy/qdrant/q12-window-preflight.py"


def load(name: str, path: pathlib.Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


preflight = load("q12_window_preflight", PREFLIGHT)

out: "dict[str, object]" = {}

# 1. Every pin is live: the consumer still carries the exact assertion the pin was derived from,
#    and the pinned mode/owner is the one that assertion demands.
pins = []
for relative, required in preflight.CONSUMER_REQUIRED_IDENTITY.items():
    consumer = REPO / required["asserted_by"]
    text = consumer.read_text(encoding="utf-8")
    pins.append(
        {
            "path": relative,
            "assertion_present": required["assertion"] in text,
            "identity": f"{required['owner']}:{required['group']}:{required['mode']}",
            # The shell compares `stat -c '%u:%g:%a'`, so the literal is numeric and unpadded.
            "assertion_literal": required["assertion"].rsplit("== ", 1)[-1].strip("'"),
        }
    )
out["pins"] = pins

# 2. The emitter fails CLOSED when the consumer stops carrying the assertion — the drift that
#    let 0444 and 0644 diverge silently for two days.
with tempfile.TemporaryDirectory() as raw:
    fake_repo = pathlib.Path(raw)
    for relative, required in preflight.CONSUMER_REQUIRED_IDENTITY.items():
        consumer = fake_repo / required["asserted_by"]
        consumer.parent.mkdir(parents=True, exist_ok=True)
        consumer.write_text("#!/usr/bin/env bash\n# the assertion was removed\n", encoding="utf-8")
    try:
        preflight.assert_consumer_identity_assertions(fake_repo)
        out["drifted_consumer"] = {"raised": False, "message": ""}
    except preflight.PreflightError as error:
        out["drifted_consumer"] = {"raised": True, "message": str(error)}

# 3. And it fails closed when a pinned asset is not in the manifest asset set at all, which is how
#    a rename would silently drop the assertion off the host.
original = dict(preflight.CONSUMER_REQUIRED_IDENTITY)
try:
    preflight.CONSUMER_REQUIRED_IDENTITY["deploy/qdrant/q12-renamed-away.py"] = dict(
        original["deploy/qdrant/q12-writer-resume.py"]
    )
    try:
        preflight.build_asset_manifest(REPO)
        out["unpinned_asset"] = {"raised": False, "message": ""}
    except preflight.PreflightError as error:
        out["unpinned_asset"] = {"raised": True, "message": str(error)}
finally:
    preflight.CONSUMER_REQUIRED_IDENTITY.clear()
    preflight.CONSUMER_REQUIRED_IDENTITY.update(original)

# 4. The tracked manifest agrees with a fresh emission for every pinned path.
tracked = json.loads(
    (REPO / "deploy/qdrant/q12-deployed-asset-manifest.json").read_text(encoding="utf-8")
)
emitted = preflight.build_asset_manifest(REPO)
by_path = {str(asset["path"]): asset for asset in tracked["assets"]}
emitted_by_path = {str(asset["path"]): asset for asset in emitted["assets"]}
agreement = []
for relative, required in preflight.CONSUMER_REQUIRED_IDENTITY.items():
    tracked_asset = by_path.get(relative, {})
    emitted_asset = emitted_by_path.get(relative, {})
    agreement.append(
        {
            "path": relative,
            "tracked": f"{tracked_asset.get('owner')}:{tracked_asset.get('group')}:"
            f"{tracked_asset.get('mode')}",
            "emitted": f"{emitted_asset.get('owner')}:{emitted_asset.get('group')}:"
            f"{emitted_asset.get('mode')}",
            "required": f"{required['owner']}:{required['group']}:{required['mode']}",
        }
    )
out["agreement"] = agreement

json.dump(out, sys.stdout, indent=None, sort_keys=True)
