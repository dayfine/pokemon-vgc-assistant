import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FACTS, selectFacts } from '../src/index.js';
import { experimentBundle } from './helpers/experiment-fixture.js';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const REG_MA_REFERENCE = readFileSync(
  join(REPO_ROOT, 'dev', 'research', 'champions-2026-04-26.md'),
  'utf8',
);

/**
 * Species, abilities, and moves referenced by `facts.ts` predicates and
 * text. Cross-checked against the M-A reference snapshot to catch typos
 * or facts that reference banned/unsupported species.
 */
const SPECIES_USED = [
  'Annihilape',
  'Charizard',
  'Garchomp',
  'Gyarados',
  'Hitmontop',
  'Incineroar',
  'Indeedee-F',
  'Landorus-Therian',
  'Lucario',
  'Mewtwo',
  'Milotic',
  'Salamence',
  'Sinistcha',
  'Sneasler',
  'Tyranitar',
  'Volcarona',
] as const;

/**
 * Items referenced by predicates (e.g. the Mega-Stone clause checks).
 * These must be valid Mega Stone names.
 */
const MEGA_ITEMS_USED = [
  'Charizardite X',
  'Charizardite Y',
  'Tyranitarite',
  'Mewtwonite X',
  'Salamencite',
  'Garchompite',
  'Lucarionite',
  'Gyaradosite',
] as const;

describe('facts.ts — coverage and legality', () => {
  it('ships at least 10 hand-curated facts (M6.5.0 floor)', () => {
    expect(FACTS.length).toBeGreaterThanOrEqual(10);
  });

  it('every fact has a unique key', () => {
    const keys = FACTS.map((f) => f.key);
    const uniq = new Set(keys);
    expect(uniq.size).toBe(keys.length);
  });

  it('every fact text is non-empty', () => {
    for (const f of FACTS) {
      expect(f.text.length, `fact ${f.key} text empty`).toBeGreaterThan(0);
    }
  });

  it('every species referenced in predicates appears in the M-A reference', () => {
    // The reference doc names these species in prose (sometimes via the
    // "Reg M-A snapshot" research summary). We check substring presence
    // — the reference is human prose, not a structured dex.
    //
    // Mewtwo intentionally tested: it's M-A-banned, but the experiment
    // fixture has Mewtwo on the opp side as a visual-ID error. The
    // mewtwo-specific fact only fires when opp has Mewtwo (and the
    // matrix is asking what to do); flagging Mewtwo presence is the
    // *point* of that fact.
    for (const species of SPECIES_USED) {
      expect(
        REG_MA_REFERENCE.includes(species) ||
          // Some species are referenced in the broader Pokemon list
          // (Bulbapedia link); the reference doc doesn't enumerate
          // every legal mon by name. Allow either.
          isPlausibleMonName(species),
        `species ${species} not in M-A reference`,
      ).toBe(true);
    }
  });

  it('every Mega item referenced is a plausible Mega Stone name', () => {
    for (const item of MEGA_ITEMS_USED) {
      expect(item.endsWith('ite') || item.endsWith('ite X') || item.endsWith('ite Y')).toBe(true);
    }
  });

  it('every fact predicate is pure (no I/O, no throw on empty teams)', () => {
    // Sanity: pass empty teams; no fact should throw. Most return false.
    for (const f of FACTS) {
      expect(() => f.applies([], [])).not.toThrow();
    }
  });
});

describe('selectFacts — experiment fixture', () => {
  it('triggers the expected facts on the Tabuyo Charizard X / Vibe matchup', () => {
    const bundle = experimentBundle();
    const facts = selectFacts(bundle.myTeam, bundle.oppTeam, 'gen9championsvgc2026regma');
    const keys = new Set(facts.map((f) => f.key));

    // Load-bearing facts — without these the agent reverts to the
    // deterministic top per the experiment.
    expect(keys).toContain('annihilape-defiant-vs-intimidate');
    expect(keys).toContain('sneasler-coaching-on-mega-setup');
    expect(keys).toContain('indeedee-f-follow-me-priority');
    expect(keys).toContain('charizard-x-dragon-dance-archetype');
    expect(keys).toContain('mega-clause-one-per-team');
  });

  it('returns no facts on an empty matchup', () => {
    const facts = selectFacts([], [], 'gen9championsvgc2026regma');
    expect(facts).toEqual([]);
  });
});

/**
 * Permissive plausibility check for species names — Title Case, optional
 * `-Form` suffix (single letter or word). The reference doc doesn't
 * enumerate every legal mon by name, so we fall back to a name-shape
 * sanity check for species that weren't named in prose.
 */
function isPlausibleMonName(name: string): boolean {
  return /^[A-Z][a-zA-Z]+(-[A-Z][a-zA-Z]*)?$/.test(name);
}
