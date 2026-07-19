#!/usr/bin/env bash
# Q12 R8 SERVER CUSTODY REHEARSAL — BOUNDED SERVER-MECHANICS PROBES (driver deliverable v).
#
# Owner ruling 2026-07-19 (found-defect #21): the full-path `run_live` server rehearsal is
# re-scoped. A disposable-container rehearsal is forced into the barrier's CA-only test mode,
# which the barrier's :215 string-check makes reachable ONLY through the fusion harness's bespoke
# executor argv-rewrite (`_rewrite_opt_to_trust`) — the stock `q12-live-cutover.sh live` /
# ProductionExecutor path the real window runs does NOT do that rewrite, so a stock-CLI privileged
# run fails closed at the first barrier leg. The green LOCAL fusion already proved the run_live
# window (real barrier + real container + real cleanup + seam + recovery) under bwrap; the
# stock-CLI+prod-CA window entrypoint is validated IN-WINDOW (first real cutover) under the
# rollback-abort safety (found-defect #18). See the plan-log R8 re-scope + design §6b.6 #21 note.
#
# So the server run validates ONLY the genuinely server-new privileged MECHANICS that bwrap could
# only SIMULATE locally — real root / real /opt fs / real `unshare -m` / real `setpriv` uid-1000:
#
#   trust-bridge : the #15 dual-bind at real privilege — mount --bind a THROWAWAY
#                  /opt/megacampus/backups/q12/<probe-uuid> into a real /tmp/mc2-q12-barrier-XXXX
#                  trust view, setpriv to uid-1000, then assert a file written via the /opt view is
#                  byte-identical AND the SAME st_dev/st_ino via the /tmp trust view (both
#                  directions), the fakehosts /etc/hosts bind redirects the pooler host to
#                  127.0.0.1 INSIDE the ns (and is absent on the host after ns exit), and euid==1000.
#   lease        : the canonical FD-8/9 custody under REAL setpriv (not bwrap) — FD-9 exclusive
#                  flock on cutover.lock (O_NOFOLLOW), FD-8 journal, both inherited across a child
#                  exec, a second flock blocked, a durable append.
#   uid          : the barrier :96 stat gate — a uid-1000-owned 0700 trust root, setpriv drops to
#                  uid-1000, euid==owner==1000 and mode 0700 hold.
#
# ALL probe ids are throwaway UUIDv4s; NO container, NO run_live, NO writers, NO real cutover, NO
# prod DB. Each probe is self-contained with idempotent umount-before-rmdir teardown.
#
# PRIVILEGED PATH IS ORCHESTRATOR/SERVER-ONLY (`sudo unshare -m … setpriv` needs root + touches the
# real /opt). Workers/agents run ONLY `--dry-run` (build+print the exact command, no privilege) or
# `--emit-payload` (print a probe's inner assertion script for local logic tests). Neither touches
# sudo/unshare/mount/prod.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/qdrant/rehearsal/rehearsal-lib.sh
source "$HERE/rehearsal-lib.sh"

usage() {
  cat >&2 <<'USAGE'
Usage: rehearsal-probe.sh --probe trust-bridge|lease|uid|all [--run-id UUID]
         [--reuid 1000] [--regid 1000] [--dry-run]
       rehearsal-probe.sh --emit-payload trust-bridge|lease|uid

  --probe         which server-mechanics probe(s) to build/run (`all` = the three).
  --run-id        RFC 4122 UUIDv4 (barrier :72); a throwaway one is minted if omitted.
  --reuid/--regid target uid/gid for setpriv (default 1000, claude-deploy).
  --dry-run       build + print the exact privileged command; NO sudo/unshare/mount/prod.
  --emit-payload  print a probe's inner assertion payload (for local logic tests); no privilege.
USAGE
}

# ------------------------------------------------------------------------------------------------ #
# Inner assertion payloads. Each is emittable (`--emit-payload`) so its LOGIC is unit-tested with
# supplied paths (the real unshare/mount/setpriv is the server's job); the privileged path below
# execs the SAME payload under real setpriv.
# ------------------------------------------------------------------------------------------------ #

