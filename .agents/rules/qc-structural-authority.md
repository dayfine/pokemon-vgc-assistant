---
name: qc-structural-authority
description: Project-specific structural-review authority for pokemon-vgc-assistant. Lists the lints, build/test gates, and architecture constraints that qc-structural enforces.
harness: project
---

# QC Structural Authority — pokemon-vgc-assistant

This file is the project-specific complement to `.agents/agents/qc-structural.md`.
The reusable agent file describes the *protocol* (when to run, how to format
findings, pass/fail logic). This file lists the concrete gates.

## Build + test gates

Every PR must pass on a clean checkout:

```sh
pnpm install --frozen-lockfile
pnpm -r build       # tsc --noEmit clean across all packages
pnpm -r test        # vitest run; all tests pass; no .skip / .only left in
pnpm lint           # biome check . — zero warnings, zero errors
```

A finding is structural if `pnpm -r build`, `pnpm -r test`, or `pnpm lint`
flags it. Anything one of those three commands does not catch belongs to
`qc-behavioral`.

## TypeScript settings — non-negotiable

`tsconfig.base.json` ships with these flags and they are not to be relaxed
on a per-package basis:

- `strict: true`
- `noUncheckedIndexedAccess: true`
- `noImplicitOverride: true`
- `exactOptionalPropertyTypes: true`
- `verbatimModuleSyntax: true`

Any `// @ts-expect-error` / `// @ts-ignore` requires a one-line comment
naming the underlying issue. Untagged suppressions are a structural finding.

## Lints — biome rules

`biome check .` from repo root must be clean. Project-specific overrides
to biome's recommended rules go in `biome.json`; do not silence rules
inline (`// biome-ignore`) without a one-line justification comment.

## Test conventions

- Test files live under `<package>/test/**/*.test.ts`.
- vitest inline snapshots are the pinning mechanism for known-value tests
  (e.g. damage calcs); update only when the underlying engine changes
  intentionally, never to silence a regression.
- No network calls, no real filesystem writes outside `os.tmpdir()`,
  no `Date.now()` without injection.

## Architecture rules (per `dev/plans/02-architecture.md`)

These are structural because the package layout enforces them:

1. **`engine` is pure.** It depends on no other workspace package. No
   `fs`, `net`, or `process` imports. Loading data happens once at
   startup via `engine/src/data.ts` and is passed in as arguments.
2. **`vision` and `priors` depend on `engine` for types only** — never
   for runtime imports. If a runtime call exists, that's a structural
   finding.
3. **`cli` is the only package that depends on all of `engine`,
   `vision`, `priors`.** `web` may also depend on those three.
4. **No hardcoded format ID outside of config or data files.** The
   string `gen9championsvgc2026regma` (and any future format ID) must
   not appear in `engine/src/calc.ts`, `engine/src/score.ts`, etc.
   Format flows in as a parameter.
5. **No magic numbers in scoring.** All weights live in `pva.config.ts`.

## PR sizing

- Soft cap: 500 LOC per PR (excluding generated files, test fixtures,
  plan/doc edits).
- Hard cap: 1000 LOC. Above that, qc-structural rejects on sizing alone.
- One module per PR is the preferred shape; module = `(src/foo.ts,
  test/foo.test.ts)` plus type additions.

## What qc-structural does NOT enforce

- Damage-calc correctness vs. Showdown — that is qc-behavioral's job
  (it requires domain knowledge).
- Whether a chosen scoring weight produces sensible BPs.
- Whether a fixture screenshot was extracted correctly.

When in doubt, hand the finding to qc-behavioral.
