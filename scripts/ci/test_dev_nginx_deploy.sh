#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY_SCRIPT="$ROOT_DIR/scripts/deploy_dev.sh"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

FUNCTION_FILE="$TEMP_DIR/sync-function.sh"
awk '/^# BEGIN DEV NGINX SYNC FUNCTION$/,/^# END DEV NGINX SYNC FUNCTION$/' \
  "$DEPLOY_SCRIPT" > "$FUNCTION_FILE"
grep -q '^sync_dev_nginx_config()' "$FUNCTION_FILE" \
  || fail 'deploy_dev.sh does not expose the focused dev Nginx sync function'

call_line="$(grep -n '^sync_dev_nginx_config$' "$DEPLOY_SCRIPT" | cut -d: -f1)"
login_line="$(grep -n '^ghcr_login_with_ci_token$' "$DEPLOY_SCRIPT" | cut -d: -f1)"
[ -n "$call_line" ] && [ -n "$login_line" ] && [ "$call_line" -lt "$login_line" ] \
  || fail 'dev Nginx sync must run under the acquired host lock before registry or container mutations'

MOCK_BIN="$TEMP_DIR/bin"
mkdir -p "$MOCK_BIN"
cat > "$MOCK_BIN/sudo" <<'SUDO'
#!/usr/bin/env bash
set -euo pipefail
[ "${1:-}" != '-n' ] || shift
command_name="${1:-}"
[ -n "$command_name" ] || exit 2
shift
case "$command_name" in
  stat)
    if [ "${1:-}" = '-c' ] && [ "${2:-}" = '%u:%g:%a' ]; then
      path="${3:-}"
      mode="$(/usr/bin/stat -c '%a' "$path")"
      if [ "${MOCK_BAD_OWNER:-0}" = 1 ] && [ "$path" = "$DEV_NGINX_ACTIVE_PATH" ]; then
        printf '1000:1000:%s\n' "$mode"
      else
        printf '0:0:%s\n' "$mode"
      fi
      exit 0
    fi
    exec /usr/bin/stat "$@"
    ;;
  install)
    args=()
    while [ "$#" -gt 0 ]; do
      case "$1" in
        -o|-g) shift 2 ;;
        *) args+=("$1"); shift ;;
      esac
    done
    /usr/bin/install "${args[@]}"
    destination="${args[${#args[@]}-1]}"
    if [ "${MOCK_ACTIVE_DRIFT:-0}" = 1 ] && [[ "$destination" == "$DEV_NGINX_ACTIVE_PATH.candidate."* ]]; then
      printf 'out-of-band-dev\n' > "$DEV_NGINX_ACTIVE_PATH"
    fi
    exit 0
    ;;
  test) exec /usr/bin/test "$@" ;;
  sha256sum) exec /usr/bin/sha256sum "$@" ;;
  mv) exec /usr/bin/mv "$@" ;;
  rm) exec /usr/bin/rm "$@" ;;
  nginx) exec nginx "$@" ;;
  *) echo "unexpected sudo command: $command_name" >&2; exit 97 ;;
esac
SUDO
cat > "$MOCK_BIN/nginx" <<'NGINX'
#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = '-t' ]; then
  printf 'test\n' >> "$MOCK_NGINX_LOG"
  test_count="$(grep -c '^test$' "$MOCK_NGINX_LOG" || true)"
  if [ "${MOCK_NGINX_TEST_FAIL_ONCE:-0}" = 1 ] && [ "$test_count" -eq 1 ]; then
    exit 1
  fi
  [ "${MOCK_NGINX_TEST_FAIL:-0}" != 1 ]
  exit
fi
if [ "${1:-}" = '-s' ] && [ "${2:-}" = 'reload' ]; then
  printf 'reload\n' >> "$MOCK_NGINX_LOG"
  reload_count="$(grep -c '^reload$' "$MOCK_NGINX_LOG" || true)"
  if [ "${MOCK_NGINX_RELOAD_FAIL_ONCE:-0}" = 1 ] && [ "$reload_count" -eq 1 ]; then
    exit 1
  fi
  exit 0
fi
echo 'unexpected nginx invocation' >&2
exit 96
NGINX
chmod +x "$MOCK_BIN/sudo" "$MOCK_BIN/nginx"

