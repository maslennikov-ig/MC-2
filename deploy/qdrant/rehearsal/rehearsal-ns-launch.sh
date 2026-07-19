#!/usr/bin/env bash
# Q12 R8 SERVER CUSTODY REHEARSAL — private-mount-namespace trust bridge launcher
# (driver deliverable ii).
#
# Implements the RATIFIED trust bridge (blueprint point 1, variant (c)): a PRIVATE
# MOUNT NAMESPACE, NOT system-wide binds (the /etc/hosts pooler-redirect would hit
# PROD services), NOT bwrap. One physical /opt run root, dual-viewed:
#
#   sudo unshare -m /bin/sh -c '
#     mount --bind "$0" /etc/hosts          # fakehosts: pooler-host -> 127.0.0.1 (NS-private)
#     mount --bind "$1" "$2"                # /opt/.../q12/<id>  ->  <trust>/backups/q12/<id>
#     shift 3
#     exec setpriv --reuid=1000 --regid=1000 --init-groups "$@"   # run_live as claude-deploy
#   ' "$FAKEHOSTS" "$RUN_ROOT" "$TRUST_VIEW" <run_live argv...>
#
# Both binds are private to the namespace (nothing leaks; umount is automatic on ns
# exit — belt-and-suspenders trap-umount too). <trust> is a real mkdtemp
# /tmp/mc2-q12-barrier-XXXX owned uid-1000 0700 (barrier :94-98). run_claim keeps the
# /opt custody argv verbatim (:2929); the barrier child's own argv resolves through the
# /tmp trust view (:215) — one physical dir => the #15 same-inode invariant. The barrier
# child runs as claude-deploy uid 1000 (run_claim ProductionExecutor).
#
# PRIVILEGED PATH IS ORCHESTRATOR/SERVER-ONLY: `sudo unshare -m ... setpriv` needs root
# and touches the REAL /opt run root, so it runs ONLY on megacampus-prod under the
# orchestrator. Workers/agents run ONLY `--dry-run`, which builds + validates the
# non-privileged scaffolding (trust root, fakehosts, run-id, argv) and PRINTS the exact
# command WITHOUT any sudo/unshare/mount/prod action.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/qdrant/rehearsal/rehearsal-lib.sh
source "$HERE/rehearsal-lib.sh"

usage() {
  cat >&2 <<'USAGE'
Usage: rehearsal-ns-launch.sh --run-id UUID --run-root /opt/megacampus/backups/q12/UUID
         [--reuid 1000] [--regid 1000] [--dry-run] -- <run_live command and args...>

  --run-id     RFC 4122 UUIDv4 (barrier :72 regex).
  --run-root   the SINGLE physical /opt custody run root to dual-view.
  --reuid      target uid for setpriv (default 1000, claude-deploy).
  --regid      target gid for setpriv (default 1000).
  --dry-run    build + validate scaffolding and print the command; NO sudo/unshare/prod.
  --           everything after is the run_live invocation (execed under setpriv).
USAGE
}

run_id=''
run_root=''
reuid=1000
regid=1000
dry_run=0
launch_argv=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run-id) run_id="$2"; shift 2 ;;
    --run-root) run_root="$2"; shift 2 ;;
    --reuid) reuid="$2"; shift 2 ;;
    --regid) regid="$2"; shift 2 ;;
    --dry-run) dry_run=1; shift ;;
    --) shift; launch_argv=("$@"); break ;;
    -h|--help) usage; exit 0 ;;
    *) usage; rehearsal_die "unknown argument: $1" ;;
  esac
done

[[ -n $run_id ]] || { usage; rehearsal_die "--run-id is required"; }
[[ -n $run_root ]] || { usage; rehearsal_die "--run-root is required"; }
[[ ${#launch_argv[@]} -gt 0 ]] || { usage; rehearsal_die "a run_live argv is required after --"; }
[[ $reuid =~ ^[0-9]+$ ]] || rehearsal_die "--reuid must be numeric"
[[ $regid =~ ^[0-9]+$ ]] || rehearsal_die "--regid must be numeric"
rehearsal_validate_run_id "$run_id"

# On the server the physical custody root is the verbatim /opt path; in --dry-run we
# accept any existing dir so the non-privileged scaffolding can be validated locally.
if [[ $dry_run -eq 0 ]]; then
  [[ $run_root == /opt/megacampus/backups/q12/$run_id ]] ||
    rehearsal_die "prod run-root must be /opt/megacampus/backups/q12/$run_id (got $run_root)"
fi

trust_root="$(rehearsal_make_trust_root)"
trust_view="$trust_root/backups/q12/$run_id"
mkdir -p "$trust_view"
chmod 0700 "$trust_root" "$trust_root/backups" "$trust_root/backups/q12" "$trust_view"

fakehosts="$trust_root/fakehosts"
printf '127.0.0.1 localhost %s\n::1 localhost ip6-localhost ip6-loopback\n' \
  "$REHEARSAL_POOLER_HOST" > "$fakehosts"
chmod 0644 "$fakehosts"

# umount-before-rmdir belt (ns exit already unmounts the private binds).
trap 'rehearsal_teardown "$trust_root" "" ""' EXIT

# The ratified command (array form; the inner sh -c is the blueprint's literal shape).
inner='mount --bind "$0" /etc/hosts; mount --bind "$1" "$2"; shift 3; exec setpriv --reuid='"$reuid"' --regid='"$regid"' --init-groups "$@"'
command=(sudo unshare -m /bin/sh -c "$inner" "$fakehosts" "$run_root" "$trust_view" "${launch_argv[@]}")

if [[ $dry_run -eq 1 ]]; then
  rehearsal_log "DRY-RUN: scaffolding built, NO sudo/unshare/mount/prod action taken."
  rehearsal_log "trust_root=$trust_root (uid-owned 0700)"
  rehearsal_log "trust_view=$trust_view  <= dual-view of  $run_root"
  rehearsal_log "fakehosts -> $REHEARSAL_POOLER_HOST 127.0.0.1"
  # Plain (unescaped) view of the private-mount-namespace script for review/grep.
  rehearsal_log "ns-script: sudo unshare -m /bin/sh -c { $inner }"
  # Emit the exact argv the orchestrator's server run would execute (%q, copy-pasteable).
  printf 'WOULD-RUN:'
  printf ' %q' "${command[@]}"
  printf '\n'
  exit 0
fi

# --- privileged path: orchestrator/server only ---
[[ $run_root == /opt/megacampus/backups/q12/$run_id ]] ||
  rehearsal_die "refusing privileged ns-launch outside the /opt custody root"
rehearsal_log "launching run_live inside a private mount namespace (real /opt custody)"
exec "${command[@]}"
