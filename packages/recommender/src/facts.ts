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
/**
 * Machine-checkable assertion riding alongside a fact. The M6.5.3 facts
 * data gate iterates `claims` × the vendored Showdown-Champions snapshot
 * to verify every species/move/ability/item reference matches authority.
 *
 * Predicates stay in `applies` closures (flexibility for non-list
 * triggers like team-comp gates `Tatsugiri + Dondozo`); claims are pure
 * data, validated separately. A fact may carry zero or more claims —
 * pure-prose facts with no machine-checkable assertions omit the field.
 *
 * Display-name conventions match the rest of the recommender (`'Indeedee-F'`,
 * `'Helping Hand'`, `'Salamencite'`); the gate canonicalizes via
 * Showdown's `toID` at check time.
 */
export interface FactClaim {
  /** Species the claim is about. Each must individually satisfy the move/ability/item check. */
  readonly species: readonly string[];
  /** Move the species must learn under gen-9 rules. */
  readonly move?: string;
  /** Ability the species must have in some slot (0/1/H/S). */
  readonly ability?: string;
  /** Item that must exist in the items table; if a Mega Stone, must Mega-evolve one of `species`. */
  readonly item?: string;
}

export interface Fact {
  readonly key: string;
  /** Pure predicate — only reads species names; no I/O. */
  readonly applies: (myTeam: TeamSet, oppTeam: TeamSet) => boolean;
  /** 1-3 sentences. Slotted into prompt §4 verbatim. */
  readonly text: string;
  /** Restrict to a specific format if the fact is meta-dependent. */
  readonly format?: Format;
  /**
   * Machine-checkable assertions. Verified at CI by the M6.5.3 facts
   * data gate. Fact migration to populate `claims` lands in a follow-up
   * PR; this field is optional during the rollout.
   */
  readonly claims?: readonly FactClaim[];
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

function teamHasItem(team: TeamSet, item: string): boolean {
  return team.some((p) => p.item === item);
}

function teamHasAnyItem(team: TeamSet, items: readonly string[]): boolean {
  return team.some((p) => typeof p.item === 'string' && items.includes(p.item));
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
    claims: [
      { species: ['Annihilape'], ability: 'Defiant' },
      { species: ['Incineroar', 'Salamence', 'Arcanine', 'Hitmontop'], ability: 'Intimidate' },
    ],
  },
  {
    key: 'milotic-competitive-vs-intimidate',
    applies: (myTeam, oppTeam) =>
      teamHas(myTeam, 'Milotic') &&
      teamHasAny(oppTeam, ['Incineroar', 'Arcanine', 'Salamence', 'Hitmontop']),
    text: 'Milotic Competitive turns opp Intimidate into a +2 Special Attack boost — incentivizes leading Milotic into Intimidate-heavy opp leads.',
    claims: [
      { species: ['Milotic'], ability: 'Competitive' },
      { species: ['Incineroar', 'Arcanine', 'Salamence', 'Hitmontop'], ability: 'Intimidate' },
    ],
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
    claims: [{ species: ['Sneasler'], move: 'Coaching' }],
  },
  {
    key: 'indeedee-f-follow-me-priority',
    applies: (_myTeam, oppTeam) => teamHas(oppTeam, 'Indeedee-F'),
    text: "Indeedee-F's Follow Me redirects single-target moves and eats setup turns. Removing or KOing Indeedee-F early is usually higher priority than the score-baseline target — tempo matters more than KO efficiency.",
    claims: [{ species: ['Indeedee-F'], move: 'Follow Me' }],
  },
  {
    key: 'sinistcha-rage-powder-redirection',
    applies: (myTeam) => teamHas(myTeam, 'Sinistcha'),
    text: "Sinistcha's Rage Powder redirects opp single-target moves to itself, protecting a setup partner (e.g. DD Charizard) on the turn it sets up. Rage Powder fails against Grass-types, Overcoat holders, and Safety Goggles users — note any of those on the opp team before relying on it.",
    claims: [{ species: ['Sinistcha'], move: 'Rage Powder' }],
  },
  {
    key: 'incineroar-fake-out-parting-shot',
    applies: (myTeam) => teamHas(myTeam, 'Incineroar'),
    text: "Incineroar's Fake Out + Intimidate combo provides one free turn of disruption + a -1 Attack debuff on both opp leads. Parting Shot is the standard pivot move; bringing Incineroar usually means leading Incineroar.",
    claims: [
      { species: ['Incineroar'], move: 'Fake Out' },
      { species: ['Incineroar'], move: 'Parting Shot' },
      { species: ['Incineroar'], ability: 'Intimidate' },
    ],
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
    claims: [
      { species: ['Charizard'], item: 'Charizardite X' },
      { species: ['Charizard'], item: 'Charizardite Y' },
      { species: ['Tyranitar'], item: 'Tyranitarite' },
      { species: ['Salamence'], item: 'Salamencite' },
      { species: ['Garchomp'], item: 'Garchompite' },
      { species: ['Lucario'], item: 'Lucarionite' },
      { species: ['Gyarados'], item: 'Gyaradosite' },
      { species: ['Aggron'], item: 'Aggronite' },
      { species: ['Metagross'], item: 'Metagrossite' },
    ],
  },
  {
    key: 'tyranitar-sand-stream-team-impact',
    applies: (myTeam, oppTeam) =>
      teamHas(myTeam, 'Tyranitar') &&
      teamHasAny(oppTeam, ['Volcarona', 'Charizard', 'Salamence', 'Dragonite', 'Gyarados']),
    text: "Tyranitar's Sand Stream chips non-Rock/Ground/Steel mons each turn (1/16 HP) and disables Sitrus Berry / Leftovers timing for the opp side. Useful pressure vs. Volcarona / Charizard but check whether your own Mega Charizard-X is on the team — sand chip applies to him too unless he's Mega-evolved (Tough Claws unaffected, but residual is real).",
    claims: [{ species: ['Tyranitar'], ability: 'Sand Stream' }],
  },
  {
    key: 'trick-room-flip-fallback',
    applies: (myTeam) => teamHasAny(myTeam, ['Sinistcha', 'Hatterene', 'Porygon2']),
    text: 'Trick Room reverses turn order for 5 turns — the slowest mon moves first. Common as a Plan B when the fast lead pair is unfavorable; lead the TR setter + a slow attacker (or Fake Out user to buy a turn).',
    claims: [{ species: ['Sinistcha', 'Hatterene', 'Porygon2'], move: 'Trick Room' }],
  },
  {
    key: 'volcarona-sun-setup-warning',
    applies: (_myTeam, oppTeam) =>
      teamHas(oppTeam, 'Volcarona') && teamHasAny(oppTeam, ['Charizard', 'Torkoal', 'Ninetales']),
    text: 'Opp Volcarona + sun setter is a Quiver Dance win condition — under sun, Heat Wave / Fiery Dance damage spikes and Volcarona shrugs off priority. Pressure Volcarona before it gets a Quiver Dance off; Rock-type priority (Rock Slide / Stone Edge) is the standard answer.',
    claims: [
      { species: ['Volcarona'], move: 'Quiver Dance' },
      { species: ['Torkoal', 'Ninetales'], ability: 'Drought' },
    ],
  },
  {
    key: 'charizard-x-dragon-dance-archetype',
    applies: (myTeam) =>
      teamHas(myTeam, 'Charizard') &&
      myTeam.some((p) => p.name === 'Charizard' && p.item === 'Charizardite X'),
    text: 'Mega Charizard-X with Dragon Dance is a classic +1 sweeper archetype — the win condition is to set up one DD behind a Fake Out / redirection / Coaching screen, then sweep with Flare Blitz / Dragon Claw. Tactically prefer brings that protect the DD turn over brings that maximize trade efficiency.',
    claims: [
      { species: ['Charizard'], move: 'Dragon Dance' },
      { species: ['Charizard'], item: 'Charizardite X' },
    ],
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
    claims: [
      {
        species: ['Incineroar', 'Sneasler', 'Mienshao', 'Hitmontop', 'Kangaskhan'],
        move: 'Fake Out',
      },
    ],
  },
  // --- M6.5.1 expansion below: tactical-interaction facts spanning more
  // M-A staples (redirection, weather, priority blocks, item triggers,
  // archetype recognition). Every species/ability/move/item is M-A-legal
  // per `dev/research/champions-2026-04-26.md` (Legendaries / Paradox /
  // Treasures of Ruin / sleep-inducing moves all banned, so none appear
  // below).
  {
    key: 'rillaboom-grassy-surge-team-impact',
    applies: (myTeam, oppTeam) => teamHas(myTeam, 'Rillaboom') || teamHas(oppTeam, 'Rillaboom'),
    text: "Rillaboom's Grassy Surge sets Grassy Terrain — grounded mons recover 1/16 HP/turn, Grass-move power +30%, and Earthquake / Magnitude / Bulldoze damage halved. Grassy Glide gains +1 priority on Rillaboom, beating most non-priority spread answers. Track who is grounded (Levitate / Flying-types ignore the recovery) when planning EQ-based offence.",
    claims: [{ species: ['Rillaboom'], ability: 'Grassy Surge' }],
  },
  {
    key: 'amoonguss-redirection-anti-goggles',
    applies: (_myTeam, oppTeam) => teamHas(oppTeam, 'Amoonguss'),
    text: 'Opp Amoonguss redirects single-target moves with Rage Powder and trades chip via Pollen Puff (heals ally) / Clear Smog (resets stat boosts). Rage Powder fails against Grass-types, Overcoat holders, and Safety Goggles users — bringing one of those bypasses the redirection layer entirely.',
    claims: [{ species: ['Amoonguss'], move: 'Rage Powder' }],
  },
  {
    key: 'whimsicott-prankster-tailwind',
    applies: (myTeam) => teamHas(myTeam, 'Whimsicott'),
    text: "Whimsicott's Prankster gives status moves +1 priority — Tailwind lands turn 1 (4 turns of doubled Speed for the team), Encore locks an opp into their last move for 3 turns, Beat Up triggers Justified ally boosts. Prankster status moves fail against Dark-types, so check the opp board for a Dark before relying on Prankster Encore.",
    claims: [
      { species: ['Whimsicott'], ability: 'Prankster' },
      { species: ['Whimsicott'], move: 'Tailwind' },
      { species: ['Whimsicott'], move: 'Encore' },
    ],
  },
  {
    key: 'pelipper-drizzle-rain-stack',
    applies: (myTeam, oppTeam) => teamHas(myTeam, 'Pelipper') || teamHas(oppTeam, 'Pelipper'),
    text: "Pelipper's Drizzle sets rain on switch-in — Water moves +50% / Fire moves -50%, Hurricane becomes 100% accurate, Thunder becomes 100% accurate, Swift Swim sweepers (Kingdra, Barraskewda, Mega Feraligatr) double their Speed. The rain stack's win condition is one Pelipper turn followed by a fast Water-spam partner; cutting the rain (Tyranitar Sand Stream, Torkoal Drought) flips the matchup.",
    claims: [{ species: ['Pelipper'], ability: 'Drizzle' }],
  },
  {
    key: 'gholdengo-good-as-gold-blocks-status',
    applies: (_myTeam, oppTeam) => teamHas(oppTeam, 'Gholdengo'),
    text: "Opp Gholdengo's Good as Gold blocks every status move targeting it — Will-O-Wisp, Thunder Wave, Encore, Taunt, Trick, Helping Hand (when targeted), Follow Me redirection past it. Bring damaging answers, not status; Steel/Ghost typing is also Knock Off / Toxic / Rage Powder immune.",
    claims: [{ species: ['Gholdengo'], ability: 'Good as Gold' }],
  },
  {
    key: 'dragonite-multiscale-priority',
    applies: (myTeam, oppTeam) => teamHas(myTeam, 'Dragonite') || teamHas(oppTeam, 'Dragonite'),
    text: "Dragonite's Multiscale halves damage taken when at full HP, so the standard play is to chip Dragonite first (Fake Out, Sand Stream residual, an off-target spread move) before committing the KO attempt. Extreme Speed is +2 priority; Dragonite revenge-kills weakened sweepers regardless of speed control.",
    claims: [
      { species: ['Dragonite'], ability: 'Multiscale' },
      { species: ['Dragonite'], move: 'Extreme Speed' },
    ],
  },
  {
    key: 'salamence-aerilate-hyper-voice',
    applies: (myTeam, oppTeam) => {
      const sideHasMega = (team: TeamSet) =>
        team.some((p) => p.name === 'Salamence' && p.item === 'Salamencite');
      return sideHasMega(myTeam) || sideHasMega(oppTeam);
    },
    text: "Mega Salamence's Aerilate converts Normal moves to Flying with a 1.2x boost — Hyper Voice becomes a spread Flying STAB hitting both opp slots, Double-Edge / Return become single-target Flying nukes. Wide Guard blocks the Hyper Voice line; Steel-types resist and Rock-types take neutral damage.",
    claims: [
      { species: ['Salamence'], move: 'Hyper Voice' },
      { species: ['Salamence'], item: 'Salamencite' },
    ],
  },
  {
    key: 'metagross-tough-claws-bullet-punch',
    applies: (myTeam, oppTeam) => {
      const sideHasMega = (team: TeamSet) =>
        team.some((p) => p.name === 'Metagross' && p.item === 'Metagrossite');
      return sideHasMega(myTeam) || sideHasMega(oppTeam);
    },
    text: "Mega Metagross's Tough Claws boosts contact moves +30% — Iron Head, Meteor Mash, Zen Headbutt, and Bullet Punch all crit-trade hard. Bullet Punch is +1 priority Steel STAB and revenge-KOs frail sweepers (Volcarona, Whimsicott, Sneasler). Pre-Mega Clear Body blocks Intimidate.",
    claims: [
      { species: ['Metagross'], move: 'Bullet Punch' },
      { species: ['Metagross'], item: 'Metagrossite' },
    ],
  },
  {
    key: 'baxcalibur-glaive-rush-trap',
    applies: (myTeam, oppTeam) => teamHas(myTeam, 'Baxcalibur') || teamHas(oppTeam, 'Baxcalibur'),
    text: "Baxcalibur's Glaive Rush flags the user — incoming attacks deal double damage and never miss until Baxcalibur's next turn. Pairing Glaive Rush with a Protect partner mitigates the swap-in risk; using Glaive Rush into a Sucker Punch / Bullet Punch user usually trades poorly for Baxcalibur.",
    claims: [{ species: ['Baxcalibur'], move: 'Glaive Rush' }],
  },
  {
    key: 'hydreigon-levitate-eq-spam',
    applies: (myTeam) =>
      teamHas(myTeam, 'Hydreigon') &&
      teamHasAny(myTeam, ['Garchomp', 'Tyranitar', 'Hippowdon', 'Excadrill']),
    text: "Hydreigon's Levitate makes it Earthquake-immune — pair with a Ground-type partner to spam EQ without friendly fire. Dark/Dragon STAB hits Indeedee-F and Sinistcha super-effectively; Hydreigon also resists Heat Wave / Fiery Dance, easing the Volcarona / Charizard-Y matchup.",
    claims: [
      { species: ['Hydreigon'], ability: 'Levitate' },
      { species: ['Garchomp', 'Tyranitar', 'Hippowdon', 'Excadrill'], move: 'Earthquake' },
    ],
  },
  {
    key: 'dondozo-tatsugiri-commander',
    applies: (myTeam, oppTeam) => {
      const hasPair = (team: TeamSet) => teamHas(team, 'Dondozo') && teamHas(team, 'Tatsugiri');
      return hasPair(myTeam) || hasPair(oppTeam);
    },
    text: "Tatsugiri triggers its Commander ability when sent in beside Dondozo — it enters Dondozo's mouth, becomes untargetable, and grants Dondozo +2 to every stat (Atk, Def, SpA, SpD, Spe). Dondozo can't switch out while Commander is active. The KO answer is to remove Dondozo with super-effective spam (Grass / Electric / Fairy moves) before the boost compounds via Order Up.",
    claims: [
      { species: ['Tatsugiri'], ability: 'Commander' },
      { species: ['Dondozo'], move: 'Order Up' },
    ],
  },
  {
    key: 'choice-locked-knock-off-trade',
    applies: (_myTeam, oppTeam) =>
      teamHasAnyItem(oppTeam, ['Choice Band', 'Choice Specs', 'Choice Scarf']),
    text: 'Knocking off a Choice item removes the item but does NOT free the opp from the move-lock for the current switch-in window — the lock persists until the holder switches out. Trade Knock Off only when the item itself is the threat (Scarf-locked sweeper) or when the opp would re-equip via switch.',
  },
  {
    key: 'safety-goggles-vs-redirection',
    applies: (myTeam) => teamHasItem(myTeam, 'Safety Goggles'),
    text: 'Safety Goggles ignore Rage Powder (also blocks weather chip — sand, hail). A Goggles holder bypasses Sinistcha / Amoonguss redirection, letting attacks land on the intended target. Particularly load-bearing on a setup sweeper that needs to KO the redirector itself.',
  },
  {
    key: 'covert-cloak-blocks-flinch',
    applies: (myTeam) => teamHasItem(myTeam, 'Covert Cloak'),
    text: 'Covert Cloak blocks added effects — Fake Out flinch, Air Slash flinch, Rock Slide flinch, Iron Head flinch, Scald burn, Icy Wind speed drop. Functionally trades a Sitrus / Lefties slot for hard immunity to flinch-based disruption, valuable on a slow setup mon (Sinistcha, Porygon2) that hates losing the turn.',
  },
  {
    key: 'eject-pack-tempo-pivot',
    applies: (myTeam) => teamHasItem(myTeam, 'Eject Pack'),
    text: "Eject Pack triggers when the holder's stat is lowered, force-switching them out and bringing in a chosen replacement. Common pivot: lead an Intimidate target with Eject Pack, eat the -1 Attack, swap into the actual win condition for free.",
  },
  {
    key: 'focus-sash-vs-chip',
    applies: (myTeam, oppTeam) =>
      teamHasItem(myTeam, 'Focus Sash') || teamHasItem(oppTeam, 'Focus Sash'),
    text: 'Focus Sash survives one OHKO at full HP, then breaks. Any chip (Fake Out, Sand Stream, Spikes, ally spread move) consumed before the lethal hit nullifies it. When opp leads a Sash holder, T1 Fake Out into a Sand Stream / spread move usually trades the Sash for free.',
  },
  {
    key: 'encore-lock-on-setup',
    applies: (myTeam, oppTeam) => teamHas(myTeam, 'Whimsicott') || teamHas(oppTeam, 'Whimsicott'),
    text: 'Encore locks the target into its last move for 3 turns. Standard Whimsicott Prankster line: opp uses Dragon Dance / Quiver Dance / Trick Room / Tailwind, Whimsicott Encores it, opp burns the next two turns repeating a now-pointless setup move. Fails vs. Dark-types (Prankster immune).',
    claims: [{ species: ['Whimsicott'], move: 'Encore' }],
  },
  {
    key: 'taunt-shutdown-support',
    applies: (myTeam, oppTeam) => {
      const hasTaunt = (team: TeamSet) =>
        team.some((p) => (p.moves ?? []).some((m) => String(m) === 'Taunt'));
      return hasTaunt(myTeam) || hasTaunt(oppTeam);
    },
    text: "Taunt blocks all status moves on the target for 3 turns — counters Indeedee-F Follow Me, Sinistcha Rage Powder, Trick Room setters, screen setters (Light Screen / Reflect), Whimsicott Tailwind. Doesn't stop damaging moves, so the Taunted mon can still attack normally.",
  },
  {
    key: 'wide-guard-spread-block',
    applies: (myTeam, oppTeam) => {
      const wideGuardUsers = ['Hitmontop', 'Mienshao'];
      return teamHasAny(myTeam, wideGuardUsers) || teamHasAny(oppTeam, wideGuardUsers);
    },
    text: 'Wide Guard blocks every multi-target move for one turn — Heat Wave, Rock Slide, Earthquake, Hyper Voice, Discharge. Single-target moves still land. Standard answer to spread-spam leads (Mega Salamence Hyper Voice, Charizard-Y Heat Wave); pairs naturally with a slower setup mon.',
    claims: [{ species: ['Hitmontop', 'Mienshao'], move: 'Wide Guard' }],
  },
  {
    key: 'quick-guard-priority-block',
    applies: (myTeam, oppTeam) => {
      const quickGuardUsers = ['Hitmontop', 'Mienshao'];
      return teamHasAny(myTeam, quickGuardUsers) || teamHasAny(oppTeam, quickGuardUsers);
    },
    text: 'Quick Guard blocks every priority move (positive priority) for one turn — Fake Out, Extreme Speed, Bullet Punch, Sucker Punch, Grassy Glide on Rillaboom. Useful when the opp lead pair is priority-heavy and the win condition is a setup mon that hates Fake Out.',
    claims: [{ species: ['Hitmontop', 'Mienshao'], move: 'Quick Guard' }],
  },
  {
    key: 'helping-hand-damage-chain',
    applies: (myTeam) => {
      const hhUsers = ['Indeedee-F', 'Whimsicott'];
      return teamHasAny(myTeam, hhUsers);
    },
    text: "Helping Hand boosts an ally's damage by 1.5x for one turn — pushes borderline 2HKOs into OHKOs and pairs cleanly with setup moves (DD + HH the same turn = +1 attacker, +50% damage). Wasted if the ally is targeted by a Fake Out flinch the same turn — sequence HH after disruption resolves.",
    claims: [{ species: ['Indeedee-F', 'Whimsicott'], move: 'Helping Hand' }],
  },
  {
    key: 'tailwind-window-management',
    applies: (myTeam, oppTeam) => {
      const twUsers = ['Whimsicott', 'Pelipper', 'Salamence'];
      return teamHasAny(myTeam, twUsers) || teamHasAny(oppTeam, twUsers);
    },
    text: "Tailwind doubles team Speed for 4 turns from the setter's turn (so 4 turns of speed under Whimsicott Prankster, 3 turns under non-Prankster setters). Plan setup → sweep within the window; Tailwind ends T+4 and the trailing turn often flips speed back to opp. Trick Room overwrites Tailwind for that side's mons (TR speed-tier inversion supersedes the boost).",
    claims: [{ species: ['Whimsicott', 'Pelipper', 'Salamence'], move: 'Tailwind' }],
  },
  {
    key: 'sun-chlorophyll-team-impact',
    applies: (myTeam, oppTeam) => {
      const sunSetters = ['Torkoal', 'Ninetales'];
      return teamHasAny(myTeam, sunSetters) || teamHasAny(oppTeam, sunSetters);
    },
    text: "Drought (Torkoal / Ninetales) sets sun on switch-in — Fire moves +50% / Water moves -50%, Solar Beam skips charge, Chlorophyll mons (Venusaur, Lilligant) double Speed. Sun-team win condition is a Chlorophyll sweeper or Volcarona Quiver Dance behind sun's Fire boost; Tyranitar Sand Stream cuts sun on switch-in.",
    claims: [{ species: ['Torkoal', 'Ninetales'], ability: 'Drought' }],
  },
  {
    key: 'aurora-veil-snow-screens',
    applies: (myTeam, oppTeam) =>
      teamHas(myTeam, 'Ninetales-Alola') || teamHas(oppTeam, 'Ninetales-Alola'),
    text: 'Alolan Ninetales (Snow Warning) sets snow and unlocks Aurora Veil — combined Reflect + Light Screen for 5 turns, scaling to 8 with Light Clay. Aurora Veil only sets while snow is active; cutting snow (Drizzle / Drought / Sand Stream override) drops the screen-setup window.',
    claims: [
      { species: ['Ninetales-Alola'], ability: 'Snow Warning' },
      { species: ['Ninetales-Alola'], move: 'Aurora Veil' },
    ],
  },
  {
    key: 'iron-defense-body-press-setup',
    applies: (myTeam, oppTeam) => {
      const bpUsers = ['Corviknight', 'Aggron'];
      return teamHasAny(myTeam, bpUsers) || teamHasAny(oppTeam, bpUsers);
    },
    text: "Body Press uses the user's Defense as the attack stat — pairs with Iron Defense (+2 Def per use) for a multi-turn setup that scales without an Attack stat. Common on Corviknight / Mega Aggron. Unaware (Dondozo, Clefable) ignores the Defense boost when calculating incoming Body Press damage; Haze / Clear Smog reset the stages. Special attackers bypass the Defense wall entirely.",
    claims: [
      { species: ['Corviknight', 'Aggron'], move: 'Body Press' },
      { species: ['Corviknight', 'Aggron'], move: 'Iron Defense' },
    ],
  },
  // TODO(M-B rollout): replace with concrete M-B Mega rotation + ban-list
  // facts once the official M-B bulletin ships. The current entry is a
  // format-rotation test fixture (exercises `Fact.format` per-format
  // subsetting) and a hedge: if the recommender runs under M-B before
  // research is updated, the model is told to fall back to M-A defaults
  // rather than confidently asserting an M-A meta into an M-B matchup.
  {
    key: 'regmb-restricted-mega-list-stub',
    applies: () => true,
    format: 'gen9championsvgc2026regmb',
    text: 'Regulation M-B research has not been ingested into this tool yet. Treat the matchup with M-A defaults, lower `confidence`, and call out that the M-B Mega rotation, species pool, and move/item bans may diverge from the M-A baseline used to ground these notes.',
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
