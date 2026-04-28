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

import {
  Field,
  Pokemon,
  getGeneration,
  matrix,
  recommendBP,
  score,
  speedTiers,
} from '../packages/engine/dist/index.js';

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

// ---- Lead-pair scoring: per-bring, find the best opening 2 of 4 ----
//
// Iteration on top of recommendBP that addresses "no lead-pair distinction"
// from the v1 score limitations. For each ranked bring, enumerate the
// C(4, 2) = 6 lead pairs and score each. The "best lead" is the pair with
// the highest score under leadWeights (roleGap zeroed, since back-2 cover
// roles).
//
// Honest caveats (v1 — these are real flaws, not nits):
// - **Score isn't size-normalized.** The same `engine.score` used for
//   full-bring scoring is reused with a 2-pair as `combo`. So "both
//   leads die" reads identically to "half of a bring dies" — both
//   contribute oppKoPicked=2 with the same -ve weight. A purpose-built
//   lead-pair scorer would weight oppKoPicked relative to combo size,
//   or be a different metric altogether.
// - **No back-2 model.** Lead-pair score is "lead vs full opp team",
//   ignoring that the back-2 are still alive after the leads. A real
//   lead-pair model would consider lead-vs-lead trade outcomes
//   separately from back-line bring quality.
// - **No synergy capture.** Coaching → Charizard sweep, Trick Room flip,
//   Fake Out + setup, redirection — none of these show up.
// - **No opp-lead enumeration yet.** We're scoring "my lead vs FULL opp
//   team", not "my lead vs assumed opp lead pair". The next iteration
//   on top of this enumerates C(6,2)=15 opp lead pairs and surfaces
//   "if opp leads X+Y, your best lead is A+B". Flagged at the end of
//   the script.
const m = matrix(gen, myTeam, oppTeam, { field: DOUBLES });
const speedInputs = [
  ...myTeam.map((p) => ({ pokemon: p, side: 'my' })),
  ...oppTeam.map((p) => ({ pokemon: p, side: 'opp' })),
];
const sp = speedTiers(speedInputs);
const leadWeights = { ...config.scoreWeights, roleGap: 0 };

function combos2(arr) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      out.push([arr[i], arr[j]]);
    }
  }
  return out;
}

function bestLeadPair(combo) {
  let best = { pair: null, total: Number.NEGATIVE_INFINITY, scored: null };
  for (const pair of combos2(combo)) {
    const s = score(pair, oppTeam, m, sp, leadWeights);
    if (s.total > best.total) {
      best = { pair, total: s.total, scored: s };
    }
  }
  return best;
}

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
  const lead = bestLeadPair(pick.combo);
  const leadNames = lead.pair.map((p) => p.name).join(' + ');
  const back = pick.combo.filter((p) => !lead.pair.includes(p));
  const backNames = back.map((p) => p.name).join(' + ');
  const lb = lead.scored.breakdown;

  console.log(`#${i + 1}  total=${pick.score.total.toFixed(2)}`);
  console.log(`    combo:    ${combo}`);
  console.log(`    lead:     ${leadNames}   (lead-score=${lead.total.toFixed(2)})`);
  console.log(`    back:     ${backNames}`);
  console.log('    bring breakdown:');
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
  console.log('    lead breakdown (back-2 not modeled, roleGap weight zeroed):');
  console.log(`      pickedKoOpp:        ${lb.pickedKoOpp.toFixed(2)}`);
  console.log(`      pickedOutspeedOpp:  ${lb.pickedOutspeedOpp.toFixed(2)}`);
  console.log(`      pickedSurvivesOpp:  ${lb.pickedSurvivesOpp.toFixed(2)}`);
  console.log(`      oppKoPicked:        ${lb.oppKoPicked.toFixed(2)}`);
  console.log('');
}

// ---- Opp-lead scenarios: "if opp leads X+Y, you should lead A+B" ----
//
// Take the top recommended bring. Enumerate all C(6,2)=15 opp lead
// pairs. For each, find the best my-lead-pair response by:
//   1. Building a per-scenario matrix with my full myTeam vs JUST the
//      opp-lead-pair (2 mons), so the matchup numbers are scoped to
//      the actual leads on field.
//   2. Scoring each of my-bring's C(4,2)=6 lead pairs against that
//      2-mon opp slice using engine.score.
//   3. Picking the highest-scoring my-lead.
//
// We then rank opp leads by their *threat level* (how often they're
// expected to win the opening trade) — concretely, by the highest
// score the operator can achieve against them. Lower-best-response
// score = harder lead for us to handle = surface first.
//
// Honest caveats (same v1 score limits as above):
// - score(...) on a 2v2 still doesn't model setup synergy or back-2
//   trades. "Best response" here is just "best raw matchup numbers
//   given an opp lead pair".
// - We use a per-scenario matrix so the calc reflects only the 2 opp
//   mons on field — but speed is still computed across full teams.
//   That's fine: speed isn't kit-pair-coupled.
const topBring = ranked.picks[0].combo;
const oppLeadPairs = combos2(oppTeam);

function bestMyLeadVsOppLead(oppLead) {
  const scenarioMatrix = matrix(gen, topBring, oppLead, { field: DOUBLES });
  const scenarioSpeedInputs = [
    ...topBring.map((p) => ({ pokemon: p, side: 'my' })),
    ...oppLead.map((p) => ({ pokemon: p, side: 'opp' })),
  ];
  const scenarioSpeed = speedTiers(scenarioSpeedInputs);
  let best = { pair: null, total: Number.NEGATIVE_INFINITY, scored: null };
  for (const myLead of combos2(topBring)) {
    const s = score(myLead, oppLead, scenarioMatrix, scenarioSpeed, leadWeights);
    if (s.total > best.total) {
      best = { pair: myLead, total: s.total, scored: s };
    }
  }
  return best;
}

const scenarios = oppLeadPairs.map((oppLead) => ({
  oppLead,
  best: bestMyLeadVsOppLead(oppLead),
}));

// Sort hardest-first: lowest "my best response" score = hardest lead for us.
scenarios.sort((a, b) => a.best.total - b.best.total);

console.log('\n--- Opp-lead scenarios for top bring ---');
console.log(`Top bring: ${topBring.map((p) => p.name).join(' + ')}`);
console.log(
  `Showing all ${scenarios.length} opp lead pairs, sorted hardest-first (lowest my-best-response score = hardest lead for us):\n`,
);
for (let i = 0; i < scenarios.length; i++) {
  const s = scenarios[i];
  const oppNames = s.oppLead.map((p) => p.name).join(' + ');
  const myNames = s.best.pair.map((p) => p.name).join(' + ');
  const b = s.best.scored.breakdown;
  console.log(
    `#${String(i + 1).padStart(2, ' ')}  if opp leads ${oppNames}` +
      `\n      best response: ${myNames}` +
      `  (lead-score=${s.best.total.toFixed(2)},` +
      ` ko=${b.pickedKoOpp.toFixed(2)},` +
      ` taken=${b.oppKoPicked.toFixed(2)},` +
      ` outspeed=${b.pickedOutspeedOpp.toFixed(2)})`,
  );
}
