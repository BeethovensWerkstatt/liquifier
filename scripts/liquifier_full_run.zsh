#!/bin/zsh
# Regenerates the full liquifier output cache (AT, editedAt, fluidTranscripts; svg+midi)
# for every diplomatic transcript source file.
#
# Builds the file list into a zsh array split only on newlines
# (`${(@f)"$(...)"}`), instead of relying on unquoted `$(...)`, which zsh
# word-splits on spaces by default and would silently break source paths that
# contain spaces (e.g. "D-Mbs 2 Mus.pr. 1326-165").
#
# Usage:
#   ./scripts/liquifier_full_run.zsh
#
# Override defaults via environment variables, e.g.:
#   OUTPUT_DIR=../data/cache RECREATE=false ./scripts/liquifier_full_run.zsh

set -e

cd "${0:A:h}/.."

INPUT_DIR=${INPUT_DIR:-../data/data/sources}
OUTPUT_DIR=${OUTPUT_DIR:-../data-cache/cache}
CONTEXT_DOCUMENT=${CONTEXT_DOCUMENT:-Notirungsbuch_K}
TYPES=${TYPES:-at,fluidTranscripts,editedAt}
MEDIA=${MEDIA:-svg,midi}
RECREATE=${RECREATE:-true}

LOGFILE=/tmp/liquifier_full_run_$(date +%Y%m%d_%H%M%S).log

# getFilesObject() (src/filehandlers/filehandler.js) accepts full paths as-is,
# so the paths found here can be passed straight through without stripping
# the INPUT_DIR prefix.
files=("${(@f)"$(find "$INPUT_DIR" -type f -path '*/diplomaticTranscripts/*.xml')"}")

echo "Found ${#files[@]} source files in $INPUT_DIR"

node index.js \
  --types="$TYPES" \
  --media="$MEDIA" \
  --recreate="$RECREATE" \
  --input-dir="$INPUT_DIR" \
  --output-dir="$OUTPUT_DIR" \
  --context-document="$CONTEXT_DOCUMENT" \
  "${files[@]}" 2>&1 | tee "$LOGFILE"

echo "--- Verification ---"
grep -n 'Could not create file triple' "$LOGFILE" || true
grep -n '\[ERROR\]' "$LOGFILE" || true
echo "Skipped triples: $(grep -c 'Could not create file triple' "$LOGFILE" || true)"
echo "Errors: $(grep -c '\[ERROR\]' "$LOGFILE" || true)"
echo "LOGFILE: $LOGFILE"
