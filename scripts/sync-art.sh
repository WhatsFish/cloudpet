#!/usr/bin/env bash
# Mirror the procedural sprites into the web app's public dir so the /cloudpet/codex
# 图鉴 can serve them. Run after scripts/gen-art.mjs whenever art changes.
set -eo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/miniprogram/assets/pets"
DST="$ROOT/web/public/pets"
rm -rf "$DST"
mkdir -p "$DST"
cp -r "$SRC/." "$DST/"
echo "synced $(find "$DST" -name '*.png' | wc -l) sprites -> web/public/pets"
