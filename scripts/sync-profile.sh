#!/usr/bin/env bash
set -euo pipefail

USER="priyansh10ff"
OUT="data/github.json"

curl -fsSL -H "Accept: application/vnd.github+json" \
  "https://api.github.com/users/${USER}" > "${OUT}.tmp"

mv "${OUT}.tmp" "${OUT}"

echo "Synced public GitHub profile data for ${USER}"