# trust-bridge payload — args: $1=OPTVIEW $2=TRUSTVIEW $3=HOSTS $4=EXPECT_UID $5=POOLER_HOST.
payload_trust_bridge() {
  cat <<'PAYLOAD'
set -eu
optview="$1"; trustview="$2"; hosts="$3"; expect_uid="$4"; pooler="$5"
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 3; }
# 1. write via the /opt view, read via the /tmp trust view -> byte identical.
canary_a="canary-opt-$$-${RANDOM:-0}"
printf '%s' "$canary_a" > "$optview/probe-a.txt"
got_a="$(cat "$trustview/probe-a.txt" 2>/dev/null || true)"
[ "$got_a" = "$canary_a" ] || fail "opt->trust byte mismatch (got '$got_a')"
# 2. write via the /tmp trust view, read via the /opt view -> byte identical (vice-versa).
canary_b="canary-trust-$$-${RANDOM:-0}"
printf '%s' "$canary_b" > "$trustview/probe-b.txt"
got_b="$(cat "$optview/probe-b.txt" 2>/dev/null || true)"
[ "$got_b" = "$canary_b" ] || fail "trust->opt byte mismatch (got '$got_b')"
# 3. SAME st_dev/st_ino: the barrier :215 string-check on the /tmp trust view and the physical
#    inode agree at real privilege (the #15 dual-bind invariant bwrap could only simulate).
opt_devino="$(stat -c '%d:%i' "$optview/probe-a.txt")"
trust_devino="$(stat -c '%d:%i' "$trustview/probe-a.txt")"
[ "$opt_devino" = "$trust_devino" ] || fail "dev:ino mismatch $opt_devino != $trust_devino"
# 4. the bound fakehosts /etc/hosts redirects the pooler host to 127.0.0.1 IN the ns (exact field
#    match, no regex metachar surprises from the dotted host).
awk -v p="$pooler" '$1=="127.0.0.1"{for(i=2;i<=NF;i++) if($i==p) f=1} END{exit f?0:1}' "$hosts" \
  || fail "fakehosts does not redirect $pooler to 127.0.0.1"
# 5. setpriv dropped to the expected uid.
actual_uid="$(id -u)"
[ "$actual_uid" = "$expect_uid" ] || fail "euid $actual_uid != expected $expect_uid"
printf 'PROBE-TRUST-BRIDGE OK dev:ino=%s euid=%s pooler->127.0.0.1\n' "$opt_devino" "$actual_uid"
PAYLOAD
}

# lease payload (python) — args: sys.argv[1]=LOCK sys.argv[2]=JOURNAL sys.argv[3]=EXPECT_UID.
payload_lease() {
  cat <<'PAYLOAD'
import fcntl, json, os, subprocess, sys
lock, journal, expect_uid = sys.argv[1], sys.argv[2], int(sys.argv[3])
r = {"probe": "lease", "ok": False, "euid": os.geteuid(),
     "fd9_flock_acquired": False, "second_flock_blocked": False,
     "child_inherited_fd8_fd9": False, "journal_durable": False}
try:
    # FD-9: the canonical cutover.lock, O_NOFOLLOW, exclusive non-blocking flock (run_claim custody).
    lfd = os.open(lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    if lfd != 9:
        os.dup2(lfd, 9); os.close(lfd)
    fcntl.flock(9, fcntl.LOCK_EX | fcntl.LOCK_NB)
    r["fd9_flock_acquired"] = True
    # FD-8: the journal, append + dsync where available.
    jflags = os.O_WRONLY | os.O_APPEND | os.O_CREAT | getattr(os, "O_DSYNC", 0)
    jfd = os.open(journal, jflags, 0o600)
    if jfd != 8:
        os.dup2(jfd, 8); os.close(jfd)
    # A second flock on the same lock from a SEPARATE process must block (exclusivity holds).
    second_src = ("import fcntl,os,sys\n"
                  "fd=os.open(sys.argv[1],os.O_RDWR|os.O_NOFOLLOW)\n"
                  "try:\n"
                  " fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);print('ACQUIRED');sys.exit(0)\n"
                  "except OSError:print('BLOCKED');sys.exit(7)\n")
    second = subprocess.run([sys.executable, "-c", second_src, lock],
                            capture_output=True, text=True)
    r["second_flock_blocked"] = second.returncode == 7 and "BLOCKED" in second.stdout
    # FD-8/9 inherited across a child exec (pass_fds keeps them at the same numbers).
    child_src = ("import os,sys\n"
                 "try:\n os.fstat(8);os.fstat(9);print('INHERITED');sys.exit(0)\n"
                 "except OSError:print('MISSING');sys.exit(9)\n")
    child = subprocess.run([sys.executable, "-c", child_src],
                           pass_fds=(8, 9), capture_output=True, text=True)
    r["child_inherited_fd8_fd9"] = child.returncode == 0 and "INHERITED" in child.stdout
    # Durable append on FD-8.
    os.write(8, b'{"probe":"lease-durability"}\n'); os.fsync(8)
    with open(journal, "rb") as fh:
        r["journal_durable"] = b'"lease-durability"' in fh.read()
    r["ok"] = all([r["fd9_flock_acquired"], r["second_flock_blocked"],
                   r["child_inherited_fd8_fd9"], r["journal_durable"],
                   os.geteuid() == expect_uid])
finally:
    sys.stdout.write(json.dumps(r, sort_keys=True) + "\n")
sys.exit(0 if r["ok"] else 3)
PAYLOAD
}

# uid payload — args: $1=TRUST_ROOT $2=EXPECT_UID.
payload_uid() {
  cat <<'PAYLOAD'
set -eu
trust_root="$1"; expect_uid="$2"
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 3; }
actual_uid="$(id -u)"
[ "$actual_uid" = "$expect_uid" ] || fail "euid $actual_uid != expected $expect_uid"
owner="$(stat -c '%u' "$trust_root")"
[ "$owner" = "$expect_uid" ] || fail "trust-root owner $owner != euid $expect_uid (barrier :96 gate)"
mode="$(stat -c '%a' "$trust_root")"
[ "$mode" = "700" ] || fail "trust-root mode $mode != 700"
printf 'PROBE-UID OK uid=%s owner=%s mode=%s\n' "$actual_uid" "$owner" "$mode"
PAYLOAD
}

