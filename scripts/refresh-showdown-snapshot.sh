#!/usr/bin/env bash
# Refresh packages/showdown-data/snapshot/ from smogon/pokemon-showdown.
#
# Pins to the SHA in packages/showdown-data/snapshot/PINNED_COMMIT.txt by default.
# Override with: SHOWDOWN_SHA=<sha-or-ref> ./scripts/refresh-showdown-snapshot.sh
#
# Manual cadence — Champions data does not change daily and surprise
# upstream churn shouldn't break our CI. Refresh deliberately when
# M-B research lands or upstream announces a learnset change.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SNAPSHOT_DIR="$REPO_ROOT/packages/showdown-data/snapshot"
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

# Files we vendor. Mod is at upstream `data/mods/champions/`; we land it
# locally at `packages/showdown-data/snapshot/gen9champions/` to match the mod-ID
# naming used in format strings (`gen9championsvgc2026regma`) — Showdown
# generates the `gen9` prefix from the mod's manifest, the on-disk dir
# is just `champions/`. Champions inherits the base pokedex.ts unchanged
# so we don't vendor a mod-overlay pokedex.
BASE_FILES=(learnsets.ts pokedex.ts items.ts formats-data.ts)
MOD_FILES=(learnsets.ts items.ts formats-data.ts moves.ts)

mkdir -p "$SNAPSHOT_DIR/base" "$SNAPSHOT_DIR/gen9champions"

# Strip the `: import('...').FooDataTable` type annotations and prepend
# `// @ts-nocheck` so the file is standalone-loadable.
#
# - We don't ship the Showdown sim package, so tsc would fail to resolve
#   the type import. Stripping it leaves the data shape untouched; we
#   re-impose types at the seams in `src/index.ts`.
# - Some entries (e.g. `items.ts`'s `whiteherb` hooks, `moves.ts`
#   `onModifyMove` callbacks) carry runtime function bodies that
#   reference Showdown sim types (`Pokemon`, `Move`, `this.queue`,
#   `this.effectState`). Under our strict / `noImplicitAny` config those
#   bodies don't typecheck even with the surrounding `: any` annotation.
#   We don't call any of them — the loader only reads static fields —
#   so disabling type-checking on the file is the right escape hatch.
strip_types() {
  local src="$1" dst="$2"
  # 1. Replace `: import('...').<...>` with `: any` so the data shape
  #    type compiles without the Showdown sim package.
  # 2. Prepend `// @ts-nocheck` so runtime hook bodies inside data
  #    entries don't trip strict-mode checks. Vendored data — not our
  #    code to type.
  {
    printf '// @ts-nocheck — vendored Showdown data; runtime hooks reference sim-only types we do not ship.\n'
    sed -E "s|: import\(['\"][^'\"]+['\"]\)\.[A-Za-z0-9_.]+|: any|g" "$src"
  } > "$dst"
}

for f in "${BASE_FILES[@]}"; do
  strip_types "$WORK/showdown/data/$f" "$SNAPSHOT_DIR/base/$f"
  echo "==> base/$f"
done

for f in "${MOD_FILES[@]}"; do
  strip_types "$WORK/showdown/data/mods/champions/$f" "$SNAPSHOT_DIR/gen9champions/$f"
  echo "==> gen9champions/$f"
done

printf '%s\n' "$RESOLVED_SHA" > "$PIN_FILE"
echo "==> Pinned $PIN_FILE -> $RESOLVED_SHA"
echo "==> Done. Review with: git diff $SNAPSHOT_DIR"
