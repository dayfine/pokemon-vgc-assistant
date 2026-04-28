# data/

Top-level data directory per `dev/plans/02-architecture.md`.

## Layout

```
data/
  cache/      # local cache of priors JSON, threshold cache, etc. — gitignored
  fixtures/   # test fixtures: screenshots, expected JSON, hand-curated samples
```

## `cache/`

Created lazily at runtime by `packages/priors/src/cache.ts` and the M4.5
threshold cache. Gitignored via `.gitignore` line `data/cache/`.

## `fixtures/`

Committed. Holds:

- M5 vision screenshots (Switch team-preview captures + their golden
  expected JSON).
- Other hand-curated samples that need to round-trip through tests.

Pikalytics Markdown fixtures live with their consumer at
`packages/priors/test/fixtures/pikalytics/` rather than here, since they
are scoped to one package's test suite. Multi-package fixtures (e.g. an
end-to-end ranked-game screenshot that vision parses, priors enriches,
and engine ranks) belong here.
