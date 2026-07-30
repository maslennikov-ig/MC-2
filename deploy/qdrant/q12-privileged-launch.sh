#!/usr/bin/env bash
# Q12 cutover window — root-owned argv whitelist for the ONE frozen command that needs root.
#
# Design authority: docs/superpowers/specs/2026-07-26-q12-window-execution-identity-design.md §D5.
#
# The window controller (q12-lifecycle-core.py) runs as uid/gid 1000 and MUST stay there: every
# artifact validator it owns compares ownership against the hard constant 1000, and the writer
# operations cannot complete as root at all (q12-writer-resume.py's closed-inbound probe requires its
# own scratch to be owned 1000:1000). Exactly one frozen command is the exception —
# `source.forward` — because it reads the operator tree /var/lib/megacampus-source-recovery, whose
# state/ is uid 1001 mode 0700 with 0400 files inside. Reading another non-root user's 0400 file
# inside a 0700 directory requires root; relaxing those modes would weaken a real 1000/1001
# isolation boundary. So the controller reaches that single command through this script via
# `sudo -n -- <this script> <frozen argv...>`.
#
# HONESTY NOTE — this adds NO privilege. /etc/sudoers.d/claude-deploy already grants the operator
# account `ALL=(ALL) NOPASSWD: ALL`, so anything reachable here was already reachable. This script is
# a fail-closed argv whitelist that narrows what that existing sudo is used for; it is NOT a new
# trust boundary, and it must not be described as one while that blanket rule exists. Hardening that
# sudoers rule (and the fact that the wrapper itself is operator-owned 0555) is a separate ticket.
# No sudoers change is required by this script: no descriptor crosses the privilege boundary, so
# sudo's `closefrom=3` is irrelevant.
#
# INSTALL CONTRACT: root-owned, mode 0555 —
#   sudo install -o root -g root -m 0555 q12-privileged-launch.sh \
#     /opt/megacampus/deploy/qdrant/q12-privileged-launch.sh
# (Host installation happens during pre-window staging, not from this repo checkout.)
#
# THE WINDOW LOCK IS OPENED, NEVER LOCKED — do NOT "fix" this later by adding a `flock` call.
# This is counter-intuitive on purpose. The controller holds LOCK_EX on
# /opt/megacampus/backups/q12/cutover.lock for the entire window (q12-lifecycle-core.py:8041-8046;
# it is never unlocked). The child's own liveness proof closes the inherited descriptor in a subshell
# and then requires a FRESH acquisition to FAIL (source-recovery-run.sh:405-410) — it fails precisely
# because the CONTROLLER holds it. So this script passes descriptor 9 as an IDENTITY HANDLE only: the
# child verifies by path and dev/ino that the descriptor is the canonical lock, and the holding proof
# comes from the controller. A script that ran `flock` on that descriptor (or on that path) here
# would be self-contradictory: the acquisition MUST fail against the controller's own lock, so it
# would fail closed for every window. There is deliberately no `flock` anywhere below.

set -euo pipefail
umask 077

# The frozen PATH, so this script's own tools resolve independently of sudo's secure_path.
PATH='/usr/sbin:/usr/bin:/sbin:/bin'
export PATH

readonly WRAPPER='/opt/megacampus/deploy/qdrant/source-recovery-run.sh'
readonly CUTOVER_LOCK='/opt/megacampus/backups/q12/cutover.lock'
readonly Q12_BACKUPS_ROOT='/opt/megacampus/backups/q12'
readonly CONTROLLER_UID='1000'
readonly CONTROLLER_GID='1000'
readonly LEASE_FD='9'
# A canonical lowercase uuid; the second form is the wrapper's own --run-id gate
# (source-recovery-run.sh:240), so this is exactly as strict as the child, never stricter.
readonly UUID_RE='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
readonly SOURCE_RECOVERY_RUN_ID_RE='^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'

