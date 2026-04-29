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
const FACTS_SOURCE = readFileSync(
  join(REPO_ROOT, 'packages', 'recommender', 'src', 'facts.ts'),
  'utf8',
);

/**
 * Species referenced by `facts.ts` predicates. Cross-checked against the
 * M-A reference snapshot to catch typos or facts that reference banned /
 * unsupported species.
 *
 * Coverage policy (M6.5.1): predicates collectively reference ≥30 unique
 * M-A-legal species — see the `references ≥30 unique species` assertion
 * below.
 */
const SPECIES_USED = [
  'Aggron',
  'Amoonguss',
  'Annihilape',
  'Arcanine',
  'Baxcalibur',
  'Charizard',
  'Corviknight',
  'Dondozo',
  'Dragonite',
  'Excadrill',
  'Garchomp',
  'Gholdengo',
  'Gyarados',
  'Hatterene',
  'Hippowdon',
  'Hitmontop',
  'Hydreigon',
  'Incineroar',
  'Indeedee-F',
  'Kangaskhan',
  'Lucario',
  'Metagross',
  'Mienshao',
  'Milotic',
  'Ninetales',
  'Pelipper',
  'Porygon2',
  'Rillaboom',
  'Salamence',
  'Sinistcha',
  'Sneasler',
  'Tatsugiri',
  'Torkoal',
  'Tyranitar',
  'Volcarona',
  'Whimsicott',
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
  it('ships at least 30 hand-curated facts (M6.5.1 floor)', () => {
    // M6.5.0 floor was ≥10; M6.5.1 raises the bar to ≥30 to cover the
    // top-played M-A staples (redirection, weather, priority blocks,
    // item triggers, archetype recognition).
    expect(FACTS.length).toBeGreaterThanOrEqual(30);
  });

  it('references at least 30 unique M-A-legal species across predicates', () => {
    // M6.5.1 coverage assertion — the curated SPECIES_USED list is
    // updated in lock-step with new facts and validated for legality
    // below. A floor of 30 matches the design doc §"M6.5.1 — facts
    // expansion" target.
    expect(SPECIES_USED.length).toBeGreaterThanOrEqual(30);
    const uniq = new Set(SPECIES_USED);
    expect(uniq.size, 'SPECIES_USED contains duplicates').toBe(SPECIES_USED.length);

    // Every entry in SPECIES_USED should appear at least once in
    // facts.ts source — guards against the list drifting away from the
    // facts that actually reference these species.
    for (const species of SPECIES_USED) {
      expect(
        FACTS_SOURCE.includes(`'${species}'`),
        `species ${species} not referenced in facts.ts`,
      ).toBe(true);
    }
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

describe('selectFacts — format-rotation subsetting (M6.5.1)', () => {
  // The design doc §"M6.5.1 — facts expansion" calls for per-format
  // facts subsetting: a fact tagged `format: 'gen9championsvgc2026regmb'`
  // must not surface when querying for M-A and must surface (when its
  // predicate fires) for M-B.
  const M_B_ONLY_KEY = 'regmb-restricted-mega-list-stub';

  it('at least one fact is M-B-restricted', () => {
    const mbOnly = FACTS.filter((f) => f.format === 'gen9championsvgc2026regmb');
    expect(mbOnly.length).toBeGreaterThanOrEqual(1);
    expect(mbOnly.some((f) => f.key === M_B_ONLY_KEY)).toBe(true);
  });

  it('excludes M-B-only facts when format=gen9championsvgc2026regma', () => {
    const bundle = experimentBundle();
    const facts = selectFacts(bundle.myTeam, bundle.oppTeam, 'gen9championsvgc2026regma');
    const keys = new Set(facts.map((f) => f.key));
    expect(keys.has(M_B_ONLY_KEY)).toBe(false);
  });

  it('includes the M-B-only fact when format=gen9championsvgc2026regmb', () => {
    // The stub fact is `applies: () => true`, so it fires for any team
    // pairing under M-B — including the M-A experiment fixture (the
    // teams themselves are format-agnostic data; the format flag drives
    // which facts surface).
    const bundle = experimentBundle();
    const facts = selectFacts(bundle.myTeam, bundle.oppTeam, 'gen9championsvgc2026regmb');
    const keys = new Set(facts.map((f) => f.key));
    expect(keys.has(M_B_ONLY_KEY)).toBe(true);
  });

  it('format-agnostic facts surface under both M-A and M-B', () => {
    // Spot check: a fact with no `format` field should appear under both
    // formats (assuming its predicate fires). `incineroar-fake-out-
    // parting-shot` is unconditional given Incineroar on the team.
    const bundle = experimentBundle();
    const factsA = selectFacts(bundle.myTeam, bundle.oppTeam, 'gen9championsvgc2026regma');
    const factsB = selectFacts(bundle.myTeam, bundle.oppTeam, 'gen9championsvgc2026regmb');
    const keyA = new Set(factsA.map((f) => f.key));
    const keyB = new Set(factsB.map((f) => f.key));
    expect(keyA.has('incineroar-fake-out-parting-shot')).toBe(true);
    expect(keyB.has('incineroar-fake-out-parting-shot')).toBe(true);
  });
});

/**
 * Permissive plausibility check for species names — Title Case, optional
 * `-Form` suffix (single letter, word, or lowercase letter for the
 * Kommo-o / Jangmo-o style). The reference doc doesn't enumerate every
 * legal mon by name, so we fall back to a name-shape sanity check for
 * species that weren't named in prose.
 */
function isPlausibleMonName(name: string): boolean {
  // Title-case start, optionally followed by a digit (Porygon2) and / or
  // a `-suffix` (Indeedee-F, Landorus-Therian, Kommo-o). The dash-suffix
  // segment may be uppercase-or-lowercase to admit canonical names like
  // Kommo-o whose tail is a lowercase 'o'.
  return /^[A-Z][a-zA-Z]+\d?(-[A-Za-z][a-zA-Z]*)?$/.test(name);
}
