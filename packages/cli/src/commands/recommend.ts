import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import type { Format } from '@pva/engine';
import type { SheetMode, VisionImage } from '@pva/vision';
import { orchestrate } from '../orchestrate.js';
import { renderMarkdown } from '../render/markdown.js';
import { type ParsedTeam, TeamParseError, parseTeam } from '../teams/parse.js';
import { resolveTeamPath } from '../teams/resolve.js';

const DEFAULT_FORMAT: Format = 'gen9championsvgc2026regma';
const DEFAULT_SHEET_MODE: SheetMode = 'closed';
const VALID_FORMATS: readonly Format[] = ['gen9championsvgc2026regma', 'gen9championsvgc2026regmb'];
const VALID_SHEET_MODES: readonly SheetMode[] = ['closed', 'open'];

/**
 * Inputs the recommend subcommand needs from the CLI surface. Tests
 * inject `notes`, `cliTeamsDir`, and the home/cwd/env tuples; in
 * production these come from `process.cwd()` / `process.env` /
 * `os.homedir()`.
 */
export interface RecommendCommandContext {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
  readonly cliTeamsDir: string | undefined;
  readonly stdout: (s: string) => void;
}

export interface RecommendCommandArgs {
  readonly myTeam: string;
  readonly oppPath: string;
  readonly format: Format;
  readonly sheetMode: SheetMode;
  readonly notes: readonly string[];
  readonly emitJson: boolean;
}

export async function recommendCommand(
  ctx: RecommendCommandContext,
  args: RecommendCommandArgs,
): Promise<void> {
  // Resolve + load my-team.
  const myTeamPath = resolveTeamPath(args.myTeam, {
    ...(ctx.cliTeamsDir !== undefined ? { cliTeamsDir: ctx.cliTeamsDir } : {}),
    cwd: ctx.cwd,
    env: ctx.env,
    home: ctx.home,
  });
  if (!existsSync(myTeamPath)) {
    throw new Error(
      `No team found at ${myTeamPath}. Place a Showdown-export .txt at that path or pass --my-team <path>.`,
    );
  }
  let myTeam: ParsedTeam['teamSet'];
  try {
    myTeam = parseTeam(readFileSync(myTeamPath, 'utf8')).teamSet;
  } catch (err) {
    if (err instanceof TeamParseError) {
      throw new Error(`Parse error in ${myTeamPath}: ${err.message}`);
    }
    throw err;
  }

  // Read opp screenshot.
  if (!existsSync(args.oppPath)) {
    throw new Error(`Opp screenshot not found at ${args.oppPath}`);
  }
  const bytes = readFileSync(args.oppPath);
  const mediaType = guessMediaType(args.oppPath);
  const oppImage: VisionImage = { bytes, mediaType };

  // Orchestrate.
  const result = await orchestrate({
    myTeam,
    oppImage,
    format: args.format,
    sheetMode: args.sheetMode,
    ...(args.notes.length > 0 ? { notes: args.notes } : {}),
  });

  if (args.emitJson) {
    ctx.stdout(`${JSON.stringify(result.recommendation, null, 2)}\n`);
  } else {
    ctx.stdout(renderMarkdown(result));
  }
}

/**
 * Validate a `--format` flag value into the strongly-typed `Format`.
 * Surface invalid formats as a clear error rather than letting the
 * downstream layers reject them with less context.
 */
export function parseFormatFlag(value: string | undefined): Format {
  if (value === undefined) return DEFAULT_FORMAT;
  if (!VALID_FORMATS.includes(value as Format)) {
    throw new Error(`Unknown format "${value}". Valid: ${VALID_FORMATS.join(', ')}`);
  }
  return value as Format;
}

export function parseSheetModeFlag(value: string | undefined): SheetMode {
  if (value === undefined) return DEFAULT_SHEET_MODE;
  if (!VALID_SHEET_MODES.includes(value as SheetMode)) {
    throw new Error(`Unknown sheet mode "${value}". Valid: ${VALID_SHEET_MODES.join(', ')}`);
  }
  return value as SheetMode;
}

function guessMediaType(path: string): VisionImage['mediaType'] {
  const ext = extname(path).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      throw new Error(
        `Cannot infer image media type from extension "${ext}". Supported: .jpg/.jpeg, .png, .webp, .gif.`,
      );
  }
}
