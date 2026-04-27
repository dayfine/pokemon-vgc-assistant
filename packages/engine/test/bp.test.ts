import { describe, expect, it } from 'vitest';
import { Field, Pokemon, type ScoreWeights, getGeneration, recommendBP } from '../src/index.js';

const gen = getGeneration();
const DOUBLES = new Field({ gameType: 'Doubles' });

/**
 * Test weights mirror `pva.config.ts`'s shipped defaults. The behavioral
 * claim is *ordering*, not absolute totals — `recommendBP` must rank
 * "obviously better" brings above "obviously worse" ones under these
 * weights. If the shipped weights drift, update this constant in lockstep
 * (or move it to the test fixture data, but at M3 we have only one
 * config consumer).
 */
const WEIGHTS: ScoreWeights = {
  ohkoThreats: 3,
  speedControl: 2,
  defensiveAnswers: 2,
  ohkoTaken: 3,
  roleGap: 3,
};

/** Helper: which 4 picks does a `RankedPicks` rank as the top combo? */
function topNames(picks: {
  picks: readonly { combo: ReadonlyArray<{ name: string }> }[];
}): string[] {
  const top = picks.picks[0]?.combo ?? [];
  return top.map((p) => p.name);
}

describe('recommendBP — Scenario 1: role gaps', () => {
  it('prefers a balanced 4-pick over 4 same-archetype mons', () => {
    // myTeam: 4 physical Steel attackers + 1 special attacker + 1 speed
    // controller. The "4 Steels" bring fills only `physicalAttacker`; a
    // balanced bring also fills `specialAttacker` and `speedControl`. With
    // a 3-roleGap penalty and 4 Steels offering equivalent KO output to
    // any 2-Steel + Caly + Indeedee bring, the balanced bring must rank
    // higher.
    const opp1 = new Pokemon(gen, 'Tapu Lele', {
      level: 50,
      ability: 'Psychic Surge',
      nature: 'Modest',
      evs: { hp: 4, spa: 252, spe: 252 },
      moves: ['Moonblast', 'Psychic'],
    });
    const opp2 = new Pokemon(gen, 'Flutter Mane', {
      level: 50,
      ability: 'Protosynthesis',
      nature: 'Timid',
      evs: { spa: 252, spe: 252 },
      moves: ['Moonblast', 'Shadow Ball'],
    });
    const opp3 = new Pokemon(gen, 'Iron Valiant', {
      level: 50,
      ability: 'Quark Drive',
      nature: 'Naive',
      evs: { atk: 4, spa: 252, spe: 252 },
      moves: ['Moonblast', 'Close Combat'],
    });
    const opp4 = new Pokemon(gen, 'Hatterene', {
      level: 50,
      ability: 'Magic Bounce',
      nature: 'Quiet',
      evs: { hp: 252, spa: 252 },
      moves: ['Dazzling Gleam', 'Psychic'],
    });
    const opp5 = new Pokemon(gen, 'Whimsicott', {
      level: 50,
      ability: 'Prankster',
      nature: 'Timid',
      evs: { hp: 252, spe: 252 },
      moves: ['Moonblast', 'Energy Ball'],
    });
    const opp6 = new Pokemon(gen, 'Grimmsnarl', {
      level: 50,
      ability: 'Prankster',
      nature: 'Careful',
      evs: { hp: 252, spd: 252 },
      moves: ['Spirit Break', 'Sucker Punch'],
    });
    const oppTeam = [opp1, opp2, opp3, opp4, opp5, opp6] as const;

    // 4 Steel physical attackers — different species so the Pokemon
    // identity comparisons in `score` work cleanly. All physical.
    const steelA = new Pokemon(gen, 'Iron Hands', {
      level: 50,
      ability: 'Quark Drive',
      nature: 'Adamant',
      evs: { hp: 4, atk: 252, spe: 252 },
      moves: ['Drain Punch', 'Heavy Slam'],
    });
    const steelB = new Pokemon(gen, 'Excadrill', {
      level: 50,
      ability: 'Mold Breaker',
      nature: 'Adamant',
      evs: { atk: 252, spe: 252 },
      moves: ['Iron Head', 'Earthquake'],
    });
    const steelC = new Pokemon(gen, 'Scizor', {
      level: 50,
      ability: 'Technician',
      nature: 'Adamant',
      evs: { hp: 4, atk: 252, spe: 252 },
      moves: ['Bullet Punch', 'Bug Bite'],
    });
    const steelD = new Pokemon(gen, 'Iron Treads', {
      level: 50,
      ability: 'Quark Drive',
      nature: 'Jolly',
      evs: { atk: 252, spe: 252 },
      moves: ['Iron Head', 'Earthquake'],
    });
    // Special attacker.
    const calyShadow = new Pokemon(gen, 'Calyrex-Shadow', {
      level: 50,
      item: 'Choice Specs',
      ability: 'As One (Spectrier)',
      nature: 'Timid',
      evs: { spa: 252, spe: 252 },
      moves: ['Astral Barrage', 'Psychic'],
    });
    // Speed controller (Tailwind setter).
    const tornadus = new Pokemon(gen, 'Tornadus', {
      level: 50,
      ability: 'Prankster',
      nature: 'Timid',
      evs: { hp: 252, spe: 252 },
      moves: ['Tailwind', 'Bleakwind Storm'],
    });

    const myTeam = [steelA, steelB, steelC, steelD, calyShadow, tornadus] as const;

    const ranked = recommendBP(gen, myTeam, oppTeam, WEIGHTS, { field: DOUBLES });

    const top = topNames(ranked);
    // Top pick must include Calyrex-Shadow (the only special attacker)
    // and Tornadus (the only speed controller). If the four-Steels combo
    // beat a balanced bring, the role-gap penalty isn't doing its job.
    expect(top).toContain('Calyrex-Shadow');
    expect(top).toContain('Tornadus');

    // Find the all-Steels combo's score and confirm it ranks lower than
    // the top pick. Score the 15 combos by hand by re-running and
    // checking total ordering — easier: assert the combo names of the
    // top pick are not all four Steels.
    const allSteelNames = ['Iron Hands', 'Excadrill', 'Scizor', 'Iron Treads'];
    expect(allSteelNames.every((n) => top.includes(n))).toBe(false);
  });
});