run_case() {
  local name="$1"
  local fixture="$TEMP_DIR/$name"
  mkdir -p "$fixture/base/backups" "$fixture/etc" 
  printf 'production-sentinel\n' > "$fixture/etc/megacampus"
  printf 'old-dev\n' > "$fixture/etc/megacampus-dev"
  printf 'new-dev\n' > "$fixture/base/nginx-dev.conf"
  chmod 0644 "$fixture/etc/megacampus-dev" "$fixture/base/nginx-dev.conf"
  : > "$fixture/nginx.log"
  printf '%s' "$fixture"
}

invoke_sync() {
  local fixture="$1"
  PATH="$MOCK_BIN:$PATH" \
  BASE_PATH="$fixture/base" \
  DEV_NGINX_STAGED_PATH="$fixture/base/nginx-dev.conf" \
  DEV_NGINX_ACTIVE_PATH="$fixture/etc/megacampus-dev" \
  DEV_NGINX_BACKUP_DIR="$fixture/base/backups/nginx" \
  MOCK_NGINX_LOG="$fixture/nginx.log" \
  bash -eu -o pipefail -c 'source "$1"; sync_dev_nginx_config' _ "$FUNCTION_FILE"
}

assert_production_untouched() {
  local fixture="$1"
  [ "$(cat "$fixture/etc/megacampus")" = 'production-sentinel' ] \
    || fail 'production Nginx config was changed'
}

# Identical bytes are a true no-op: no backup, validation, or reload.
fixture="$(run_case noop)"
cp "$fixture/base/nginx-dev.conf" "$fixture/etc/megacampus-dev"
invoke_sync "$fixture"
[ ! -s "$fixture/nginx.log" ] || fail 'no-op invoked Nginx'
[ ! -d "$fixture/base/backups/nginx" ] || fail 'no-op created a backup'
assert_production_untouched "$fixture"

# Changed bytes are backed up once, atomically installed, validated, and reloaded.
fixture="$(run_case success)"
invoke_sync "$fixture"
[ "$(cat "$fixture/etc/megacampus-dev")" = 'new-dev' ] || fail 'success did not install staged config'
backup_count="$(find "$fixture/base/backups/nginx" -type f | wc -l)"
[ "$backup_count" -eq 1 ] || fail "success created $backup_count backups"
[ "$(cat "$(find "$fixture/base/backups/nginx" -type f)")" = 'old-dev' ] || fail 'backup does not contain prior config'
[ "$(tr '\n' ' ' < "$fixture/nginx.log")" = 'test reload ' ] || fail 'success did not validate then reload once'
assert_production_untouched "$fixture"

# Validation failure restores exact prior bytes and never reloads the candidate.
fixture="$(run_case validation-fail)"
set +e
MOCK_NGINX_TEST_FAIL_ONCE=1 invoke_sync "$fixture" >/dev/null 2>&1
status=$?
set -e
[ "$status" -ne 0 ] || fail 'validation failure returned success'
[ "$(cat "$fixture/etc/megacampus-dev")" = 'old-dev' ] || fail 'validation failure did not restore prior config'
[ "$(grep -c '^test$' "$fixture/nginx.log" || true)" -eq 2 ] || fail 'validation rollback did not validate the restored config'
[ "$(grep -c '^reload$' "$fixture/nginx.log" || true)" -eq 0 ] || fail 'validation failure reloaded candidate config'
assert_production_untouched "$fixture"

# Reload failure restores and reloads the prior validated config, then fails deploy.
fixture="$(run_case reload-fail)"
set +e
MOCK_NGINX_RELOAD_FAIL_ONCE=1 invoke_sync "$fixture" >/dev/null 2>&1
status=$?
set -e
[ "$status" -ne 0 ] || fail 'reload failure returned success'
[ "$(cat "$fixture/etc/megacampus-dev")" = 'old-dev' ] || fail 'reload failure did not restore prior config'
[ "$(grep -c '^test$' "$fixture/nginx.log" || true)" -eq 2 ] || fail 'reload rollback did not validate both candidate and prior config'
[ "$(grep -c '^reload$' "$fixture/nginx.log" || true)" -eq 2 ] || fail 'reload rollback did not attempt candidate and restored reloads'
assert_production_untouched "$fixture"

