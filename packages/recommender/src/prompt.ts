import type { Format, MatchupMatrix, RankedPicks, SpeedRanking, TeamSet } from '@pva/engine';
import { selectFacts } from './facts.js';
import type { RecommendOptions, SheetMode } from './types.js';

/**
 * Build the recommender prompt from a `RecommendOptions` payload.
 *
 * Sections per design doc §"Prompt structure":
 *
 *   1. Role
 *   2. Format (with rules + per-format flags)
 *   3. My team (full sets)
 *   4. Strategic notes (facts that apply)
 *   5. Opp team (full sets, with format-illegality flags inline if any)
 *   6. Speed tiers (sorted, both sides)
 *   7. Damage matrix — my attacks opp
 *   8. Damage matrix — opp attacks my
 *   9. Score baseline (top-N + breakdown)
 *  10. Notes (optional, series-level)
 *  11. Task
 *  12. Output schema
 *
 * Snapshot-pinned per format. The format-keyed text in `formatRules`
 * lives here; nowhere else in the package may the format ID literal
 * appear (qc-structural enforces).
 */
export function buildPrompt(opts: RecommendOptions): string {
  const sections: string[] = [];
  sections.push(roleSection());
  sections.push(formatSection(opts.format, opts.sheetMode));
  sections.push(teamSection('My team', opts.myTeam, 'my'));
  sections.push(strategicNotesSection(opts.myTeam, opts.oppTeam, opts.format));
  sections.push(teamSection('Opp team', opts.oppTeam, 'opp'));
  sections.push(speedTiersSection(opts.speedRanking));
  sections.push(damageMatrixSection(opts.matrix, 'my', opts.myTeam, opts.oppTeam));
  sections.push(damageMatrixSection(opts.matrix, 'opp', opts.oppTeam, opts.myTeam));
  sections.push(scoreBaselineSection(opts.scoreBaseline));
  if (opts.notes !== undefined && opts.notes.length > 0) {
    sections.push(seriesNotesSection(opts.notes));
  }
  sections.push(taskSection());
  sections.push(outputSchemaSection());
  return sections.join('\n\n');
}

function roleSection(): string {
  return [
    '## Role',
    '',
    'You are a Pokémon VGC doubles expert acting as a recommendation engine.',
    'Given a structured matchup context (team sets, speed tiers, damage matrix, deterministic-score baseline), recommend the best 4-of-6 bring, opening lead pair, key opp threats, and per-scenario lead plays. Apply tactical reasoning the deterministic score cannot capture: setup synergy, archetype recognition, threat-priority sequencing, ability/move tactical interactions.',
  ].join('\n');
}

/**
 * Per-format rules block. The format ID literal is allowed in this map
 * only — every other call site references `opts.format` by variable.
 */
const FORMAT_RULES: Record<Format, string> = {
  gen9championsvgc2026regma: [
    'Format: Pokémon Champions, VGC 2026, Regulation M-A.',
    '- 4v4 Doubles (bring 4 of 6), Level 50.',
    '- Mega Evolution only — one Mega per team. No Tera, Dynamax, or Z-Moves.',
    '- Item Clause + Species Clause (no duplicates within a team).',
    '- Banned moves include: Last Respects, Shed Tail, Baton Pass, sleep-inducing moves.',
    '- Banned categories: all Legendaries, Paradox, Treasures of Ruin, Koraidon, Miraidon, Mewtwo (in M-A).',
    '- Stat Points (SP) replace EVs as the customization knob (different math from EVs).',
    '- 45s/turn timer, 7min per-player time, 20min overall (matches end in draw on overall expiry).',
  ].join('\n'),
};

function formatSection(format: Format, sheetMode: SheetMode): string {
  const rules = FORMAT_RULES[format];
  const sheetLine =
    sheetMode === 'open'
      ? "Sheet mode: **open** — opp's species, ability, item, all 4 moves, and Tera type are visible. EVs/IVs/nature hidden."
      : "Sheet mode: **closed** — only opp's species (and the kit candidates fed into the matrix) are known.";
  return ['## Format', '', rules, '', sheetLine].join('\n');
}

function teamSection(label: string, team: TeamSet, side: 'my' | 'opp'): string {
  const lines = [`## ${label}`, ''];
  for (const p of team) {
    lines.push(formatSet(p, side));
  }
  return lines.join('\n');
}

function formatSet(pokemon: TeamSet[number], side: 'my' | 'opp'): string {
  const moves = (pokemon.moves ?? []).filter((m) => Boolean(m)).join(' / ');
  const evParts: string[] = [];
  if (pokemon.evs !== undefined) {
    for (const [stat, val] of Object.entries(pokemon.evs)) {
      if (val > 0) {
        evParts.push(`${val} ${stat}`);
      }
    }
  }
  const item = pokemon.item ?? '?';
  const ability = pokemon.ability ?? '?';
  const nature = pokemon.nature ?? '?';
  return `- **${pokemon.name}** (${side}) — ${item} | ${ability} | ${nature} | EVs: ${evParts.join(' / ') || 'n/a'}\n  Moves: ${moves}`;
}

function strategicNotesSection(myTeam: TeamSet, oppTeam: TeamSet, format: Format): string {
  const facts = selectFacts(myTeam, oppTeam, format);
  if (facts.length === 0) {
    return ['## Strategic notes', '', '(no curated facts triggered for this matchup)'].join('\n');
  }
  const lines = ['## Strategic notes', ''];
  for (const f of facts) {
    lines.push(`- **${f.key}** — ${f.text}`);
  }
  return lines.join('\n');
}

