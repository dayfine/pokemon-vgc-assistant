import type { Format, TeamSet } from '@pva/engine';

/**
 * Hand-curated tactical fact, slotted into the prompt's "Strategic notes"
 * section when `applies(myTeam, oppTeam)` returns true.
 *
 * Per the 2026-04-28 experiment, this section is **load-bearing**: without
 * the facts the agent reverted to the deterministic top. Facts encode
 * domain knowledge the matrix can't represent — Defiant + Intimidate
 * interaction, Coaching's role on Mega DD setups, redirection scope, etc.
 *
 * Coverage policy: M6.5.0 ships ≥10 facts spanning M-A's top-played
 * species (Sneasler, Annihilape, Indeedee-F, Incineroar, Charizard X,
 * Sinistcha, Tyranitar, Milotic, Volcarona, Garchomp). M6.5.1 expands
 * to ≥30. PRs that add facts are routine maintenance and don't count
 * against architecture review.
 *
 * Legality: every species/ability/move/item referenced here must be
 * legal in Reg M-A (per `dev/research/champions-2026-04-26.md`). All
 * Legendaries are banned in M-A — that excludes Mewtwo, the Forces of
 * Nature (Landorus-Therian etc.), the Tapus, Cresselia, and others.
 * Predicates referencing banned mons are dead branches; vision validates
 * legality upstream so they can never fire on real input.
 */
export interface Fact {
  readonly key: string;
  /** Pure predicate — only reads species names; no I/O. */
  readonly applies: (myTeam: TeamSet, oppTeam: TeamSet) => boolean;
  /** 1-3 sentences. Slotted into prompt §4 verbatim. */
  readonly text: string;
  /** Restrict to a specific format if the fact is meta-dependent. */
  readonly format?: Format;
}

/**
 * Read the species name from a calc Pokemon, normalizing to a string.
 * The calc layer surfaces species via `pokemon.name` (Showdown-canonical).
 */
function speciesNamesIn(team: TeamSet): ReadonlySet<string> {
  return new Set(team.map((p) => p.name));
}

function teamHas(team: TeamSet, species: string): boolean {
  return speciesNamesIn(team).has(species);
}

function teamHasAny(team: TeamSet, species: readonly string[]): boolean {
  const set = speciesNamesIn(team);
  return species.some((s) => set.has(s));
}

/**
 * Curated v1 facts. Order is stable so prompt snapshots are deterministic.
 *
 * Predicate convention: trigger when the *interaction* is live — i.e. one
 * side has the relevant kit and the other side has something to interact
 * with. Pure species checks where ability/move presence is implied by
 * common builds (e.g. Annihilape almost always runs Defiant).
 */
