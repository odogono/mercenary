#!/bin/sh
# Prepare a checkout to run the app, the tests and the research labs: link the
# gitignored Restricted Material and lab artifacts to the main checkout, install
# web dependencies, and install the repository's git hooks. Safe to re-run.
set -eu

top=$(git rev-parse --show-toplevel)
main=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
cd "$top"

warn() { echo "worktree-setup: $*" >&2; }

# Point $1 at the same path in the main checkout.
link() {
  path=$1
  target="$main/$path"
  [ -e "$target" ] || { warn "skip $path: not in $main"; return; }
  if [ -L "$path" ] || [ ! -e "$path" ]; then
    mkdir -p "$(dirname "$path")"
    ln -sfn "$target" "$path"
  else
    warn "skip $path: a real directory is in the way"
  fi
}

if [ "$top" != "$main" ]; then
  # Restricted Material lives in the main checkout so deleting a worktree cannot
  # strand evidence. Move anything only this worktree holds there first.
  if [ -d restricted ] && [ ! -L restricted ]; then
    for entry in restricted/* restricted/.[!.]*; do
      [ -e "$entry" ] || [ -L "$entry" ] || continue
      name=${entry#restricted/}
      if [ -L "$entry" ]; then
        rm "$entry"
      elif [ -e "$main/restricted/$name" ]; then
        warn "keep restricted/: $name is also in $main/restricted; merge it by hand"
        continue
      else
        mv "$entry" "$main/restricted/$name"
        echo "moved restricted/$name to $main/restricted/"
      fi
    done
    rmdir restricted 2>/dev/null || true
  fi

  for path in restricted roms \
    research/damocles-st/work research/damocles-st/.venv \
    research/damocles-st/snapshots/rehosted \
    research/c64-reference-build/work research/c64-reference-build/.venv; do
    link "$path"
  done

  # Most Damocles snapshots are ignored *.sav files beside a few tracked ones.
  for save in "$main"/research/damocles-st/snapshots/*.sav; do
    path=${save#"$main"/}
    [ -e "$path" ] || ln -s "$save" "$path"
  done
fi

git config core.hooksPath .githooks
(cd web && bun install)
