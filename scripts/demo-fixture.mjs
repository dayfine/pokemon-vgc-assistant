// End-to-end sanity demo: hand-transcribe a real team-preview
// screenshot into `Pokemon` objects, run engine.recommendBP, print the
// ranked picks. Intended as a smoke test for the engine pipeline and
// a working preview of the output format we're iterating on toward
// the M5 vision + M5.5 live-capture path.
//
// Run:
//   pnpm -r build && node scripts/demo-fixture.mjs
//
// Fixture context:
// - data/fixtures/champions-team-preview-zh-tw-2026-04-28-001.jpg
//   shows my team (left, "Mega Charizard X" replica from Wolfey VGC's
//   Replica Teams page, Team 3 — Jorge Tabuyo's 11-2 build) and an
//   opp team (right, labelled "Vibe").
// - My-team sets are confirmed (Wolfey's pic at
//   uploads/.../elgato-recording-2026-04-20-13-41-34_orig.png plus
//   Pikalytics summary of Tabuyo's tournament team).
// - Opp species are best-guess visual ID (Mewtwo / Garchomp /
//   Annihilape / Volcarona / Indeedee-F). Mewtwo is M-A-banned
//   (Restricted) so it's likely a different mon. Movesets fabricated.
//
// Known limitations of this v1 score (surfaced by the demo):
// - One-Mega-per-team rule isn't enforced — combos with both
//   Charizardite X + Tyranitarite get scored without filtering.
//   See dev/status/engine.md follow-up.
// - No lead-pair distinction (opening 2 vs back 2). The output is
//   an unordered 4-mon combo. Lead-pair scoring is the next iteration
//   on top of recommendBP.
// - No "if opp leads X+Y" scenario play. score() aggregates over
//   the full opp team. M7 web UI scenario play is the right home for
//   that; lead-pair output is a precursor.
// - Setup-move synergy is invisible to score(). Coaching boosting
//   Charizard's Atk+Def, Trick Room flipping speed, Helping Hand
//   doubling — all real strategy, none modeled. v1 plan acknowledges
//   this as a hard bound on score's expressiveness.

import { Field, Pokemon, getGeneration, recommendBP } from '../packages/engine/dist/index.js';

// Inlined from pva.config.ts (the .ts file isn't a usable runtime import
// without compilation; v1 demo).
const scoreWeights = {
  ohkoThreats: 3,
  speedControl: 2,
  defensiveAnswers: 2,
  ohkoTaken: 3,
  roleGap: 3,
};
const config = { scoreWeights };

const gen = getGeneration();
const DOUBLES = new Field({ gameType: 'Doubles' });

// ---- My team — Jorge Tabuyo's "Mega Charizard X" replica from
//      https://wolfeyvgc.weebly.com/replica-teams.html (Team 3),
//      11-2 published record. Sets confirmed via Pikalytics summary
//      of Tabuyo's tournament team. (Fabricated EVs / natures: only
//      items, ability, moves are published; spreads are plausible
//      defaults that match each set's role.) ----
const myTeam = [
  // 1. Charizard — main attacker (Mega-X)
  new Pokemon(gen, 'Charizard', {
    level: 50,
    item: 'Charizardite X',
    ability: 'Blaze',
    nature: 'Adamant',
    evs: { atk: 252, spe: 252, hp: 4 },
    moves: ['Protect', 'Dragon Dance', 'Dragon Claw', 'Flare Blitz'],
    gender: 'M',
  }),
  // 2. Tyranitar — Mega backup, Sand Stream + High Horsepower
  new Pokemon(gen, 'Tyranitar', {
    level: 50,
    item: 'Tyranitarite',
    ability: 'Sand Stream',
    nature: 'Adamant',
    evs: { hp: 4, atk: 252, spe: 252 },
    moves: ['Protect', 'Crunch', 'Rock Slide', 'High Horsepower'],
    gender: 'F',
  }),
  // 3. Milotic — bulky water with speed control (Icy Wind)
  new Pokemon(gen, 'Milotic', {
    level: 50,
    item: 'Leftovers',
    ability: 'Competitive',
    nature: 'Bold',
    evs: { hp: 252, def: 252, spa: 4 },
    moves: ['Protect', 'Icy Wind', 'Scald', 'Recover'],
    gender: 'M',
  }),
  // 4. Incineroar — Intimidate pivot, Throat Chop variant
  new Pokemon(gen, 'Incineroar', {
    level: 50,
    item: 'Sitrus Berry',
    ability: 'Intimidate',
    nature: 'Adamant',
    evs: { hp: 252, atk: 252, spd: 4 },
    moves: ['Fake Out', 'Parting Shot', 'Throat Chop', 'Flare Blitz'],
    gender: 'M',
  }),
  // 5. Sinistcha — pure support: redirect + room flip + ally heal
  new Pokemon(gen, 'Sinistcha', {
    level: 50,
    item: 'Coba Berry',
    ability: 'Hospitality',
    nature: 'Sassy',
    evs: { hp: 252, spd: 252, spa: 4 },
    moves: ['Matcha Gotcha', 'Rage Powder', 'Trick Room', 'Life Dew'],
  }),
  // 6. Sneasler — Unburden + Coaching (Atk+Def boost for Charizard)
  new Pokemon(gen, 'Sneasler', {
    level: 50,
    item: 'White Herb',
    ability: 'Unburden',
    nature: 'Jolly',
    evs: { atk: 252, spe: 252, hp: 4 },
    moves: ['Fake Out', 'Dire Claw', 'Close Combat', 'Coaching'],
    gender: 'M',
  }),
];