function speedTiersSection(speed: SpeedRanking): string {
  const lines = [
    '## Speed tiers',
    '',
    speed.trickRoom
      ? '_Trick Room is active — slower moves first._'
      : '_Sorted fastest-first; no Trick Room._',
    '',
  ];
  for (const e of speed.entries) {
    lines.push(`- ${e.pokemon.name} (${e.side}) — effective ${e.effective}`);
  }
  return lines.join('\n');
}

/**
 * Render one direction of the damage matrix as a Markdown table. Skips
 * empty rows (no OHKO and no 2HKO). Same shape the experiment fixture
 * used.
 */
function damageMatrixSection(
  matrix: MatchupMatrix,
  direction: 'my' | 'opp',
  attackers: TeamSet,
  defenders: TeamSet,
): string {
  const side = matrix[direction];
  const heading =
    direction === 'my'
      ? '## Damage matrix — my team attacks opp'
      : '## Damage matrix — opp attacks my team';
  const lines = [
    heading,
    '',
    '| Attacker | Target | OHKO moves | 2HKO moves |',
    '|---|---|---|---|',
  ];
  for (let a = 0; a < attackers.length; a++) {
    for (let d = 0; d < defenders.length; d++) {
      const cells = side.cells[a]?.[d] ?? [];
      const ohkos: string[] = [];
      const twohkos: string[] = [];
      for (const cell of cells) {
        for (const mu of cell.matchups) {
          // Prefer the structured M3.5 outcome payload; fall back to the
          // M3 string-parse path when matchups predate the probability
          // layer (synthetic test matrices, mainly).
          const pOhko = mu.outcome?.pOhko ?? (mu.damage.koChance === 1 ? 1 : 0);
          const pTwoHko = mu.outcome?.pTwoHko ?? (mu.damage.notation.includes('2HKO') ? 1 : 0);
          if (pOhko >= 0.5) {
            ohkos.push(mu.move.name);
          } else if (pTwoHko >= 0.5) {
            twohkos.push(mu.move.name);
          }
        }
      }
      if (ohkos.length === 0 && twohkos.length === 0) continue;
      const attackerName = attackers[a]?.name ?? '?';
      const defenderName = defenders[d]?.name ?? '?';
      lines.push(
        `| ${attackerName} | ${defenderName} | ${ohkos.join(', ') || '—'} | ${twohkos.join(', ') || '—'} |`,
      );
    }
  }
  return lines.join('\n');
}

function scoreBaselineSection(baseline: RankedPicks): string {
  const lines = ['## Deterministic-score baseline (top brings)', ''];
  for (let i = 0; i < baseline.picks.length; i++) {
    const pick = baseline.picks[i];
    if (pick === undefined) continue;
    const combo = pick.combo.map((p) => p.name).join(' + ');
    const b = pick.score.breakdown;
    lines.push(
      `${i + 1}. ${combo} (total=${pick.score.total.toFixed(2)}; ` +
        `KO=${b.pickedKoOpp.toFixed(2)}, taken=${b.oppKoPicked.toFixed(2)}, ` +
        `outspeed=${b.pickedOutspeedOpp.toFixed(2)}, walls=${b.pickedSurvivesOpp.toFixed(2)}, ` +
        `roleGaps=${b.unfilledRoles})`,
    );
  }
  lines.push('');
  lines.push(
    'The baseline reflects matrix-only reasoning. You may disagree — state grounds in `deviationRationale` if you do.',
  );
  return lines.join('\n');
}

function seriesNotesSection(notes: readonly string[]): string {
  const lines = ['## Series-level facts revealed so far', ''];
  for (const n of notes) {
    lines.push(`- ${n}`);
  }
  return lines.join('\n');
}

function taskSection(): string {
  return [
    '## Task',
    '',
    'Produce a JSON `AgentRecommendation` (schema below) plus a free-form rationale. The JSON must:',
    '- Pick a 4-mon `bring` from `myTeam`.',
    '- Pick a 2-mon `lead` (subset of `bring`) and a 2-mon `back` (the other 2 in `bring`).',
    '- Identify 3-5 `keyOppThreats` with `why` rationale (1-2 sentences each).',
    '- Provide 2-4 `leadScenarios`: "if opp leads X+Y, we lead A+B; turn 1 play; turn 2 play; (optional) turn 3 play".',
    '- Set `deviatesFromScoreBaseline=true` iff your `bring` differs from the deterministic top-1 above; if so, fill `deviationRationale`.',
    '- Set `confidence` to high|medium|low based on how much input uncertainty (visual ID errors, hidden spreads) the recommendation can absorb.',
    '- Fill `rationale` with 2-4 paragraphs explaining the win condition, threat ordering, and any tradeoffs.',
  ].join('\n');
}

function outputSchemaSection(): string {
  return [
    '## Output schema',
    '',
    'Return a single JSON object with these exact keys (no extra fields, no comments):',
    '',
    '```json',
    '{',
    '  "bring": ["S1", "S2", "S3", "S4"],',
    '  "lead": ["S1", "S2"],',
    '  "back": ["S3", "S4"],',
    '  "primaryWinCondition": "1-2 sentence summary",',
    '  "keyOppThreats": [{"opp": "Species", "why": "rationale"}],',
    '  "leadScenarios": [{"ifOppLeads": ["A", "B"], "weLead": ["C", "D"], "turn1Play": "...", "turn2Play": "...", "turn3Play": "..."}],',
    '  "deviatesFromScoreBaseline": true,',
    '  "deviationRationale": "required iff deviates",',
    '  "confidence": "high" | "medium" | "low",',
    '  "rationale": "free-form, 2-4 paragraphs"',
    '}',
    '```',
    '',
    'Use Showdown-canonical species names (e.g. "Indeedee-F", "Landorus-Therian"). Output the JSON only — no surrounding prose, no markdown code fence.',
  ].join('\n');
}