export const FACTS: readonly Fact[] = [
  {
    key: 'annihilape-defiant-vs-intimidate',
    applies: (myTeam, oppTeam) =>
      teamHas(oppTeam, 'Annihilape') &&
      teamHasAny(myTeam, ['Incineroar', 'Salamence', 'Arcanine', 'Hitmontop']),
    text: 'Annihilape commonly runs Defiant — DO NOT bring Intimidate users into it; Intimidate triggers Defiant for +2 Attack and snowballs Rage Fist.',
  },
  {
    key: 'milotic-competitive-vs-intimidate',
    applies: (myTeam, oppTeam) =>
      teamHas(myTeam, 'Milotic') &&
      teamHasAny(oppTeam, ['Incineroar', 'Arcanine', 'Salamence', 'Hitmontop']),
    text: 'Milotic Competitive turns opp Intimidate into a +2 Special Attack boost — incentivizes leading Milotic into Intimidate-heavy opp leads.',
  },
  {
    key: 'sneasler-coaching-on-mega-setup',
    applies: (myTeam) =>
      teamHas(myTeam, 'Sneasler') &&
      teamHasAny(myTeam, [
        'Charizard',
        'Tyranitar',
        'Salamence',
        'Garchomp',
        'Lucario',
        'Gyarados',
      ]),
    text: "Sneasler Coaching gives an ally +1 Attack / +1 Defense — the standard 3-turn setup pattern is Fake Out → Coaching → Dragon Dance / setup move on a Mega-evolved partner. Coaching's +1 Defense materially shifts physical OHKO thresholds (e.g. Garchomp Stone Edge into +1 Charizard X drops from guaranteed to rollable).",
  },
  {
    key: 'indeedee-f-follow-me-priority',
    applies: (_myTeam, oppTeam) => teamHas(oppTeam, 'Indeedee-F'),
    text: "Indeedee-F's Follow Me redirects single-target moves and eats setup turns. Removing or KOing Indeedee-F early is usually higher priority than the score-baseline target — tempo matters more than KO efficiency.",
  },
  {
    key: 'sinistcha-rage-powder-redirection',
    applies: (myTeam) => teamHas(myTeam, 'Sinistcha'),
    text: "Sinistcha's Rage Powder redirects opp single-target moves to itself, protecting a setup partner (e.g. DD Charizard) on the turn it sets up. Rage Powder fails against Grass-types, Overcoat holders, and Safety Goggles users — note any of those on the opp team before relying on it.",
  },
  {
    key: 'incineroar-fake-out-parting-shot',
    applies: (myTeam) => teamHas(myTeam, 'Incineroar'),
    text: "Incineroar's Fake Out + Intimidate combo provides one free turn of disruption + a -1 Attack debuff on both opp leads. Parting Shot is the standard pivot move; bringing Incineroar usually means leading Incineroar.",
  },
  {
    key: 'mega-clause-one-per-team',
    applies: (myTeam) => {
      // Multiple Mega items on the same team is an architecture flag for
      // the agent: only one can Mega-evolve per battle, so bringing two
      // means one is dead weight.
      const megaItems = new Set([
        'Charizardite X',
        'Charizardite Y',
        'Tyranitarite',
        'Salamencite',
        'Garchompite',
        'Lucarionite',
        'Gyaradosite',
        'Aggronite',
        'Metagrossite',
      ]);
      let count = 0;
      for (const p of myTeam) {
        if (typeof p.item === 'string' && megaItems.has(p.item)) count += 1;
      }
      return count >= 2;
    },
    text: 'Multiple Mega Stones on this team — only one Pokemon can Mega-evolve per battle (one-Mega-per-team rule). Bringing two Mega-stone holders means one is dead weight; pick the matchup-dominant Mega.',
  },
  {
    key: 'tyranitar-sand-stream-team-impact',
    applies: (myTeam, oppTeam) =>
      teamHas(myTeam, 'Tyranitar') &&
      teamHasAny(oppTeam, ['Volcarona', 'Charizard', 'Salamence', 'Dragonite', 'Gyarados']),
    text: "Tyranitar's Sand Stream chips non-Rock/Ground/Steel mons each turn (1/16 HP) and disables Sitrus Berry / Leftovers timing for the opp side. Useful pressure vs. Volcarona / Charizard but check whether your own Mega Charizard-X is on the team — sand chip applies to him too unless he's Mega-evolved (Tough Claws unaffected, but residual is real).",
  },
  {
    key: 'trick-room-flip-fallback',
    applies: (myTeam) => teamHasAny(myTeam, ['Sinistcha', 'Hatterene', 'Porygon2']),
    text: 'Trick Room reverses turn order for 5 turns — the slowest mon moves first. Common as a Plan B when the fast lead pair is unfavorable; lead the TR setter + a slow attacker (or Fake Out user to buy a turn).',
  },
  {
    key: 'volcarona-sun-setup-warning',
    applies: (_myTeam, oppTeam) =>
      teamHas(oppTeam, 'Volcarona') && teamHasAny(oppTeam, ['Charizard', 'Torkoal', 'Ninetales']),
    text: 'Opp Volcarona + sun setter is a Quiver Dance win condition — under sun, Heat Wave / Fiery Dance damage spikes and Volcarona shrugs off priority. Pressure Volcarona before it gets a Quiver Dance off; Rock-type priority (Rock Slide / Stone Edge) is the standard answer.',
  },
  {
    key: 'charizard-x-dragon-dance-archetype',
    applies: (myTeam) =>
      teamHas(myTeam, 'Charizard') &&
      myTeam.some((p) => p.name === 'Charizard' && p.item === 'Charizardite X'),
    text: 'Mega Charizard-X with Dragon Dance is a classic +1 sweeper archetype — the win condition is to set up one DD behind a Fake Out / redirection / Coaching screen, then sweep with Flare Blitz / Dragon Claw. Tactically prefer brings that protect the DD turn over brings that maximize trade efficiency.',
  },
  {
    key: 'fake-out-stack-disruption',
    applies: (myTeam) => {
      const fakeOutUsers = ['Incineroar', 'Sneasler', 'Mienshao', 'Hitmontop', 'Kangaskhan'];
      let count = 0;
      for (const p of myTeam) {
        if (fakeOutUsers.includes(p.name)) count += 1;
      }
      return count >= 2;
    },
    text: 'Two Fake Out users on the team = consecutive turns of single-mon disruption. The second Fake Out fires turn 2 (Fake Out flag resets when a mon switches in), so the standard line is Fake Out lead → Fake Out partner switches in → second Fake Out on turn 2.',
  },
];

/**
 * Select facts that apply to the given (myTeam, oppTeam) pairing and
 * format. Pure; no I/O. Order preserved from the source `FACTS` array
 * so prompt snapshots stay deterministic.
 */
export function selectFacts(myTeam: TeamSet, oppTeam: TeamSet, format: Format): readonly Fact[] {
  return FACTS.filter((f) => {
    if (f.format !== undefined && f.format !== format) return false;
    return f.applies(myTeam, oppTeam);
  });
}
