import type { AgentRecommendation, KeyThreat, LeadScenario } from './types.js';
import { RecommenderError } from './types.js';

/**
 * Hand-rolled runtime validator for `AgentRecommendation`. The shape is
 * small enough that pulling in zod doesn't materially simplify; keeping
 * recommender's runtime-dep list to `@anthropic-ai/sdk` only is the
 * material win.
 *
 * Validation strategy:
 *  1. Parse the model's text as JSON. If the model wrapped the JSON in a
 *     fenced block (```json ... ```), strip the fence first.
 *  2. Walk the object asserting every required field's type and shape.
 *  3. Cross-field invariants: `lead` ⊂ `bring`; `back` ⊂ `bring`; `lead`
 *     ∩ `back` = ∅; `bring` length 4; `lead`/`back` length 2.
 *  4. If `deviatesFromScoreBaseline === true`, `deviationRationale` must
 *     be present.
 *
 * Illegal-species checks (e.g. opp species not in the M-A dex) are NOT
 * enforced here — that's caller responsibility per the design doc
 * §"What the recommender does NOT do" — *except* for the bring/lead/back
 * cross-checks (a `lead` mon not in `bring` is structural, not domain).
 *
 * Illegal-species kind is reserved for callers that want to add a
 * post-validation check against the active format's dex; see
 * `validateAgainstLegalSpecies`.
 */
export function parseAgentRecommendation(raw: string): AgentRecommendation {
  const json = stripFence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new RecommenderError(
      'invalid-json',
      `model response is not valid JSON: ${(err as Error).message}`,
      raw,
    );
  }
  if (!isObject(parsed)) {
    throw new RecommenderError('schema-mismatch', 'response is not a JSON object', raw);
  }
  return validateShape(parsed, raw);
}

/**
 * Strip a leading/trailing markdown code fence around JSON, if present.
 * Models often wrap JSON in ```json ... ```; the prompt asks for plain
 * JSON but defensiveness here is cheap.
 */
function stripFence(raw: string): string {
  const trimmed = raw.trim();
  // Match ``` or ```json prefix and trailing ```; tolerate trailing
  // whitespace inside the fence.
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fenceMatch && fenceMatch[1] !== undefined) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateShape(obj: Record<string, unknown>, raw: string): AgentRecommendation {
  const bring = expectStringTuple(obj, 'bring', 4, raw);
  const lead = expectStringTuple(obj, 'lead', 2, raw);
  const back = expectStringTuple(obj, 'back', 2, raw);
  const primaryWinCondition = expectString(obj, 'primaryWinCondition', raw);
  const keyOppThreats = expectKeyThreats(obj, raw);
  const leadScenarios = expectLeadScenarios(obj, raw);
  const deviatesFromScoreBaseline = expectBoolean(obj, 'deviatesFromScoreBaseline', raw);
  const confidence = expectConfidence(obj, raw);
  const rationale = expectString(obj, 'rationale', raw);

  // Cross-field: lead ⊂ bring, back ⊂ bring, lead ∩ back = ∅.
  const bringSet = new Set(bring);
  for (const m of lead) {
    if (!bringSet.has(m)) {
      throw new RecommenderError('schema-mismatch', `lead member "${m}" not in bring`, raw);
    }
  }
  for (const m of back) {
    if (!bringSet.has(m)) {
      throw new RecommenderError('schema-mismatch', `back member "${m}" not in bring`, raw);
    }
  }
  const leadSet = new Set(lead);
  for (const m of back) {
    if (leadSet.has(m)) {
      throw new RecommenderError(
        'schema-mismatch',
        `mon "${m}" appears in both lead and back`,
        raw,
      );
    }
  }

  // Conditional: deviationRationale required iff deviates.
  let deviationRationale: string | undefined;
  if (deviatesFromScoreBaseline) {
    const v = obj.deviationRationale;
    if (typeof v !== 'string' || v.length === 0) {
      throw new RecommenderError(
        'schema-mismatch',
        'deviationRationale required when deviatesFromScoreBaseline=true',
        raw,
      );
    }
    deviationRationale = v;
  } else if (
    obj.deviationRationale !== undefined &&
    typeof obj.deviationRationale === 'string' &&
    obj.deviationRationale.length > 0
  ) {
    // Tolerate the agent providing a rationale even when it claims no
    // deviation; preserve it (informational).
    deviationRationale = obj.deviationRationale;
  }

  const result: AgentRecommendation = {
    bring,
    lead,
    back,
    primaryWinCondition,
    keyOppThreats,
    leadScenarios,
    deviatesFromScoreBaseline,
    confidence,
    rationale,
    ...(deviationRationale !== undefined ? { deviationRationale } : {}),
  };
  return result;
}

function expectString(obj: Record<string, unknown>, key: string, raw: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new RecommenderError('schema-mismatch', `field "${key}" must be a non-empty string`, raw);
  }
  return v;
}

function expectBoolean(obj: Record<string, unknown>, key: string, raw: string): boolean {
  const v = obj[key];
  if (typeof v !== 'boolean') {
    throw new RecommenderError('schema-mismatch', `field "${key}" must be a boolean`, raw);
  }
  return v;
}