# THE FROZEN source.forward SHAPE — flags in order, values in order. Constraining argv[0] and the
# operation alone is NOT enough: with only those pinned, `--stop-writers` plus an attacker-supplied
# --manifest/--production-root/--development-root reached the wrapper verbatim AS ROOT (found by
# review, 2026-07-26). The flag set and their order are fixed by the manifest; only four values are
# free, marked with @SENTINELS@ below and validated by shape.
#
# WHY A STATIC COPY and not a run-time read of q12-command-manifest.json: that manifest lives in
# /opt/megacampus, which is writable by the uid-1000 operator account this whitelist exists to
# constrain — a launcher that read its whitelist from there could be re-pointed by the very account
# it restricts. This script is root-owned 0555, so the shape must live HERE. Drift is caught by
# q12-privileged-launch.test.ts, which pins these two arrays to the frozen manifest argv sentinel for
# sentinel; a manifest change therefore fails a test instead of a window.
readonly -a FROZEN_FLAGS=(
  '--operation'
  '--run-id'
  '--project-directory'
  '--env-file'
  '--plan-input'
  '--manifest'
  '--progress-directory'
  '--development-root'
  '--production-root'
  '--capability-directory'
  '--q12-db-capability-file'
  '--external-quiesce-manifest'
  '--database-barrier-receipt'
)
readonly -a FROZEN_VALUES=(
  '@OPERATION@'
  '@SOURCE_RECOVERY_RUN_ID@'
  '/opt/megacampus'
  '/opt/megacampus/.env.production'
  '/var/lib/megacampus-source-recovery/plan-input.json'
  '/var/lib/megacampus-source-recovery/state/manifest.json'
  '/var/lib/megacampus-source-recovery/state/progress'
  '/opt/megacampus/data/uploads-dev'
  '/opt/megacampus/data/uploads'
  '/opt/megacampus/data/source-recovery-capability'
  '@Q12_RUN_ROOT@/secrets/db-capability'
  '@EXTERNAL_QUIESCE_MANIFEST@'
  '@Q12_RUN_ROOT@/database-barrier-receipt.json'
)

fail() {
  printf 'q12 privileged launch: %s\n' "$1" >&2
  exit 1
}

[[ ${EUID:-$(id -u)} -eq 0 ]] || fail 'privileged launch must run as root'

