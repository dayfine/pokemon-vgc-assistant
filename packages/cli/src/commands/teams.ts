import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  itemExists,
  speciesExists,
  speciesHasAbility,
  speciesLearnsMoveGen9,
} from '@pva/showdown-data';
import { type ParsedTeam, TeamParseError, parseTeam } from '../teams/parse.js';
import { resolveTeamPath, teamsDir, teamsDirCandidates } from '../teams/resolve.js';

/**
 * `pva teams` subcommand handlers. Output goes to stdout; errors are
 * thrown for the caller to map to exit codes.
 *
 * Three actions in v1:
 * - `list`             — enumerate stored team IDs in `<teamsDir>`
 * - `show <id|path>`   — print the file contents
 * - `validate <id|path>` — parse + cross-check every kit field against
 *                          the Showdown-Champions snapshot
 *
 * Subcommands consume the parsed `args.flags` for `--teams-dir`, plus
 * the positional after `teams`.
 */

export interface TeamsCommandContext {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
  readonly cliTeamsDir: string | undefined;
  readonly stdout: (s: string) => void;
}

export function teamsList(ctx: TeamsCommandContext): void {
  const dir = teamsDir(ctx.cliTeamsDir, ctx.env, ctx.home);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    const candidates = teamsDirCandidates(ctx.cliTeamsDir, ctx.env, ctx.home, ctx.cwd);
    ctx.stdout(
      `No teams directory found. Searched:\n${candidates.map((c) => `  - ${c}`).join('\n')}\nCreate one of those paths and drop a Showdown-export \`.txt\` in it, or pass --teams-dir <path>.\n`,
    );
    return;
  }
  const entries = readdirSync(dir)
    .filter((f) => f.endsWith('.txt'))
    .map((f) => basename(f, '.txt'))
    .sort();
  if (entries.length === 0) {
    ctx.stdout(`No teams in ${dir}.\n`);
    return;
  }
  ctx.stdout(`Teams in ${dir}:\n`);
  for (const id of entries) ctx.stdout(`  - ${id}\n`);
}

export function teamsShow(ctx: TeamsCommandContext, valueArg: string): void {
  const path = resolveTeamPath(valueArg, {
    ...(ctx.cliTeamsDir !== undefined ? { cliTeamsDir: ctx.cliTeamsDir } : {}),
    cwd: ctx.cwd,
    env: ctx.env,
    home: ctx.home,
  });
  if (!existsSync(path)) {
    throw new Error(`No team found at ${path}`);
  }
  ctx.stdout(readFileSync(path, 'utf8'));
}

export function teamsValidate(ctx: TeamsCommandContext, valueArg: string): void {
  const path = resolveTeamPath(valueArg, {
    ...(ctx.cliTeamsDir !== undefined ? { cliTeamsDir: ctx.cliTeamsDir } : {}),
    cwd: ctx.cwd,
    env: ctx.env,
    home: ctx.home,
  });
  if (!existsSync(path)) {
    throw new Error(`No team found at ${path}`);
  }
  const body = readFileSync(path, 'utf8');
  let parsed: ParsedTeam;
  try {
    parsed = parseTeam(body);
  } catch (err) {
    if (err instanceof TeamParseError) {
      throw new Error(`Parse error in ${path}: ${err.message}`);
    }
    throw err;
  }

  const findings: string[] = [];
  for (let i = 0; i < parsed.teamSet.length; i += 1) {
    const p = parsed.teamSet[i];
    if (p === undefined) continue;
    const where = `slot ${i + 1} (${p.name})`;
    if (!speciesExists(p.name)) {
      findings.push(`${where}: species not in Showdown pokedex`);
      continue;
    }
    if (typeof p.item === 'string' && p.item.length > 0 && !itemExists(p.item)) {
      findings.push(`${where}: unknown item "${p.item}"`);
    }
    if (
      typeof p.ability === 'string' &&
      p.ability.length > 0 &&
      !speciesHasAbility(p.name, p.ability)
    ) {
      findings.push(`${where}: ability "${p.ability}" not legal for ${p.name}`);
    }
    for (const move of p.moves ?? []) {
      if (typeof move === 'string' && move.length > 0 && !speciesLearnsMoveGen9(p.name, move)) {
        findings.push(`${where}: ${p.name} does not learn "${move}" under gen-9 rules`);
      }
    }
  }

  const id = basename(path, '.txt');
  if (findings.length === 0) {
    ctx.stdout(`✓ ${id} — 6 sets, all kit fields legal per Showdown-Champions snapshot\n`);
    return;
  }
  ctx.stdout(`✗ ${id} — ${findings.length} legality issue${findings.length === 1 ? '' : 's'}:\n`);
  for (const f of findings) ctx.stdout(`  - ${f}\n`);
  throw new Error(`Validation failed for ${id}`);
}

/** Locate `teamsDir` relative to caller-provided context. Re-exported
 *  so tests can inspect the resolved path without round-tripping
 *  through one of the action handlers. */
export function teamsDirFor(ctx: TeamsCommandContext): string {
  // Bridge to the resolver — same lookup chain `pva teams list` uses.
  return teamsDir(ctx.cliTeamsDir, ctx.env, ctx.home);
}

/** Reusable resolver wrapper preserved for test-time injection. */
export function locateTeamFile(ctx: TeamsCommandContext, valueArg: string): string {
  return resolveTeamPath(valueArg, {
    ...(ctx.cliTeamsDir !== undefined ? { cliTeamsDir: ctx.cliTeamsDir } : {}),
    cwd: ctx.cwd,
    env: ctx.env,
    home: ctx.home,
  });
}

// Re-export so callers can write a single import.
export { join };