# Missing, symlinked, or incorrectly owned active state fails before any replacement.
fixture="$(run_case active-absent)"
rm "$fixture/etc/megacampus-dev"
set +e
invoke_sync "$fixture" >/dev/null 2>&1
status=$?
set -e
[ "$status" -ne 0 ] || fail 'missing active config did not fail closed'
assert_production_untouched "$fixture"

fixture="$(run_case staged-absent)"
rm "$fixture/base/nginx-dev.conf"
set +e
invoke_sync "$fixture" >/dev/null 2>&1
status=$?
set -e
[ "$status" -ne 0 ] || fail 'missing staged config did not fail closed'
assert_production_untouched "$fixture"

fixture="$(run_case active-symlink)"
mv "$fixture/etc/megacampus-dev" "$fixture/etc/megacampus-dev.real"
ln -s megacampus-dev.real "$fixture/etc/megacampus-dev"
set +e
invoke_sync "$fixture" >/dev/null 2>&1
status=$?
set -e
[ "$status" -ne 0 ] || fail 'symlinked active config did not fail closed'
[ "$(cat "$fixture/etc/megacampus-dev.real")" = 'old-dev' ] || fail 'symlink target was modified'
assert_production_untouched "$fixture"

fixture="$(run_case staged-symlink)"
mv "$fixture/base/nginx-dev.conf" "$fixture/base/nginx-dev.conf.real"
ln -s nginx-dev.conf.real "$fixture/base/nginx-dev.conf"
set +e
invoke_sync "$fixture" >/dev/null 2>&1
status=$?
set -e
[ "$status" -ne 0 ] || fail 'symlinked staged config did not fail closed'
[ "$(cat "$fixture/etc/megacampus-dev")" = 'old-dev' ] || fail 'staged symlink changed active config'
assert_production_untouched "$fixture"

fixture="$(run_case owner-mismatch)"
set +e
MOCK_BAD_OWNER=1 invoke_sync "$fixture" >/dev/null 2>&1
status=$?
set -e
[ "$status" -ne 0 ] || fail 'active owner mismatch did not fail closed'
[ "$(cat "$fixture/etc/megacampus-dev")" = 'old-dev' ] || fail 'owner mismatch changed active config'
assert_production_untouched "$fixture"

# An existing backup is create-only: conflicting bytes fail without overwrite.
fixture="$(run_case backup-conflict)"
active_sha="$(sha256sum "$fixture/etc/megacampus-dev" | awk '{print $1}')"
mkdir -p "$fixture/base/backups/nginx"
chmod 0700 "$fixture/base/backups/nginx"
printf 'conflicting-backup\n' > "$fixture/base/backups/nginx/megacampus-dev.$active_sha.conf"
chmod 0600 "$fixture/base/backups/nginx/megacampus-dev.$active_sha.conf"
set +e
invoke_sync "$fixture" >/dev/null 2>&1
status=$?
set -e
[ "$status" -ne 0 ] || fail 'conflicting existing backup did not fail closed'
[ "$(cat "$fixture/base/backups/nginx/megacampus-dev.$active_sha.conf")" = 'conflicting-backup' ] \
  || fail 'conflicting existing backup was overwritten'
[ "$(cat "$fixture/etc/megacampus-dev")" = 'old-dev' ] || fail 'backup conflict changed active config'
assert_production_untouched "$fixture"

# A write after backup but before replacement is detected by the second hash read.
fixture="$(run_case cas-drift)"
set +e
MOCK_ACTIVE_DRIFT=1 invoke_sync "$fixture" >/dev/null 2>&1
status=$?
set -e
[ "$status" -ne 0 ] || fail 'compare-and-swap drift returned success'
[ "$(cat "$fixture/etc/megacampus-dev")" = 'out-of-band-dev' ] \
  || fail 'compare-and-swap drift was overwritten'
[ ! -s "$fixture/nginx.log" ] || fail 'compare-and-swap drift invoked Nginx'
assert_production_untouched "$fixture"

echo 'dev Nginx deploy tests passed'
