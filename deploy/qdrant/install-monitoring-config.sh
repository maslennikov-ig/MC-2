#!/usr/bin/env bash
#
# Promote staged monitoring configuration into the live, root-owned tree.
#
# WHY THIS EXISTS. CI cannot write /opt/megacampus/ops/qdrant: it is root-owned all the way down by
# deliberate hardening, and the deploy user is not root. Before 2026-07-31 the workflow simply
# asserted the deployed tree matched the repository and nothing checked it, so a green deploy left
# production serving a stale critical alert for two weeks (mc2-ugl5g). CI now stages the tree into
# a directory the deploy user CAN write and fails when the live tree has drifted; this script is
# the deliberate root half that closes the loop.
#
# It refuses to install rules it cannot validate, keeps a dated backup of everything it replaces,
# and restarts Prometheus rather than signalling it -- a single-file bind mount pins the inode, so
# SIGHUP leaves the container reading the file it already had.
#
# Usage:  sudo /opt/megacampus/deploy/qdrant/install-monitoring-config.sh [--dry-run]
set -euo pipefail

STAGED_OPS_DIR=${STAGED_OPS_DIR:-/opt/megacampus/ops-staged/qdrant}
LIVE_OPS_DIR=${LIVE_OPS_DIR:-/opt/megacampus/ops/qdrant}
STAGED_UNIT_DIR=${STAGED_UNIT_DIR:-/opt/megacampus/deploy/systemd}
LIVE_UNIT_DIR=${LIVE_UNIT_DIR:-/etc/systemd/system}
PROMETHEUS_CONTAINER=${PROMETHEUS_CONTAINER:-megacampus-prometheus}

DRY_RUN=0
[[ ${1:-} == --dry-run ]] && DRY_RUN=1

BACKUP_SUFFIX="bak-$(date -u +%Y%m%dT%H%M%SZ)"

die() {
  echo "install-monitoring-config: $*" >&2
  exit 1
}

[[ $EUID -eq 0 ]] || die "must run as root; the live tree is root-owned on purpose"
[[ -d $STAGED_OPS_DIR ]] || die "no staged tree at $STAGED_OPS_DIR — run a deploy first"

# ---------------------------------------------------------------------------
# Validate before replacing anything. promtool lives inside the Prometheus
# image, so use the exact image the running container was built from.
# ---------------------------------------------------------------------------
prometheus_image=$(docker inspect "$PROMETHEUS_CONTAINER" --format '{{.Config.Image}}' 2>/dev/null) \
  || die "cannot inspect $PROMETHEUS_CONTAINER"

if [[ -f $STAGED_OPS_DIR/prometheus/alerts.yml ]]; then
  echo "validating staged Prometheus rules with promtool from $prometheus_image"
  docker run --rm --entrypoint promtool \
    -v "$STAGED_OPS_DIR/prometheus":/candidate:ro -w /candidate \
    "$prometheus_image" check rules alerts.yml \
    || die "promtool check rules FAILED — nothing was installed"

  if [[ -f $STAGED_OPS_DIR/prometheus/alert-tests.yml ]]; then
    docker run --rm --entrypoint promtool \
      -v "$STAGED_OPS_DIR/prometheus":/candidate:ro -w /candidate \
      "$prometheus_image" test rules alert-tests.yml \
      || die "promtool test rules FAILED — nothing was installed"
  fi
fi

# ---------------------------------------------------------------------------
# Install. 0444 for config the containers only read; 0644 for unit files,
# matching what systemd already has on disk.
# ---------------------------------------------------------------------------
prometheus_changed=0
installed=0

install_one() {
  local source=$1 target=$2 mode=$3
  if [[ -f $target ]] && cmp -s "$source" "$target"; then
    return 0
  fi

  if [[ $DRY_RUN -eq 1 ]]; then
    echo "  would install $target"
  else
    echo "  installing $target"
  fi

  if [[ $DRY_RUN -eq 1 ]]; then
    installed=$((installed + 1))
    return 0
  fi

  install -d -o root -g root -m 0755 "$(dirname "$target")"
  [[ -f $target ]] && cp -p "$target" "$target.$BACKUP_SUFFIX"
  install -o root -g root -m "$mode" "$source" "$target"
  installed=$((installed + 1))
}

echo "installing monitoring config from $STAGED_OPS_DIR"
while IFS= read -r -d '' source; do
  relative=${source#"$STAGED_OPS_DIR"/}
  before=$installed
  install_one "$source" "$LIVE_OPS_DIR/$relative" 0444
  # Only the two files Prometheus actually bind-mounts justify a restart; alert-tests.yml is
  # promtool input on the host and is not mounted into the container.
  if [[ $installed -ne $before && ( $relative == prometheus/prometheus.yml || $relative == prometheus/alerts.yml ) ]]; then
    prometheus_changed=1
  fi
done < <(find "$STAGED_OPS_DIR" -type f -print0)

units_changed=0
if [[ -d $STAGED_UNIT_DIR ]]; then
  echo "installing systemd units from $STAGED_UNIT_DIR"
  while IFS= read -r -d '' source; do
    name=$(basename "$source")
    before=$installed
    install_one "$source" "$LIVE_UNIT_DIR/$name" 0644
    [[ $installed -ne $before ]] && units_changed=1
  done < <(find "$STAGED_UNIT_DIR" -maxdepth 1 -type f \
    \( -name '*.service' -o -name '*.timer' \) -print0)
fi

if [[ $DRY_RUN -eq 1 ]]; then
  echo "dry run: $installed file(s) would change"
  exit 0
fi

# ---------------------------------------------------------------------------
# Make the new bytes actually take effect.
# ---------------------------------------------------------------------------
if [[ $units_changed -eq 1 ]]; then
  echo "reloading systemd"
  systemctl daemon-reload
fi

if [[ $prometheus_changed -eq 1 ]]; then
  # NOT SIGHUP: prometheus.yml and alerts.yml are single-file bind mounts, so the container holds
  # the old inode after `install` replaces the path. Measured 2026-07-31.
  echo "restarting $PROMETHEUS_CONTAINER (single-file bind mounts pin the inode)"
  docker restart "$PROMETHEUS_CONTAINER" >/dev/null
fi

echo "installed $installed file(s); backups carry the suffix .$BACKUP_SUFFIX"