# ---------------------------------------------------------------------------
# argv whitelist: exactly the frozen source.forward shape
# ---------------------------------------------------------------------------
(($# >= 1)) || fail 'privileged launch requires the frozen source.forward argv'
[[ $1 == "$WRAPPER" ]] || fail 'privileged launch accepts only the frozen source recovery wrapper'
# The whitelisted string must also be the on-disk object it names. Ownership is deliberately NOT
# asserted: the wrapper is operator-owned 0555 by design (spec §D5), so a root-ownership demand here
# would fail closed on every window.
[[ -f $WRAPPER && ! -L $WRAPPER && -x $WRAPPER ]] ||
  fail 'privileged launch accepts only the frozen source recovery wrapper'
[[ $(realpath -e -- "$WRAPPER") == "$WRAPPER" ]] ||
  fail 'privileged launch accepts only the frozen source recovery wrapper'

# --stop-writers is refused BY NAME and FIRST so the intent is greppable and the reason is legible
# even when the arity check would also have caught it. Q12 forbids it (source-recovery-run.sh:432)
# because the writers are quiesced out of band by C2 under the controller's own lease; a forward run
# that stopped them itself would install the recovery EXIT trap and take a branch this window must
# never enter.
for argument in "$@"; do
  [[ $argument != '--stop-writers' ]] ||
    fail 'privileged launch refuses --stop-writers: the Q12 forward path must never stop writers'
done

readonly expected_arity=$((1 + 2 * ${#FROZEN_FLAGS[@]}))
(($# == expected_arity)) ||
  fail "privileged launch requires exactly $expected_arity frozen source.forward arguments"

# Both Q12 run-root paths must name the SAME run root; resolved_command substitutes one <run-id>.
q12_run_id=''

require_q12_run_root_path() {
  local value="$1" flag="$2" suffix="$3" root=''
  root="${value%"$suffix"}"
  [[ $root != "$value" && $root == "$Q12_BACKUPS_ROOT/"* ]] ||
    fail "privileged launch argument for $flag is not a canonical Q12 run-root path"
  local observed="${root#"$Q12_BACKUPS_ROOT/"}"
  [[ $observed =~ $UUID_RE ]] ||
    fail "privileged launch argument for $flag is not a canonical Q12 run-root path"
  if [[ -z $q12_run_id ]]; then
    q12_run_id="$observed"
  elif [[ $q12_run_id != "$observed" ]]; then
    fail 'privileged launch Q12 run-root paths disagree on the run id'
  fi
}

for ((pair = 0; pair < ${#FROZEN_FLAGS[@]}; pair++)); do
  flag_index=$((2 + 2 * pair))
  value_index=$((3 + 2 * pair))
  flag="${!flag_index}"
  value="${!value_index}"
  expected_flag="${FROZEN_FLAGS[pair]}"
  [[ $flag == "$expected_flag" ]] ||
    fail "privileged launch argument $flag_index is not the frozen flag $expected_flag"
  case "${FROZEN_VALUES[pair]}" in
    '@OPERATION@')
      [[ $value == 'forward' ]] || fail 'privileged launch accepts only --operation forward'
      ;;
    '@SOURCE_RECOVERY_RUN_ID@')
      [[ $value =~ $SOURCE_RECOVERY_RUN_ID_RE ]] ||
        fail 'privileged launch requires a canonical uuid source recovery run id'
      ;;
    '@EXTERNAL_QUIESCE_MANIFEST@')
      # The one genuinely free path. The controller pins the publication to
      # <run-root>/writer-quiesce-<run-id>.json, but a `live` run over an ALREADY published manifest
      # only requires a lexically absolute path, so pinning the file name here could fail a legitimate
      # window. Constrain it to the controller-owned Q12 backups tree with no traversal instead.
      [[ $value == "$Q12_BACKUPS_ROOT/"* && $value != *'/../'* && $value != *'/..' &&
         $value != *'//'* && $value != */ ]] ||
        fail 'privileged launch requires an external quiesce manifest inside the Q12 backups tree'
      ;;
    '@Q12_RUN_ROOT@'*)
      require_q12_run_root_path "$value" "$expected_flag" "${FROZEN_VALUES[pair]#@Q12_RUN_ROOT@}"
      ;;
    *)
      [[ $value == "${FROZEN_VALUES[pair]}" ]] ||
        fail "privileged launch argument $value_index is not the frozen value for $expected_flag"
      ;;
  esac
done

# ---------------------------------------------------------------------------
# the canonical window lock, opened as an identity handle (see the header)
# ---------------------------------------------------------------------------
# The same properties the child itself asserts (source-recovery-run.sh:392-400): a canonical,
# non-symlink regular file owned by the controller identity with mode exactly 0600.
[[ -f $CUTOVER_LOCK && ! -L $CUTOVER_LOCK ]] ||
  fail 'privileged launch requires the canonical controller-owned cutover lock'
[[ $(realpath -e -- "$CUTOVER_LOCK") == "$CUTOVER_LOCK" ]] ||
  fail 'privileged launch requires the canonical controller-owned cutover lock'
[[ $(stat -c '%u:%g:%a' -- "$CUTOVER_LOCK") == "$CONTROLLER_UID:$CONTROLLER_GID:600" ]] ||
  fail 'privileged launch requires the canonical controller-owned cutover lock'

# Read-only: the child needs the descriptor's IDENTITY, never write access.
exec 9<"$CUTOVER_LOCK"
[[ $(readlink -e -- "/proc/self/fd/$LEASE_FD") == "$CUTOVER_LOCK" ]] ||
  fail 'privileged launch lease descriptor is not bound to the canonical cutover lock'

# ---------------------------------------------------------------------------
# exec the frozen argv unchanged, under the frozen env rebuilt from nothing
# ---------------------------------------------------------------------------
# `env -i` reproduces the manifest env for source.forward verbatim and scrubs everything sudo left
# behind. The argv is passed through byte-identically: what the controller records in the journal is
# the manifest argv, and this launch must not diverge from it (spec §D7).
exec /usr/bin/env -i \
  PATH='/usr/sbin:/usr/bin:/sbin:/bin' \
  LC_ALL='C' \
  LANG='C' \
  HOME='/root' \
  "$@"
