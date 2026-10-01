#!/usr/bin/env bash
# Regenerates every #671 spike result from the tracked payload, then copies the reports and
# previews into evidence/. Needs Blender 5.2 (BLENDER=path to override) and `bun install` in web/.
set -euo pipefail
cd "$(dirname "$0")"
SPIKE=$PWD
BLENDER=${BLENDER:-blender}
run_blender() { "$BLENDER" -b --factory-startup --python-exit-code 1 --python "$@" >/dev/null; }

rm -rf out
(cd ../../web && bun tools/geometry-spike/roundtrip.ts --blender "$BLENDER")
FIXTURES="targ-object-model-1700 targ-surface-cell-1 targ-room-0 damocles-object-03f774 damocles-atropos-ground-02064a-00 damocles-structure-01484e damocles-interior-0303d6 damocles-ground-021de0-06-54"
run_blender scripts/standard_gltf.py -- $FIXTURES
(cd ../../web && bun tools/geometry-spike/edits.ts --blender "$BLENDER" && bun tools/geometry-spike/freshness.ts --blender "$BLENDER")

# The whole contract-representable Damocles corpus through Blender, 150 Models a batch.
(cd ../../web && bun tools/geometry-spike/cli.ts sweep >/dev/null)
python3 scripts/encode_corpus.py
COUNT=$(ls out/sweep/*.contract.json | wc -l)
for batch in $(seq 0 $(( (COUNT - 1) / 150 ))); do
  run_blender scripts/corpus_roundtrip.py -- import "$batch" 150
  run_blender scripts/corpus_roundtrip.py -- export "$batch"
  run_blender scripts/corpus_roundtrip.py -- export "$batch" toggle
done
python3 scripts/corpus_report.py
(cd ../../web && bun tools/geometry-spike/measure.ts >/dev/null)
python3 -m unittest discover -s tests

rm -rf evidence/reports evidence/edits
mkdir -p evidence/reports evidence/edits
cp out/*-report.md out/sweep-report.json evidence/reports/
for dir in out/edits/*/; do
  name=$(basename "$dir")
  mkdir -p "evidence/edits/$name"
  cp "$dir"diagnostics-*.txt "evidence/edits/$name/"
  for f in diff.md preview.png before.svg after.svg before.png after.png; do
    [ -f "$dir$f" ] && cp "$dir$f" "evidence/edits/$name/"
  done
done
echo "evidence regenerated in $SPIKE/evidence"