describe('recommendBP — Scenario 2: speed control swing', () => {
  it('prefers a Tailwind-setter + fast attacker bring vs. a slow opp', () => {
    // Construct an opp team that's almost entirely slow (Trick Room
    // candidates). My team has two viable speed-control pieces (Tornadus
    // for Tailwind, Whimsicott for Tailwind/utility) plus four mid-speed
    // attackers. The bring with at least one TW setter must outrank the
    // bring of "4 attackers, no speed control".
    const slow1 = new Pokemon(gen, 'Ursaluna', {
      level: 50,
      ability: 'Guts',
      nature: 'Brave',
      ivs: { spe: 0 },
      evs: { hp: 252, atk: 252 },
      moves: ['Headlong Rush', 'Facade'],
    });
    const slow2 = new Pokemon(gen, 'Torkoal', {
      level: 50,
      ability: 'Drought',
      nature: 'Quiet',
      ivs: { spe: 0 },
      evs: { hp: 252, spa: 252 },
      moves: ['Eruption', 'Earth Power'],
    });
    const slow3 = new Pokemon(gen, 'Hatterene', {
      level: 50,
      ability: 'Magic Bounce',
      nature: 'Quiet',
      ivs: { spe: 0 },
      evs: { hp: 252, spa: 252 },
      moves: ['Dazzling Gleam', 'Psychic'],
    });
    const slow4 = new Pokemon(gen, 'Indeedee-F', {
      level: 50,
      ability: 'Psychic Surge',
      nature: 'Sassy',
      ivs: { spe: 0 },
      evs: { hp: 252, spd: 252 },
      moves: ['Follow Me', 'Psychic'],
    });
    const slow5 = new Pokemon(gen, 'Iron Hands', {
      level: 50,
      ability: 'Quark Drive',
      nature: 'Brave',
      ivs: { spe: 0 },
      evs: { hp: 252, atk: 252 },
      moves: ['Drain Punch', 'Wild Charge'],
    });
    const slow6 = new Pokemon(gen, 'Glimmora', {
      level: 50,
      ability: 'Toxic Debris',
      nature: 'Quiet',
      ivs: { spe: 0 },
      evs: { hp: 252, spa: 252 },
      moves: ['Sludge Bomb', 'Earth Power'],
    });
    const oppTeam = [slow1, slow2, slow3, slow4, slow5, slow6] as const;

    // Tailwind setter — Prankster Tornadus is the canonical pick.
    const tornadus = new Pokemon(gen, 'Tornadus', {
      level: 50,
      ability: 'Prankster',
      nature: 'Timid',
      evs: { hp: 252, spe: 252 },
      moves: ['Tailwind', 'Bleakwind Storm'],
    });
    // Fast special attacker that benefits from Tailwind.
    const calyShadow = new Pokemon(gen, 'Calyrex-Shadow', {
      level: 50,
      item: 'Choice Specs',
      ability: 'As One (Spectrier)',
      nature: 'Timid',
      evs: { spa: 252, spe: 252 },
      moves: ['Astral Barrage', 'Psychic'],
    });
    // Four mid-speed attackers. None carry a speed-control move; each is
    // a reasonable damage-dealer alone but as a foursome leaves the
    // speedControl role gap.
    const drag1 = new Pokemon(gen, 'Roaring Moon', {
      level: 50,
      ability: 'Protosynthesis',
      nature: 'Jolly',
      evs: { atk: 252, spe: 252 },
      moves: ['Knock Off', 'Iron Head'],
    });
    const drag2 = new Pokemon(gen, 'Garchomp', {
      level: 50,
      ability: 'Rough Skin',
      nature: 'Jolly',
      evs: { atk: 252, spe: 252 },
      moves: ['Earthquake', 'Dragon Claw'],
    });
    const drag3 = new Pokemon(gen, 'Dragonite', {
      level: 50,
      ability: 'Multiscale',
      nature: 'Adamant',
      evs: { atk: 252, spe: 252 },
      moves: ['Extreme Speed', 'Dual Wingbeat'],
    });
    const drag4 = new Pokemon(gen, 'Salamence', {
      level: 50,
      ability: 'Intimidate',
      nature: 'Naive',
      evs: { atk: 4, spa: 252, spe: 252 },
      moves: ['Dragon Pulse', 'Fire Blast'],
    });

    const myTeam = [tornadus, calyShadow, drag1, drag2, drag3, drag4] as const;
    const ranked = recommendBP(gen, myTeam, oppTeam, WEIGHTS, { field: DOUBLES });

    const top = topNames(ranked);
    // Top pick must include Tornadus (the only Tailwind setter on the
    // team). A bring without speed control eats both the speedControl
    // role-gap penalty and a lower pickedOutspeedOpp count.
    expect(top).toContain('Tornadus');
  });
});

