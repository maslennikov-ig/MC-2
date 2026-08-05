#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
    echo "usage: $0 <github-repository> <image> <version>" >&2
    exit 64
fi

repository="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
image="$2"
version="$3"

[[ "$repository" =~ ^[a-z0-9]+([._-][a-z0-9]+)*/[a-z0-9]+([._-][a-z0-9]+)*$ ]] || {
    echo "invalid GitHub repository for a GHCR image: $1" >&2
    exit 64
}
[[ "$image" =~ ^[a-z0-9]+([._-][a-z0-9]+)*$ ]] || {
    echo "invalid Docling image name: $image" >&2
    exit 64
}
[[ "$version" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || {
    echo "invalid Docling image tag: $version" >&2
    exit 64
}

image_repository="ghcr.io/$repository/$image"
printf 'repository=%s\n' "$image_repository"
printf 'tag=%s:%s\n' "$image_repository" "$version"