function expectStringTuple<N extends number>(
  obj: Record<string, unknown>,
  key: string,
  length: N,
  raw: string,
): N extends 2
  ? readonly [string, string]
  : N extends 4
    ? readonly [string, string, string, string]
    : readonly string[] {
  const v = obj[key];
  if (!Array.isArray(v) || v.length !== length) {
    throw new RecommenderError(
      'schema-mismatch',
      `field "${key}" must be an array of length ${length}`,
      raw,
    );
  }
  for (const item of v) {
    if (typeof item !== 'string' || item.length === 0) {
      throw new RecommenderError(
        'schema-mismatch',
        `field "${key}" must contain non-empty strings`,
        raw,
      );
    }
  }
  return v as never;
}

function expectConfidence(obj: Record<string, unknown>, raw: string): 'high' | 'medium' | 'low' {
  const v = obj.confidence;
  if (v !== 'high' && v !== 'medium' && v !== 'low') {
    throw new RecommenderError(
      'schema-mismatch',
      `field "confidence" must be one of high|medium|low`,
      raw,
    );
  }
  return v;
}

function expectKeyThreats(obj: Record<string, unknown>, raw: string): readonly KeyThreat[] {
  const v = obj.keyOppThreats;
  if (!Array.isArray(v)) {
    throw new RecommenderError('schema-mismatch', 'field "keyOppThreats" must be an array', raw);
  }
  const out: KeyThreat[] = [];
  for (let i = 0; i < v.length; i++) {
    const entry = v[i];
    if (!isObject(entry)) {
      throw new RecommenderError('schema-mismatch', `keyOppThreats[${i}] must be an object`, raw);
    }
    const opp = entry.opp;
    const why = entry.why;
    if (typeof opp !== 'string' || opp.length === 0) {
      throw new RecommenderError(
        'schema-mismatch',
        `keyOppThreats[${i}].opp must be a non-empty string`,
        raw,
      );
    }
    if (typeof why !== 'string' || why.length === 0) {
      throw new RecommenderError(
        'schema-mismatch',
        `keyOppThreats[${i}].why must be a non-empty string`,
        raw,
      );
    }
    out.push({ opp, why });
  }
  return out;
}

function expectLeadScenarios(obj: Record<string, unknown>, raw: string): readonly LeadScenario[] {
  const v = obj.leadScenarios;
  if (!Array.isArray(v)) {
    throw new RecommenderError('schema-mismatch', 'field "leadScenarios" must be an array', raw);
  }
  const out: LeadScenario[] = [];
  for (let i = 0; i < v.length; i++) {
    const entry = v[i];
    if (!isObject(entry)) {
      throw new RecommenderError('schema-mismatch', `leadScenarios[${i}] must be an object`, raw);
    }
    const ifOppLeads = entry.ifOppLeads;
    const weLead = entry.weLead;
    const turn1Play = entry.turn1Play;
    if (
      !Array.isArray(ifOppLeads) ||
      ifOppLeads.length !== 2 ||
      typeof ifOppLeads[0] !== 'string' ||
      typeof ifOppLeads[1] !== 'string'
    ) {
      throw new RecommenderError(
        'schema-mismatch',
        `leadScenarios[${i}].ifOppLeads must be a 2-tuple of strings`,
        raw,
      );
    }
    if (
      !Array.isArray(weLead) ||
      weLead.length !== 2 ||
      typeof weLead[0] !== 'string' ||
      typeof weLead[1] !== 'string'
    ) {
      throw new RecommenderError(
        'schema-mismatch',
        `leadScenarios[${i}].weLead must be a 2-tuple of strings`,
        raw,
      );
    }
    if (typeof turn1Play !== 'string' || turn1Play.length === 0) {
      throw new RecommenderError(
        'schema-mismatch',
        `leadScenarios[${i}].turn1Play must be a non-empty string`,
        raw,
      );
    }
    const scenario: LeadScenario = {
      ifOppLeads: [ifOppLeads[0], ifOppLeads[1]],
      weLead: [weLead[0], weLead[1]],
      turn1Play,
      ...(typeof entry.turn2Play === 'string' && entry.turn2Play.length > 0
        ? { turn2Play: entry.turn2Play }
        : {}),
      ...(typeof entry.turn3Play === 'string' && entry.turn3Play.length > 0
        ? { turn3Play: entry.turn3Play }
        : {}),
    };
    out.push(scenario);
  }
  return out;
}

/**
 * Optional post-validation check: every species in the recommendation
 * (bring / lead / back / keyOppThreats / leadScenarios) appears in the
 * legal-species set the caller passes in. Caller scopes the set per
 * format. Recommender doesn't ship a built-in dex — that's `vision`'s
 * concern (see design doc §"What the recommender does NOT do").
 */
export function validateAgainstLegalSpecies(
  rec: AgentRecommendation,
  legalSpecies: ReadonlySet<string>,
): void {
  const cited = new Set<string>();
  for (const m of rec.bring) cited.add(m);
  for (const m of rec.lead) cited.add(m);
  for (const m of rec.back) cited.add(m);
  for (const t of rec.keyOppThreats) cited.add(t.opp);
  for (const s of rec.leadScenarios) {
    cited.add(s.ifOppLeads[0]);
    cited.add(s.ifOppLeads[1]);
    cited.add(s.weLead[0]);
    cited.add(s.weLead[1]);
  }
  for (const species of cited) {
    if (!legalSpecies.has(species)) {
      throw new RecommenderError(
        'illegal-species',
        `species "${species}" is not in the active format's legal species list`,
      );
    }
  }
}
