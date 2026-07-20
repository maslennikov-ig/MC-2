#!/usr/bin/env bash
# Q12 R8 SERVER CUSTODY REHEARSAL — shared driver library.
#
# Sourced by every rehearsal-*.sh entrypoint. Provides bounded, secret-safe
# logging, run-id (UUIDv4) minting + validation, the ratified constants, and a
# teardown trap helper that UMOUNTS BEFORE rmdir (blueprint knob 5 / point 1).
#
# This library performs NO privileged action and NO /opt or prod mutation by
# itself; the entrypoints decide when (and only the orchestrator's server run
# ever crosses into sudo/unshare/setpriv against the real /opt).
#
# NOTHING here logs a secret value: db-url / capability bytes are handled
# stdin-only by the barrier and never echoed.
set -euo pipefail

# --- ratified identity constants (must match the frozen barrier + fusion harness) ---
readonly REHEARSAL_POOLER_HOST='aws-1-us-east-2.pooler.supabase.com'
readonly REHEARSAL_POOLER_USER='postgres.diqooqbuchsliypgwksu'
readonly REHEARSAL_IMAGE='postgres:17.10-bookworm'
readonly REHEARSAL_TRUST_PREFIX='mc2-q12-barrier-'      # mkdtemp prefix, uid-1000 0700
readonly REHEARSAL_CONTAINER_PREFIX='mc2-q12-rehearsal-'
# barrier :72 run-id regex (UUIDv4, RFC 4122 variant) — the run_id MUST match this.
readonly REHEARSAL_RUN_ID_RE='^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'

readonly REHEARSAL_DOCKER="${MC2_Q12_REHEARSAL_DOCKER:-/usr/bin/docker}"

rehearsal_log()  { printf '[rehearsal] %s\n' "$*" >&2; }
rehearsal_warn() { printf '[rehearsal][warn] %s\n' "$*" >&2; }
rehearsal_die()  { printf '[rehearsal][fatal] %s\n' "$*" >&2; exit 1; }

# Mint a real UUIDv4 (barrier :72). Prefers the kernel RNG; falls back to python.
rehearsal_new_run_id() {
  if [[ -r /proc/sys/kernel/random/uuid ]]; then
    cat /proc/sys/kernel/random/uuid
  else
    python3 -c 'import uuid;print(uuid.uuid4())'
  fi
}

rehearsal_validate_run_id() {
  local run_id="$1"
  [[ $run_id =~ $REHEARSAL_RUN_ID_RE ]] ||
    rehearsal_die "run-id '$run_id' is not a RFC 4122 UUIDv4 (barrier :72 regex)"
}

# Make a uid-1000-owned 0700 trust root (barrier :94-98). Echoes the path.
#
# found-defect #22: `mktemp` under `sudo` creates the dir root:root, and `chmod 0700` then makes it
# root-only — so a subsequent `setpriv --reuid=1000` child cannot even TRAVERSE it (the first real
# privileged server probe run hit "Permission denied" reading the payload), and it defeats the
# barrier :96 stat gate (running uid MUST == trust-root owner). Fix: when PRIVILEGED (EUID==0), chown
# the root to the target uid:gid. GUARDED to EUID==0 so the local non-root --dry-run / worker callers
# do NOT attempt a chown they cannot perform. reuid/regid come from the caller's scope (the probe +
# ns-launch set them), defaulting to 1000:1000.
rehearsal_make_trust_root() {
  local root
  root="$(mktemp -d "/tmp/${REHEARSAL_TRUST_PREFIX}XXXXXXXX")"
  chmod 0700 "$root"
  if [[ $(id -u) -eq 0 ]]; then
    chown "${reuid:-1000}:${regid:-1000}" "$root"
  fi
  printf '%s\n' "$root"
}

# Teardown trap helper: umount every bind under a trust root BEFORE rmdir, then
# remove containers/proxies. The run root is RETAINED for post-mortem (knob 5).
# Usage: rehearsal_teardown "<trust_root>" "<container_id>" ["<proxy_pid>"]
rehearsal_teardown() {
  local trust_root="${1:-}" container="${2:-}" proxy_pid="${3:-}"
  if [[ -n $proxy_pid ]]; then
    kill "$proxy_pid" 2>/dev/null || true
  fi
  if [[ -n $trust_root && -d $trust_root ]]; then
    # umount-before-rmdir: reverse-sort so children unmount before parents.
    local mp
    while read -r mp; do
      [[ -n $mp ]] || continue
      umount "$mp" 2>/dev/null || umount -l "$mp" 2>/dev/null || true
    done < <(awk -v r="$trust_root" '$2 ~ ("^" r) {print $2}' /proc/self/mountinfo 2>/dev/null \
             | sort -r)
    rmdir "$trust_root"/backups/q12/* 2>/dev/null || true
    rm -rf "$trust_root" 2>/dev/null || true
  fi
  if [[ -n $container ]]; then
    "$REHEARSAL_DOCKER" rm -f "$container" >/dev/null 2>&1 || true
  fi
}

# Assert zero leftover rehearsal residue (teardown proof, verify script also checks).
# Echoes the leftover counts; returns non-zero if any residue remains.
rehearsal_assert_no_residue() {
  local mounts containers rc=0
  mounts="$(awk '$2 ~ /mc2-q12-barrier-/ {print $2}' /proc/self/mountinfo 2>/dev/null | wc -l)"
  containers="$("$REHEARSAL_DOCKER" ps -a --filter "name=${REHEARSAL_CONTAINER_PREFIX}" \
                --format '{{.Names}}' 2>/dev/null | wc -l)"
  rehearsal_log "residue: trust-root binds=$mounts rehearsal-containers=$containers"
  [[ $mounts -eq 0 ]] || rc=1
  [[ $containers -eq 0 ]] || rc=1
  return $rc
}
