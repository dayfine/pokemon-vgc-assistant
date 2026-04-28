// Extract structured precalc data from the demo fixture for use as
// LLM-recommender context. Prints:
//   - Full team sets (both sides)
//   - Pairwise matrix: which moves OHKO/2HKO from each direction
//   - Speed tiers (effective Speed, sorted)
//   - Score baseline (top 5 brings + best lead per bring)
//
// Output is intentionally human-readable Markdown so the same string
// can be pasted into an LLM prompt.

import {
  Field,
  Pokemon,
  getGeneration,
  matrix,
  recommendBP,
  score,
  speedTiers,
} from '../packages/engine/dist/index.js';

const gen = getGeneration();
const DOUBLES = new Field({ gameType: 'Doubles' });
const scoreWeights = {
  ohkoThreats: 3,
  speedControl: 2,
  defensiveAnswers: 2,
  ohkoTaken: 3,
  roleGap: 3,
};

// --- Teams (Tabuyo's "Mega Charizard X" + best-guess opp "Vibe") ---
const myTeam = [
  new Pokemon(gen, 'Charizard', {
    level: 50,
    item: 'Charizardite X',
    ability: 'Blaze',
    nature: 'Adamant',
    evs: { atk: 252, spe: 252, hp: 4 },
    moves: ['Protect', 'Dragon Dance', 'Dragon Claw', 'Flare Blitz'],
    gender: 'M',
  }),
  new Pokemon(gen, 'Tyranitar', {
    level: 50,
    item: 'Tyranitarite',
    ability: 'Sand Stream',
    nature: 'Adamant',
    evs: { hp: 4, atk: 252, spe: 252 },
    moves: ['Protect', 'Crunch', 'Rock Slide', 'High Horsepower'],
    gender: 'F',
  }),
  new Pokemon(gen, 'Milotic', {
    level: 50,
    item: 'Leftovers',
    ability: 'Competitive',
    nature: 'Bold',
    evs: { hp: 252, def: 252, spa: 4 },
    moves: ['Protect', 'Icy Wind', 'Scald', 'Recover'],
    gender: 'M',
  }),
  new Pokemon(gen, 'Incineroar', {
    level: 50,
    item: 'Sitrus Berry',
    ability: 'Intimidate',
    nature: 'Adamant',
    evs: { hp: 252, atk: 252, spd: 4 },
    moves: ['Fake Out', 'Parting Shot', 'Throat Chop', 'Flare Blitz'],
    gender: 'M',
  }),
  new Pokemon(gen, 'Sinistcha', {
    level: 50,
    item: 'Coba Berry',
    ability: 'Hospitality',
    nature: 'Sassy',
    evs: { hp: 252, spd: 252, spa: 4 },
    moves: ['Matcha Gotcha', 'Rage Powder', 'Trick Room', 'Life Dew'],
  }),
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
const oppTeam = [
  new Pokemon(gen, 'Charizard', {
    level: 50,
    item: 'Charizardite Y',
    ability: 'Blaze',
    nature: 'Modest',
    evs: { spa: 252, spe: 252, hp: 4 },
    moves: ['Heat Wave', 'Solar Beam', 'Air Slash', 'Protect'],
    gender: 'M',
  }),
  new Pokemon(gen, 'Mewtwo', {
    level: 50,
    item: 'Mewtwonite X',
    ability: 'Pressure',
    nature: 'Adamant',
    evs: { atk: 252, spe: 252, hp: 4 },
    moves: ['Psystrike', 'Drain Punch', 'Ice Punch', 'Bullet Punch'],
    gender: 'N',
  }),
  new Pokemon(gen, 'Garchomp', {
    level: 50,
    item: 'Life Orb',
    ability: 'Rough Skin',
    nature: 'Jolly',
    evs: { atk: 252, spe: 252, hp: 4 },
    moves: ['Earthquake', 'Dragon Claw', 'Stone Edge', 'Fire Fang'],
    gender: 'M',
  }),
  new Pokemon(gen, 'Annihilape', {
    level: 50,
    item: 'Assault Vest',
    ability: 'Defiant',
    nature: 'Adamant',
    evs: { hp: 252, atk: 252, spd: 4 },
    moves: ['Drain Punch', 'Rage Fist', 'Shadow Claw', 'U-turn'],
  }),
  new Pokemon(gen, 'Volcarona', {
    level: 50,
    item: 'Sitrus Berry',
    ability: 'Flame Body',
    nature: 'Timid',
    evs: { hp: 4, spa: 252, spe: 252 },
    moves: ['Heat Wave', 'Bug Buzz', 'Quiver Dance', 'Protect'],
    gender: 'F',
  }),
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

const m = matrix(gen, myTeam, oppTeam, { field: DOUBLES });
const speedInputs = [
  ...myTeam.map((p) => ({ pokemon: p, side: 'my' })),
  ...oppTeam.map((p) => ({ pokemon: p, side: 'opp' })),
];
const sp = speedTiers(speedInputs);

// ---- Print sets ----
function fmtSet(p, side) {
  const moves = (p.moves || []).filter(Boolean).join(' / ');
  const evs = Object.entries(p.evs || {})
    .filter(([_, v]) => v && v > 0)
    .map(([k, v]) => `${v} ${k}`)
    .join(' / ');
  return `- **${p.name}** (${side}) — ${p.item || '?'} | ${p.ability} | ${p.nature || '?'} | EVs: ${evs}\n  Moves: ${moves}`;
}

console.log('## My team (Tabuyo "Mega Charizard X", 11-2 Wolfey replica Team 3)\n');
for (const p of myTeam) console.log(fmtSet(p, 'my'));
console.log('\n## Opp team (best-guess visual ID; "Vibe" trainer)\n');
for (const p of oppTeam) console.log(fmtSet(p, 'opp'));

// ---- Speed tiers ----
console.log('\n## Speed tiers (effective at base field, sorted fastest-first)\n');
for (const e of sp.entries) {
  console.log(`- ${e.pokemon.name.padEnd(14)} (${e.side})  effective=${e.effective}`);
}

// ---- Pairwise OHKO matrix ----
function ohkoMoves(side, attackerIdx, defenderIdx) {
  const cells = side.cells[attackerIdx]?.[defenderIdx] ?? [];
  const moves = [];
  for (const cell of cells) {
    for (const mu of cell.matchups) {
      if (mu.damage.koChance === 1 && mu.damage.notation.includes('OHKO')) {
        moves.push(mu.move.name);
      }
    }
  }
  return moves;
}
function twoHkoMoves(side, attackerIdx, defenderIdx) {
  const cells = side.cells[attackerIdx]?.[defenderIdx] ?? [];
  const moves = [];
  for (const cell of cells) {
    for (const mu of cell.matchups) {
      if (mu.damage.notation.includes('2HKO') && !mu.damage.notation.includes('OHKO')) {
        moves.push(mu.move.name);
      }
    }
  }
  return moves;
}

console.log('\n## Damage matrix — my team attacks opp\n');
console.log('| Attacker | Target | OHKO moves | 2HKO moves |');
console.log('|---|---|---|---|');
for (let a = 0; a < myTeam.length; a++) {
  for (let d = 0; d < oppTeam.length; d++) {
    const ohkos = ohkoMoves(m.my, a, d);
    const twohkos = twoHkoMoves(m.my, a, d);
    if (ohkos.length === 0 && twohkos.length === 0) continue;
    console.log(
      `| ${myTeam[a].name} | ${oppTeam[d].name} | ${ohkos.join(', ') || '—'} | ${twohkos.join(', ') || '—'} |`,
    );
  }
}

console.log('\n## Damage matrix — opp attacks my team\n');
console.log('| Attacker | Target | OHKO moves | 2HKO moves |');
console.log('|---|---|---|---|');
for (let a = 0; a < oppTeam.length; a++) {
  for (let d = 0; d < myTeam.length; d++) {
    const ohkos = ohkoMoves(m.opp, a, d);
    const twohkos = twoHkoMoves(m.opp, a, d);
    if (ohkos.length === 0 && twohkos.length === 0) continue;
    console.log(
      `| ${oppTeam[a].name} | ${myTeam[d].name} | ${ohkos.join(', ') || '—'} | ${twohkos.join(', ') || '—'} |`,
    );
  }
}

// ---- Score baseline ----
const ranked = recommendBP(gen, myTeam, oppTeam, scoreWeights, { field: DOUBLES, topK: 5 });
console.log('\n## Deterministic score baseline (top 5 brings)\n');
for (let i = 0; i < ranked.picks.length; i++) {
  const pick = ranked.picks[i];
  const combo = pick.combo.map((p) => p.name).join(' + ');
  const b = pick.score.breakdown;
  console.log(
    `${i + 1}. ${combo} (total=${pick.score.total.toFixed(2)}; ` +
      `KO=${b.pickedKoOpp.toFixed(2)}, taken=${b.oppKoPicked.toFixed(2)}, ` +
      `outspeed=${b.pickedOutspeedOpp.toFixed(2)}, walls=${b.pickedSurvivesOpp.toFixed(2)}, ` +
      `roleGaps=${b.unfilledRoles})`,
  );
}
