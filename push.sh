#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
git add -A
if git diff --cached --quiet; then
  echo "No changes to push."
  exit 0
fi
git commit -m "${1:-update}"
git push origin main
