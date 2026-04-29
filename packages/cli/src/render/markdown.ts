import type { OrchestrateResult } from '../orchestrate.js';

/**
 * Render the orchestrator result as markdown for terminal output.
 * Lives in the CLI per `dev/plans/07-cli-design.md`'s separation of
 * concerns: recommender emits structured JSON, presentation belongs
 * to the consumer. The M7 web UI will consume `OrchestrateResult`
 * directly without this renderer.
 *
 * Sections in stable order:
 * - Bring + lead/back
 * - Win condition
 * - Key opp threats
 * - Lead scenarios
 * - Confidence + (deviation rationale when applicable)
 * - Free-form rationale
 * - Deterministic-score baseline (for debugging / "why did it pick X")
 *
 * The full damage matrix is intentionally NOT in v1 markdown — it's
 * 36 cells per direction and reads poorly in a terminal. CLI users
 * who want it can pass `--json` and pipe to `jq`. M7's web UI gets
 * the collapsible-table treatment.
 */
export function renderMarkdown(result: OrchestrateResult): string {
  const { recommendation: rec, scoreBaseline, extracted } = result;
  const sections: string[] = [];
  sections.push(headerSection(extracted));
  sections.push(bringSection(rec));
  sections.push(winConditionSection(rec));
  sections.push(threatsSection(rec));
  sections.push(scenariosSection(rec));
  sections.push(confidenceSection(rec));
  sections.push(rationaleSection(rec));
  sections.push(baselineSection(scoreBaseline));
  return `${sections.filter((s) => s.length > 0).join('\n\n')}\n`;
}

function headerSection(extracted: OrchestrateResult['extracted']): string {
  const oppNames = extracted.oppTeam.map((m) => m.species).join(', ');
  const sheet = extracted.sheetMode === 'open' ? 'open-sheet' : 'closed-sheet';
  const lines = ['# pva recommendation', '', `**Opponent (${sheet})**: ${oppNames}`];
  if (extracted.notes !== undefined && extracted.notes.length > 0) {
    lines.push(`**Vision notes**: ${extracted.notes}`);
  }
  return lines.join('\n');
}

function bringSection(rec: OrchestrateResult['recommendation']): string {
  const lines = ['## Bring', ''];
  lines.push(`**${rec.bring.join(' / ')}**`);
  lines.push('');
  lines.push(`Lead: ${rec.lead.join(' + ')} → Back: ${rec.back.join(' + ')}`);
  return lines.join('\n');
}

function winConditionSection(rec: OrchestrateResult['recommendation']): string {
  return ['## Win condition', '', rec.primaryWinCondition].join('\n');
}

function threatsSection(rec: OrchestrateResult['recommendation']): string {
  const lines = ['## Key opp threats', ''];
  for (const t of rec.keyOppThreats) {
    lines.push(`- **${t.opp}** — ${t.why}`);
  }
  return lines.join('\n');
}

function scenariosSection(rec: OrchestrateResult['recommendation']): string {
  const lines = ['## Lead scenarios', ''];
  for (const s of rec.leadScenarios) {
    lines.push(`- **If opp leads ${s.ifOppLeads.join(' + ')}** → we lead ${s.weLead.join(' + ')}`);
    lines.push(`  - T1: ${s.turn1Play}`);
    lines.push(`  - T2: ${s.turn2Play}`);
    if (s.turn3Play !== undefined && s.turn3Play.length > 0) {
      lines.push(`  - T3: ${s.turn3Play}`);
    }
  }
  return lines.join('\n');
}

function confidenceSection(rec: OrchestrateResult['recommendation']): string {
  const lines = [`## Confidence: ${rec.confidence}`, ''];
  if (rec.deviatesFromScoreBaseline) {
    lines.push(
      `**Deviates from deterministic top-1.** Rationale: ${rec.deviationRationale ?? '(none provided)'}`,
    );
  } else {
    lines.push('Aligned with deterministic top-1.');
  }
  return lines.join('\n');
}

function rationaleSection(rec: OrchestrateResult['recommendation']): string {
  return ['## Rationale', '', rec.rationale].join('\n');
}

function baselineSection(baseline: OrchestrateResult['scoreBaseline']): string {
  const lines = ['## Deterministic-score baseline', ''];
  for (let i = 0; i < baseline.picks.length; i += 1) {
    const pick = baseline.picks[i];
    if (pick === undefined) continue;
    const combo = pick.combo.map((p) => p.name).join(' + ');
    lines.push(`${i + 1}. ${combo} (total=${pick.score.total.toFixed(2)})`);
  }
  return lines.join('\n');
}
