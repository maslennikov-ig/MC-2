#!/usr/bin/bash

# Sourced by restore-supabase-drill.sh. The caller owns strict shell options,
# the EXIT trap, and these variables: DOCKER, RUN_ID, RESTORE_IMAGE, TEMP_ROOT,
# CONTAINER_ID, NETWORK_ID, and VOLUME_NAME.

restore_docker_expected_name() {
  case "$1" in
    container) printf 'mc2-supabase-restore-%s\n' "$RUN_ID" ;;
    network) printf 'mc2-supabase-restore-net-%s\n' "$RUN_ID" ;;
    volume) printf 'mc2-supabase-restore-data-%s\n' "$RUN_ID" ;;
    *) return 64 ;;
  esac
}

restore_docker_metadata() {
  local kind=$1 identity=$2
  case "$kind" in
    container)
      "$DOCKER" inspect --format '{{index .Config.Labels "com.megacampus.q12.restore-run"}}|{{index .Config.Labels "com.megacampus.q12.restore-resource"}}|{{.Name}}' "$identity" 2>/dev/null
      ;;
    network)
      "$DOCKER" network inspect --format '{{index .Labels "com.megacampus.q12.restore-run"}}|{{index .Labels "com.megacampus.q12.restore-resource"}}|{{.Name}}' "$identity" 2>/dev/null
      ;;
    volume)
      "$DOCKER" volume inspect --format '{{index .Labels "com.megacampus.q12.restore-run"}}|{{index .Labels "com.megacampus.q12.restore-resource"}}|{{.Name}}' "$identity" 2>/dev/null
      ;;
    *) return 64 ;;
  esac
}

restore_docker_resource_matches() {
  local kind=$1 identity=$2 expected_name metadata
  expected_name=$(restore_docker_expected_name "$kind") || return 1
  metadata=$(restore_docker_metadata "$kind" "$identity") || return 1
  if [[ "$kind" == container ]]; then
    expected_name="/$expected_name"
  fi
  [[ "$metadata" == "$RUN_ID|$kind|$expected_name" ]]
}

restore_docker_discover() {
  local kind=$1 output identity='' line='' count=0
  case "$kind" in
    container)
      output=$("$DOCKER" ps --all --quiet \
        --filter "label=com.megacampus.q12.restore-run=$RUN_ID" \
        --filter 'label=com.megacampus.q12.restore-resource=container') || return 1
      ;;
    network)
      output=$("$DOCKER" network ls --quiet \
        --filter "label=com.megacampus.q12.restore-run=$RUN_ID" \
        --filter 'label=com.megacampus.q12.restore-resource=network') || return 1
      ;;
    volume)
      output=$("$DOCKER" volume ls --quiet \
        --filter "label=com.megacampus.q12.restore-run=$RUN_ID" \
        --filter 'label=com.megacampus.q12.restore-resource=volume') || return 1
      ;;
    *) return 64 ;;
  esac
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    count=$((count + 1))
    [[ $count -eq 1 ]] || return 1
    identity=$line
  done <<<"$output"
  [[ $count -eq 1 ]] || return 2
  restore_docker_resource_matches "$kind" "$identity" || return 1
  printf '%s\n' "$identity"
}

cleanup_restore_docker_resources() {
  local status=0 identity='' discovery_status=0
  if [[ -n "${CONTAINER_ID:-}" ]]; then
    identity=$CONTAINER_ID
  elif identity=$(restore_docker_discover container); then
    :
  else
    discovery_status=$?
    identity=''
    [[ $discovery_status -eq 2 ]] || status=1
  fi
  if [[ -n "$identity" ]]; then
    if restore_docker_resource_matches container "$identity"; then
      "$DOCKER" rm -f -- "$identity" >/dev/null 2>&1 || status=1
    else
      status=1
    fi
  fi

  identity=''
  if [[ -n "${NETWORK_ID:-}" ]]; then
    identity=$NETWORK_ID
  elif identity=$(restore_docker_discover network); then
    :
  else
    discovery_status=$?
    identity=''
    [[ $discovery_status -eq 2 ]] || status=1
  fi
  if [[ -n "$identity" ]]; then
    if restore_docker_resource_matches network "$identity"; then
      "$DOCKER" network rm -- "$identity" >/dev/null 2>&1 || status=1
    else
      status=1
    fi
  fi

  identity=''
  if [[ -n "${VOLUME_NAME:-}" ]]; then
    identity=$VOLUME_NAME
  elif identity=$(restore_docker_discover volume); then
    :
  else
    discovery_status=$?
    identity=''
    [[ $discovery_status -eq 2 ]] || status=1
  fi
  if [[ -n "$identity" ]]; then
    if restore_docker_resource_matches volume "$identity"; then
      "$DOCKER" volume rm --force -- "$identity" >/dev/null 2>&1 || status=1
    else
      status=1
    fi
  fi
  return "$status"
}

restore_docker_fault_after_create() {
  local kind=$1
  if [[ "${MC2_RESTORE_FAULT_AFTER_CREATE:-}" == "$kind" ]]; then
    printf 'synthetic restore Docker fault after %s create\n' "$kind" >&2
    return 97
  fi
}

create_restore_docker_resources() {
  local container_name network_name volume_name output
  container_name=$(restore_docker_expected_name container)
  network_name=$(restore_docker_expected_name network)
  volume_name=$(restore_docker_expected_name volume)

  "$DOCKER" network create --internal \
    --label "com.megacampus.q12.restore-run=$RUN_ID" \
    --label 'com.megacampus.q12.restore-resource=network' "$network_name" \
    >"$TEMP_ROOT/network-create.identity"
  restore_docker_fault_after_create network
  IFS= read -r output <"$TEMP_ROOT/network-create.identity"
  [[ "$output" =~ ^[0-9a-f]{64}$ ]] || return 1
  restore_docker_resource_matches network "$output" || return 1
  NETWORK_ID=$output

  "$DOCKER" volume create \
    --label "com.megacampus.q12.restore-run=$RUN_ID" \
    --label 'com.megacampus.q12.restore-resource=volume' "$volume_name" \
    >"$TEMP_ROOT/volume-create.identity"
  restore_docker_fault_after_create volume
  IFS= read -r output <"$TEMP_ROOT/volume-create.identity"
  [[ "$output" == "$volume_name" ]] || return 1
  restore_docker_resource_matches volume "$output" || return 1
  VOLUME_NAME=$output

  "$DOCKER" run --detach --name "$container_name" --platform linux/amd64 \
    --label "com.megacampus.q12.restore-run=$RUN_ID" \
    --label 'com.megacampus.q12.restore-resource=container' --network "$NETWORK_ID" \
    --publish 127.0.0.1::5432 \
    --mount "type=volume,src=$VOLUME_NAME,dst=/var/lib/postgresql/data" \
    --mount "type=bind,src=$TEMP_ROOT/initial-password,dst=/run/secrets/initial-password,readonly" \
    --env POSTGRES_PASSWORD_FILE=/run/secrets/initial-password \
    "$RESTORE_IMAGE" >"$TEMP_ROOT/container-create.identity"
  restore_docker_fault_after_create container
  IFS= read -r output <"$TEMP_ROOT/container-create.identity"
  [[ "$output" =~ ^[0-9a-f]{64}$ ]] || return 1
  restore_docker_resource_matches container "$output" || return 1
  CONTAINER_ID=$output
}