emit_payload() {
  case "$1" in
    trust-bridge) payload_trust_bridge ;;
    lease) payload_lease ;;
    uid) payload_uid ;;
    *) usage; rehearsal_die "unknown payload: $1" ;;
  esac
}

# ------------------------------------------------------------------------------------------------ #
# Arg parse.
# ------------------------------------------------------------------------------------------------ #
probe=''
run_id=''
reuid=1000
regid=1000
dry_run=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --probe) probe="$2"; shift 2 ;;
    --run-id) run_id="$2"; shift 2 ;;
    --reuid) reuid="$2"; shift 2 ;;
    --regid) regid="$2"; shift 2 ;;
    --dry-run) dry_run=1; shift ;;
    --emit-payload) emit_payload "${2:-}"; exit 0 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; rehearsal_die "unknown argument: $1" ;;
  esac
done

[[ $reuid =~ ^[0-9]+$ ]] || rehearsal_die "--reuid must be numeric"
[[ $regid =~ ^[0-9]+$ ]] || rehearsal_die "--regid must be numeric"
[[ -n $probe ]] || { usage; rehearsal_die "--probe is required"; }
case "$probe" in trust-bridge|lease|uid|all) ;; *) usage; rehearsal_die "unknown --probe: $probe" ;; esac

[[ -n $run_id ]] || run_id="$(rehearsal_new_run_id)"
rehearsal_validate_run_id "$run_id"
rehearsal_log "probe run-id: $run_id (throwaway UUIDv4 — NEVER a real cutover)"

opt_root="/opt/megacampus/backups/q12/$run_id"

# A scratch trust root holds the payload files + fakehosts for BOTH dry-run realism and the
# privileged run; teardown umounts-before-rmdir (belt; the ns binds auto-unmount on exit anyway).
trust_root="$(rehearsal_make_trust_root)"
trust_view="$trust_root/backups/q12/$run_id"
mkdir -p "$trust_view"
chmod 0700 "$trust_root" "$trust_root/backups" "$trust_root/backups/q12" "$trust_view"
fakehosts="$trust_root/fakehosts"
printf '127.0.0.1 localhost %s\n::1 localhost ip6-localhost ip6-loopback\n' \
  "$REHEARSAL_POOLER_HOST" > "$fakehosts"
chmod 0644 "$fakehosts"

payload_tb_file="$trust_root/payload-trust-bridge.sh"
payload_lease_file="$trust_root/payload-lease.py"
payload_uid_file="$trust_root/payload-uid.sh"
payload_trust_bridge > "$payload_tb_file"
payload_lease > "$payload_lease_file"
payload_uid > "$payload_uid_file"

