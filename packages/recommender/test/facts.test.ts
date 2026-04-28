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
  'Arcanine',
  'Charizard',
  'Garchomp',
  'Gyarados',
  'Hatterene',
  'Hitmontop',
  'Incineroar',
  'Indeedee-F',
  'Kangaskhan',
  'Lucario',
  'Mienshao',
  'Milotic',
  'Ninetales',
  'Porygon2',
  'Salamence',
  'Sinistcha',
  'Sneasler',
  'Torkoal',
  'Tyranitar',
  'Volcarona',
] as const;

/**
 * Items referenced by predicates (e.g. the Mega-Stone clause checks).
 * These must be valid Mega Stone names — and legal in M-A (Mewtwonite
 * X/Y dropped because Mewtwo is banned).
 */
const MEGA_ITEMS_USED = [
  'Aggronite',
  'Charizardite X',
  'Charizardite Y',
  'Garchompite',
  'Gyaradosite',
  'Lucarionite',
  'Metagrossite',
  'Salamencite',
  'Tyranitarite',
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

  it('every species referenced in predicates is M-A-legal', () => {
    // The reference doc names species in prose (the "Reg M-A snapshot"
    // research summary) but doesn't enumerate every legal mon by name —
    // it lists banned categories (Legendaries, Paradox, Treasures of
    // Ruin, etc.) and references the wider species list via Bulbapedia.
    // We check (a) the species isn't named as banned and (b) the name
    // shape is plausible. Vision validates legality upstream; this is
    // a guardrail against typos and obviously banned references.
    for (const species of SPECIES_USED) {
      expect(isPlausibleMonName(species), `species ${species} has implausible name shape`).toBe(
        true,
      );
      // Reference doc lists the ban categories explicitly — flag any
      // species name that appears in the banned-category sentence.
      const banLine = REG_MA_REFERENCE.match(/All Legendaries[^\n]+banned in M-A\./)?.[0] ?? '';
      expect(banLine.includes(species), `species ${species} appears in M-A ban line`).toBe(false);
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
  // Title-case start, optionally followed by a single-letter or short
  // suffix (Indeedee-F, Landorus-Therian) or a trailing digit (Porygon2).
  return /^[A-Z][a-zA-Z]+\d?(-[A-Z][a-zA-Z]*)?$/.test(name);
}