// ---- Opp team (right column, labelled "Vibe", best-guess visual ID) ----
// Several of these are likely M-A-banned (Mewtwo, etc.) but engine doesn't
// validate format. Sets here are plausible competitive guesses.
const oppTeam = [
  // Charizard with Mega marker
  new Pokemon(gen, 'Charizard', {
    level: 50,
    item: 'Charizardite Y',
    ability: 'Blaze',
    nature: 'Modest',
    evs: { spa: 252, spe: 252, hp: 4 },
    moves: ['Heat Wave', 'Solar Beam', 'Air Slash', 'Protect'],
    gender: 'M',
  }),
  // Mewtwo (silver) — likely Mewtwonite-X (Mega-X)
  new Pokemon(gen, 'Mewtwo', {
    level: 50,
    item: 'Mewtwonite X',
    ability: 'Pressure',
    nature: 'Adamant',
    evs: { atk: 252, spe: 252, hp: 4 },
    moves: ['Psystrike', 'Drain Punch', 'Ice Punch', 'Bullet Punch'],
    gender: 'N',
  }),
  // Red obscured mon — guessing Garchomp (common Dragon attacker)
  new Pokemon(gen, 'Garchomp', {
    level: 50,
    item: 'Life Orb',
    ability: 'Rough Skin',
    nature: 'Jolly',
    evs: { atk: 252, spe: 252, hp: 4 },
    moves: ['Earthquake', 'Dragon Claw', 'Stone Edge', 'Fire Fang'],
    gender: 'M',
  }),
  // Green/dark with ghost-ish icon — guessing Annihilape
  new Pokemon(gen, 'Annihilape', {
    level: 50,
    item: 'Assault Vest',
    ability: 'Defiant',
    nature: 'Adamant',
    evs: { hp: 252, atk: 252, spd: 4 },
    moves: ['Drain Punch', 'Rage Fist', 'Shadow Claw', 'U-turn'],
  }),
  // Bug-type with eyes — guessing Volcarona
  new Pokemon(gen, 'Volcarona', {
    level: 50,
    item: 'Sitrus Berry',
    ability: 'Flame Body',
    nature: 'Timid',
    evs: { hp: 4, spa: 252, spe: 252 },
    moves: ['Heat Wave', 'Bug Buzz', 'Quiver Dance', 'Protect'],
    gender: 'F',
  }),
  // Small purple — guessing Indeedee-F
  new Pokemon(gen, 'Indeedee-F', {
    level: 50,
    item: 'Psychic Seed',
    ability: 'Psychic Surge',
    nature: 'Modest',
    evs: { hp: 252, spa: 252, spd: 4 },
    moves: ['Follow Me', 'Psychic', 'Helping Hand', 'Protect'],
    gender: 'F',
  }),
];

// ---- Run recommendBP ----
const ranked = recommendBP(gen, myTeam, oppTeam, config.scoreWeights, {
  field: DOUBLES,
  topK: 5,
});

// ---- Pretty-print ----
console.log('=== Demo: champions-team-preview-zh-tw-2026-04-28-001.jpg ===\n');
console.log('My team (6):  ', myTeam.map((p) => p.name).join(', '));
console.log('Opp team (6): ', oppTeam.map((p) => p.name).join(', '));
console.log('\nWeights:', JSON.stringify(config.scoreWeights, null, 2));
console.log(`\nTop ${ranked.picks.length} bring picks:\n`);

for (let i = 0; i < ranked.picks.length; i++) {
  const pick = ranked.picks[i];
  const combo = pick.combo.map((p) => p.name).join(' + ');
  const b = pick.score.breakdown;
  console.log(`#${i + 1}  total=${pick.score.total.toFixed(2)}`);
  console.log(`    combo:    ${combo}`);
  console.log('    breakdown:');
  console.log(
    `      pickedKoOpp:        ${b.pickedKoOpp.toFixed(2)}  (× ${config.scoreWeights.ohkoThreats})`,
  );
  console.log(
    `      pickedOutspeedOpp:  ${b.pickedOutspeedOpp.toFixed(2)}  (× ${config.scoreWeights.speedControl})`,
  );
  console.log(
    `      pickedSurvivesOpp:  ${b.pickedSurvivesOpp.toFixed(2)}  (× ${config.scoreWeights.defensiveAnswers})`,
  );
  console.log(
    `      oppKoPicked:        ${b.oppKoPicked.toFixed(2)}  (× -${config.scoreWeights.ohkoTaken})`,
  );
  console.log(`      unfilledRoles:      ${b.unfilledRoles}  (× -${config.scoreWeights.roleGap})`);
  console.log('');
}