describe('recommendBP — Scenario 3: defensive answer', () => {
  it('prefers a bring containing a known KO threat vs. one that loses 1HKO both ways', () => {
    // Opp team has a single dominant threat (Choice Specs Calyrex-Shadow).
    // myTeam has one mon that 1HKOs Calyrex-Shadow back (Banette-Mega-tier
    // priority threat — but we don't have Megas wired, so use Annihilape
    // with priority Rage Fist isn't OHKO; pick a calculable answer:
    // a fast Sucker Punch user that KO's Caly with priority is hard at
    // L50 in calc. Simpler: Ting-Lu w/ Throat Spray? Let's go cleaner:
    // a Choice Band Urshifu-Single-Strike with Wicked Blow guarantees
    // OHKO on Caly via crit-chance (Wicked Blow always crits).
    //
    // We're testing the combinator, not the metagame. Two nearly-identical
    // bring candidates: one contains the Caly-killer, one doesn't. The
    // killer-included bring must rank higher.
    const opp1 = new Pokemon(gen, 'Calyrex-Shadow', {
      level: 50,
      item: 'Choice Specs',
      ability: 'As One (Spectrier)',
      nature: 'Timid',
      evs: { spa: 252, spe: 252 },
      moves: ['Astral Barrage', 'Psychic'],
    });
    const opp2 = new Pokemon(gen, 'Pelipper', {
      level: 50,
      ability: 'Drizzle',
      nature: 'Modest',
      evs: { hp: 252, spa: 252 },
      moves: ['Hurricane', 'Hydro Pump'],
    });
    const opp3 = new Pokemon(gen, 'Tatsugiri', {
      level: 50,
      ability: 'Commander',
      nature: 'Modest',
      evs: { hp: 4, spa: 252, spe: 252 },
      moves: ['Muddy Water', 'Draco Meteor'],
    });
    const opp4 = new Pokemon(gen, 'Dondozo', {
      level: 50,
      ability: 'Unaware',
      nature: 'Impish',
      evs: { hp: 252, def: 252 },
      moves: ['Wave Crash', 'Body Press'],
    });
    const opp5 = new Pokemon(gen, 'Amoonguss', {
      level: 50,
      ability: 'Regenerator',
      nature: 'Bold',
      evs: { hp: 252, def: 252 },
      moves: ['Sludge Bomb', 'Pollen Puff'],
    });
    const opp6 = new Pokemon(gen, 'Volcarona', {
      level: 50,
      ability: 'Flame Body',
      nature: 'Timid',
      evs: { spa: 252, spe: 252 },
      moves: ['Heat Wave', 'Bug Buzz'],
    });
    const oppTeam = [opp1, opp2, opp3, opp4, opp5, opp6] as const;

    // The Calyrex killer: Choice Band Urshifu-Single-Strike. Wicked Blow
    // always crits and is Dark — guaranteed OHKO on 0 HP Calyrex-Shadow
    // at L50 with Specs. (Calyrex outspeeds, so the trade is Caly KOs
    // something turn 1; Urshifu KOs Caly turn 2 via priority if scarfed,
    // or as the next switch-in — the matrix doesn't care about turn
    // order, only about whether the OHKO exists at all.)
    const urshifu = new Pokemon(gen, 'Urshifu', {
      level: 50,
      item: 'Choice Band',
      ability: 'Unseen Fist',
      nature: 'Adamant',
      evs: { atk: 252, spe: 252 },
      moves: ['Wicked Blow', 'Close Combat'],
    });
    // Five "filler" attackers — none of them OHKO Calyrex-Shadow back,
    // and Calyrex 1HKOs all of them with Astral Barrage. Each is
    // independently competent (different roles, no role-gap signals
    // between sub-brings).
    const rilla = new Pokemon(gen, 'Rillaboom', {
      level: 50,
      ability: 'Grassy Surge',
      nature: 'Adamant',
      evs: { hp: 4, atk: 252, spe: 252 },
      moves: ['Wood Hammer', 'Grassy Glide'],
    });
    const tornadus = new Pokemon(gen, 'Tornadus', {
      level: 50,
      ability: 'Prankster',
      nature: 'Timid',
      evs: { hp: 252, spe: 252 },
      moves: ['Tailwind', 'Bleakwind Storm'],
    });
    const indeedee = new Pokemon(gen, 'Indeedee-F', {
      level: 50,
      ability: 'Psychic Surge',
      nature: 'Modest',
      evs: { hp: 252, spa: 252 },
      moves: ['Psychic', 'Follow Me'],
    });
    const garganacl = new Pokemon(gen, 'Garganacl', {
      level: 50,
      ability: 'Purifying Salt',
      nature: 'Careful',
      evs: { hp: 252, spd: 252 },
      moves: ['Salt Cure', 'Body Press'],
    });
    const flutterMane = new Pokemon(gen, 'Flutter Mane', {
      level: 50,
      ability: 'Protosynthesis',
      nature: 'Timid',
      evs: { spa: 252, spe: 252 },
      moves: ['Moonblast', 'Shadow Ball'],
    });

    const myTeam = [urshifu, rilla, tornadus, indeedee, garganacl, flutterMane] as const;
    const ranked = recommendBP(gen, myTeam, oppTeam, WEIGHTS, { field: DOUBLES });

    const top = topNames(ranked);
    // Urshifu is the only mon on the team that guarantees an OHKO on
    // Calyrex-Shadow (Wicked Blow always crits, Choice Band, +20% Dark
    // STAB SE on Psychic). Any bring missing Urshifu loses one OHKO
    // threat *and* takes the OHKO from Caly without retaliating; under
    // these weights the Urshifu-included bring must outrank.
    expect(top).toContain('Urshifu');
  });
});
