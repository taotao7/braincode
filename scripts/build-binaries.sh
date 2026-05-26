#!/usr/bin/env bash
set -euo pipefail

VERSION="${VERSION:-dev}"
ENTRY="apps/cli/src/index.ts"
OUT_DIR="dist"

TARGETS=(
  "darwin-arm64"
  "darwin-x64"
  "linux-x64"
  "linux-arm64"
)

cd "$(dirname "$0")/.."

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is required" >&2
  exit 1
fi

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

echo ">> braincode build v${VERSION}"

for target in "${TARGETS[@]}"; do
  bin_name="braincode-${target}"
  echo ">> compiling ${bin_name}"
  bun build "$ENTRY" \
    --compile \
    --minify \
    --sourcemap=none \
    --target="bun-${target}" \
    --outfile="${OUT_DIR}/${bin_name}"

  echo ">> packaging ${bin_name}.tar.gz"
  tar -czf "${OUT_DIR}/${bin_name}.tar.gz" -C "$OUT_DIR" "$bin_name"
done

echo ">> cleaning intermediate files"
find "$OUT_DIR" -maxdepth 1 -type f ! -name "*.tar.gz" ! -name "SHA256SUMS" -delete

echo ">> generating SHA256SUMS"
cd "$OUT_DIR"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum braincode-*.tar.gz > SHA256SUMS
else
  shasum -a 256 braincode-*.tar.gz > SHA256SUMS
fi
cat SHA256SUMS
cd - >/dev/null

echo ">> done. artifacts in ${OUT_DIR}/"
ls -lh "$OUT_DIR"
