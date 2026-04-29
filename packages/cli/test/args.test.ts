import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/index.js';

describe('parseArgs', () => {
  it('captures the first positional as the command', () => {
    const r = parseArgs(['recommend', '--my-team', 'charx-vgc']);
    expect(r.command).toBe('recommend');
    expect(r.flags['my-team']).toBe('charx-vgc');
  });

  it('captures additional positionals after the command', () => {
    const r = parseArgs(['teams', 'show', 'charx-vgc']);
    expect(r.command).toBe('teams');
    expect(r.positionals).toEqual(['show', 'charx-vgc']);
  });

  it('parses --flag value pairs', () => {
    const r = parseArgs([
      'recommend',
      '--opp',
      'screenshot.png',
      '--format',
      'gen9championsvgc2026regma',
    ]);
    expect(r.flags.opp).toBe('screenshot.png');
    expect(r.flags.format).toBe('gen9championsvgc2026regma');
  });

  it('parses --flag=value form', () => {
    const r = parseArgs(['recommend', '--opp=screenshot.png']);
    expect(r.flags.opp).toBe('screenshot.png');
  });

  it('captures pre-declared boolean flags', () => {
    const r = parseArgs(['recommend', '--json'], { bools: ['json'] });
    expect(r.bools.json).toBe(true);
    expect(r.flags.json).toBeUndefined();
  });

  it('treats a --flag with no following value as boolean even if not pre-declared', () => {
    const r = parseArgs(['recommend', '--dry-run']);
    expect(r.bools['dry-run']).toBe(true);
  });

  it('accumulates pre-declared array flags', () => {
    const r = parseArgs(['recommend', '--notes', 'one', '--notes', 'two', '--notes', 'three'], {
      arrayFlags: ['notes'],
    });
    expect(r.arrayFlags.notes).toEqual(['one', 'two', 'three']);
    expect(r.flags.notes).toBeUndefined();
  });

  it('preserves caller order across mixed flag types', () => {
    const r = parseArgs(['teams', 'validate', 'charx-vgc', '--teams-dir', '/tmp/t', '--json'], {
      bools: ['json'],
    });
    expect(r.command).toBe('teams');
    expect(r.positionals).toEqual(['validate', 'charx-vgc']);
    expect(r.flags['teams-dir']).toBe('/tmp/t');
    expect(r.bools.json).toBe(true);
  });

  it('returns empty result for empty argv', () => {
    const r = parseArgs([]);
    expect(r.command).toBeUndefined();
    expect(r.positionals).toEqual([]);
    expect(r.flags).toEqual({});
  });
});