# umount-before-rmdir belt + throwaway /opt probe dir cleanup.
cleanup() {
  rehearsal_teardown "$trust_root" "" ""
  # The privileged path also creates a throwaway /opt/<uuid> (writes land via the ns bind on the
  # real inode); drop it recursively, GUARDED to the exact throwaway shape so nothing else on /opt
  # is touched. Idempotent.
  if [[ $dry_run -eq 0 && -n $run_id && $opt_root == "/opt/megacampus/backups/q12/$run_id" ]]; then
    umount "$opt_root" 2>/dev/null || umount -l "$opt_root" 2>/dev/null || true
    rm -rf "$opt_root" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# The ratified trust-bridge inner ns-script — IDENTICAL shape to rehearsal-ns-launch.sh: $0=fakehosts
# $1=opt_dir $2=trust_view $3..=the payload argv. `shift 2` drops ONLY the two mount operands ($1,$2);
# $0 (fakehosts) is never a shift target, and `shift 2` (NOT 3) preserves the payload entrypoint
# (the P1 lesson from ns-launch review; a covered inner-exec parity is asserted there).
inner_tb='mount --bind "$0" /etc/hosts; mount --bind "$1" "$2"; shift 2; exec setpriv --reuid='"$reuid"' --regid='"$regid"' --init-groups "$@"'

build_trust_bridge_command() {
  local tail=(/bin/bash "$payload_tb_file" "$opt_root" "$trust_view" /etc/hosts "$reuid" "$REHEARSAL_POOLER_HOST")
  probe_command=(sudo unshare -m /bin/sh -c "$inner_tb" "$fakehosts" "$opt_root" "$trust_view" "${tail[@]}")
  # Plain (unescaped) shape so reviewers/tests can grep the ratified tokens.
  probe_plain="sudo unshare -m /bin/sh -c { $inner_tb } $fakehosts $opt_root $trust_view ${tail[*]}"
}

build_lease_command() {
  local tail=(/usr/bin/python3 "$payload_lease_file" "$opt_root/cutover.lock" "$opt_root/phase.jsonl" "$reuid")
  probe_command=(sudo setpriv --reuid="$reuid" --regid="$regid" --init-groups "${tail[@]}")
  probe_plain="sudo setpriv --reuid=$reuid --regid=$regid --init-groups ${tail[*]}"
}

build_uid_command() {
  # The privileged path chowns trust_root to the target uid first; the payload asserts it.
  local tail=(/bin/bash "$payload_uid_file" "$trust_root" "$reuid")
  probe_command=(sudo setpriv --reuid="$reuid" --regid="$regid" --init-groups "${tail[@]}")
  probe_plain="sudo setpriv --reuid=$reuid --regid=$regid --init-groups ${tail[*]}"
}

selected=()
case "$probe" in
  all) selected=(trust-bridge lease uid) ;;
  *) selected=("$probe") ;;
esac

run_one() {
  local name="$1"
  case "$name" in
    trust-bridge) build_trust_bridge_command ;;
    lease) build_lease_command ;;
    uid) build_uid_command ;;
  esac

  if [[ $dry_run -eq 1 ]]; then
    rehearsal_log "probe[$name] plain: $probe_plain"
    printf 'WOULD-RUN[%s]:' "$name"
    printf ' %q' "${probe_command[@]}"
    printf '\n'
    return 0
  fi

  # ---- privileged path: orchestrator/server only ----
  [[ $(id -u) -eq 0 ]] || rehearsal_die "privileged probe needs root (orchestrator/server only)"
  case "$name" in
    trust-bridge)
      mkdir -p "$opt_root"; chmod 0700 "$opt_root"
      chown "$reuid:$regid" "$opt_root" "$trust_view" "$payload_tb_file"
      ;;
    lease)
      mkdir -p "$opt_root"; chmod 0700 "$opt_root"
      chown "$reuid:$regid" "$opt_root" "$payload_lease_file"
      ;;
    uid)
      chown "$reuid:$regid" "$trust_root" "$payload_uid_file"
      chmod 0700 "$trust_root"
      ;;
  esac
  rehearsal_log "probe[$name]: executing under real privilege on $opt_root"
  "${probe_command[@]}"
}

for name in "${selected[@]}"; do
  run_one "$name"
done

rehearsal_log "probes complete: ${selected[*]} (run-id $run_id)"
