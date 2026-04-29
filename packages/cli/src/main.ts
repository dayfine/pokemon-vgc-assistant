#!/usr/bin/env node
/**
 * `pva` binary entry. Dispatches to subcommand handlers per
 * `dev/plans/07-cli-design.md` §"CLI surface". Top-level CLI is the
 * only file in the package that touches `process.{argv,exit,stdout,
 * stderr,env,cwd}`; subcommands receive a typed context.
 */
import { homedir } from 'node:os';
import { parseArgs } from './args.js';
import { parseFormatFlag, parseSheetModeFlag, recommendCommand } from './commands/recommend.js';
import { type TeamsCommandContext, teamsList, teamsShow, teamsValidate } from './commands/teams.js';

export async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, {
    arrayFlags: ['notes'],
    bools: ['json', 'help', 'version'],
  });

  if (parsed.bools.help === true) {
    printHelp();
    return 0;
  }
  if (parsed.bools.version === true) {
    process.stdout.write('pva 0.0.0\n');
    return 0;
  }

  if (parsed.command === undefined) {
    printHelp();
    return 1;
  }

  const ctx = baseContext();

  switch (parsed.command) {
    case 'recommend':
      return runRecommend(ctx, parsed.flags, parsed.bools, parsed.arrayFlags);
    case 'teams':
      return runTeams(ctx, parsed.positionals, parsed.flags);
    default:
      process.stderr.write(`Unknown command "${parsed.command}". Run \`pva --help\`.\n`);
      return 1;
  }
}

function baseContext(): TeamsCommandContext {
  return {
    cwd: process.cwd(),
    env: process.env,
    home: homedir(),
    cliTeamsDir: undefined,
    stdout: (s) => process.stdout.write(s),
  };
}

async function runRecommend(
  baseCtx: TeamsCommandContext,
  flags: Readonly<Record<string, string>>,
  bools: Readonly<Record<string, boolean>>,
  arrayFlags: Readonly<Record<string, readonly string[]>>,
): Promise<number> {
  const myTeam = flags['my-team'];
  const oppPath = flags.opp;
  if (myTeam === undefined || myTeam.length === 0) {
    process.stderr.write('--my-team is required\n');
    return 1;
  }
  if (oppPath === undefined || oppPath.length === 0) {
    process.stderr.write('--opp is required\n');
    return 1;
  }
  const format = parseFormatFlag(flags.format);
  const sheetMode = parseSheetModeFlag(flags['sheet-mode']);
  const ctx = { ...baseCtx, cliTeamsDir: flags['teams-dir'] };
  try {
    await recommendCommand(ctx, {
      myTeam,
      oppPath,
      format,
      sheetMode,
      notes: arrayFlags.notes ?? [],
      emitJson: bools.json === true,
    });
    return 0;
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 1;
  }
}

function runTeams(
  baseCtx: TeamsCommandContext,
  positionals: readonly string[],
  flags: Readonly<Record<string, string>>,
): number {
  const action = positionals[0];
  const valueArg = positionals[1];
  const ctx = { ...baseCtx, cliTeamsDir: flags['teams-dir'] };
  try {
    switch (action) {
      case 'list':
        teamsList(ctx);
        return 0;
      case 'show':
        if (valueArg === undefined) {
          process.stderr.write('teams show <id|path>\n');
          return 1;
        }
        teamsShow(ctx, valueArg);
        return 0;
      case 'validate':
        if (valueArg === undefined) {
          process.stderr.write('teams validate <id|path>\n');
          return 1;
        }
        teamsValidate(ctx, valueArg);
        return 0;
      default:
        process.stderr.write(
          `Unknown teams action "${action ?? '(none)'}". Use list | show | validate.\n`,
        );
        return 1;
    }
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 1;
  }
}

function printHelp(): void {
  const help = `pva — Pokémon VGC ranked-play recommender

Usage:
  pva recommend --my-team <id|path> --opp <png>
                [--format <id>] [--sheet-mode <closed|open>]
                [--teams-dir <path>] [--notes <line>...] [--json]

  pva teams list                        # list known team IDs
  pva teams show <id|path>              # print stored team
  pva teams validate <id|path>          # parse + legality-check

Flags:
  --my-team       team ID (resolves to <teamsDir>/<id>.txt) or file path
  --opp           path to opp team-preview screenshot (.jpg/.png/.webp/.gif)
  --format        default: gen9championsvgc2026regma
  --sheet-mode    closed | open. default: closed
  --teams-dir     override the team-storage lookup
  --notes <s>     repeatable; series-level notes for the recommender
  --json          emit raw AgentRecommendation JSON instead of markdown
  --help          this message
  --version       binary version

teamsDir lookup order: --teams-dir → $PVA_TEAMS_DIR
                       → $XDG_CONFIG_HOME/pva/teams → ~/.config/pva/teams
                       → ./teams

Note: M6.0 supports open-sheet only (vision returns full opp kits).
Closed-sheet via priors expansion lands in M6.0b.
`;
  process.stdout.write(help);
}

// Module-script run guard. When invoked as the binary entry, kick off
// `main` and propagate the exit code; when imported by tests, the
// module just exposes `main` and the helpers below.
const isCli = import.meta.url === `file://${process.argv[1]}`;
if (isCli) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
