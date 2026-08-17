#!/bin/sh
# Emit the deterministic traces the Trace Oracle is judged by (ADR 0019).
#
# Output is payload-derived and therefore gitignored, so these are regenerated
# and diffed rather than committed. Run this before a change that should be
# behaviour-neutral, run it again after, and diff the two directories.
#
#   app/traces.sh /tmp/before
#   ... make the change ...
#   app/traces.sh /tmp/after
#   diff -ru /tmp/before /tmp/after
set -eu
out="${1:?usage: traces.sh <output-directory>}"
root=$(cd "$(dirname "$0")/.." && pwd)
bin=$(swift build --package-path "$root/app" --show-bin-path)
swift build --package-path "$root/app" >/dev/null
mkdir -p "$out"
MERCENARY_PAYLOAD="${MERCENARY_PAYLOAD:-$root/payload}"
export MERCENARY_PAYLOAD

run() {
  name=$1
  shift
  "$bin/Mercenary" "$@" > "$out/$name.txt" 2>&1
  printf '%s  %s\n' "$(shasum -a 256 < "$out/$name.txt" | cut -d' ' -f1)" "$name"
}

# The opening loop, three ways in: walking to the Dart and boarding it, answering
# the script's question by hand, and boarding by fiat.
run opening-walk-board --benson-trace --script 0 --seconds 240 --walk-to 1
run opening-press      --benson-trace --script 0 --seconds 240 --press any@2 --press y@6
run opening-board-fiat --benson-trace --script 0 --seconds 60  --board 1@3
# The control loop, with and without the poweramp that changes one craft's ceiling.
run flight-craft1      --flight-trace --craft 1 --notch 10 --seconds 30
run flight-poweramp    --flight-trace --craft 1 --notch 10 --seconds 30 --poweramp
