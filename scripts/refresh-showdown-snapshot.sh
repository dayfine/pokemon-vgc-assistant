#!/usr/bin/env bash
# Refresh data/showdown-snapshot/ from smogon/pokemon-showdown.
#
# Pins to the SHA in data/showdown-snapshot/PINNED_COMMIT.txt by default.
# Override with: SHOWDOWN_SHA=<sha-or-ref> ./scripts/refresh-showdown-snapshot.sh
#
# Manual cadence — Champions data does not change daily and surprise
# upstream churn shouldn't break our CI. Refresh deliberately when
# M-B research lands or upstream announces a learnset change.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SNAPSHOT_DIR="$REPO_ROOT/data/showdown-snapshot"
PIN_FILE="$SNAPSHOT_DIR/PINNED_COMMIT.txt"
DEFAULT_SHA="$(cat "$PIN_FILE" 2>/dev/null || echo "master")"
SHA="${SHOWDOWN_SHA:-$DEFAULT_SHA}"
REPO="${SHOWDOWN_REPO:-https://github.com/smogon/pokemon-showdown}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "==> Cloning $REPO at $SHA into $WORK"
git clone --quiet "$REPO" "$WORK/showdown"
git -C "$WORK/showdown" checkout --quiet "$SHA"
RESOLVED_SHA="$(git -C "$WORK/showdown" rev-parse HEAD)"
echo "==> Resolved to $RESOLVED_SHA"

# Files we vendor. Mod is at data/mods/champions/ (not gen9champions/);
# Champions inherits the base pokedex.ts unchanged so we don't vendor a
# mod-overlay pokedex.
BASE_FILES=(learnsets.ts pokedex.ts items.ts formats-data.ts)
MOD_FILES=(learnsets.ts items.ts formats-data.ts moves.ts)

mkdir -p "$SNAPSHOT_DIR/base" "$SNAPSHOT_DIR/champions"

# Strip the `: import('...').FooDataTable` type annotations so the file
# is standalone-loadable. We don't ship the Showdown sim package, so
# tsc would fail to resolve the import. The data shape is the same;
# we lose only the static type info, which we re-impose in the loader.
strip_types() {
  local src="$1" dst="$2"
  # Replace `: import('...').<...>` (one or more dotted identifiers)
  # with `: any`. The match is greedy across one line; Showdown's
  # files keep the annotation on the `export const` line.
  sed -E "s|: import\(['\"][^'\"]+['\"]\)\.[A-Za-z0-9_.]+|: any|g" "$src" > "$dst"
}

for f in "${BASE_FILES[@]}"; do
  strip_types "$WORK/showdown/data/$f" "$SNAPSHOT_DIR/base/$f"
  echo "==> base/$f"
done

for f in "${MOD_FILES[@]}"; do
  strip_types "$WORK/showdown/data/mods/champions/$f" "$SNAPSHOT_DIR/champions/$f"
  echo "==> champions/$f"
done

printf '%s\n' "$RESOLVED_SHA" > "$PIN_FILE"
echo "==> Pinned $PIN_FILE -> $RESOLVED_SHA"
echo "==> Done. Review with: git diff $SNAPSHOT_DIR"
