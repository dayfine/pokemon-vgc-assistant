import { describe, expect, it } from 'vitest';
import { buildVisionPrompt } from '../src/index.js';

describe('buildVisionPrompt', () => {
  it('pins the open-sheet prompt for Reg M-A', () => {
    const { system, user } = buildVisionPrompt('open', 'gen9championsvgc2026regma');
    expect(system).toMatchInlineSnapshot(`
      "You are a Pokémon team-preview extractor for Pokémon Champions VGC (a Switch game).

      You receive a screenshot of the team-preview screen and return a strict JSON object describing the Pokémon visible on screen. Two screen modes exist:

      - **closed sheet** (ranked ladder): opponent rows show only sprite + a generic frame. Item, ability, moves, and Tera type are HIDDEN for opp.
      - **open sheet** (tournament / TPCi events): opponent rows show sprite + ability text + item icon + 4 moves + Tera type.

      In both modes, MY side (the user's team) is fully visible — return the full kit for my mons regardless of the sheet mode flag.

      The Switch UI may be in any language (English, Japanese, Chinese, Korean, etc.). **Use sprite + icon recognition, not OCR-of-labels.** Sprite layout and visual icons are language-invariant.

      Always return English Showdown-canonical names. Examples: \`Charizard\`, \`Indeedee-F\` (form-suffixed), \`Charizardite X\`, \`Intimidate\`, \`Knock Off\`, \`Helping Hand\`. Mega Stones use the \`<Species>ite\` pattern (e.g. \`Salamencite\`, \`Tyranitarite\`); Charizardite has X/Y suffixes.

      If you cannot identify a sprite confidently, set \`confidence: "low"\` and describe the uncertainty in the top-level \`notes\` field. Never guess silently — partial information with stated uncertainty is more useful than confident wrong answers.

      Output the JSON object only — no surrounding prose, no markdown code fence."
    `);
    expect(user).toContain('Sheet mode: **open**');
    expect(user).toContain('Reg M-A is no-Tera');
    expect(user).toContain('"sheetMode": "open"');
    expect(user).toContain('"tera"'); // open-sheet schema includes tera
  });

  it('pins the closed-sheet prompt for Reg M-A', () => {
    const { user } = buildVisionPrompt('closed', 'gen9championsvgc2026regma');
    expect(user).toContain('Sheet mode: **closed**');
    expect(user).toContain('Reg M-A is no-Tera');
    expect(user).toContain('"sheetMode": "closed"');
    // Closed-sheet schema example must NOT show item/ability/moves on opp
    const oppSchemaStart = user.indexOf('"oppTeam"');
    const oppSchemaSection = user.slice(oppSchemaStart, oppSchemaStart + 200);
    expect(oppSchemaSection).not.toContain('"item"');
    expect(oppSchemaSection).not.toContain('"ability"');
    expect(oppSchemaSection).not.toContain('"moves"');
  });

  it('switches the format reminder when format=gen9championsvgc2026regmb', () => {
    const { user } = buildVisionPrompt('open', 'gen9championsvgc2026regmb');
    expect(user).toContain('Reg M-B rules are TBD');
    expect(user).not.toContain('Reg M-A is no-Tera');
  });

  it('user prompt mentions sprite-based ID, not OCR', () => {
    // Sprite-based ID is the load-bearing path per the design doc;
    // OCR-of-labels was an explicit anti-pattern. Guard against
    // accidental drift.
    const { system } = buildVisionPrompt('open', 'gen9championsvgc2026regma');
    expect(system).toContain('sprite + icon recognition');
    expect(system).toContain('not OCR-of-labels');
  });

  it('system prompt instructs Showdown-canonical English naming', () => {
    const { system } = buildVisionPrompt('open', 'gen9championsvgc2026regma');
    expect(system).toContain('English Showdown-canonical names');
    expect(system).toContain('Indeedee-F'); // example with form suffix
  });
});
