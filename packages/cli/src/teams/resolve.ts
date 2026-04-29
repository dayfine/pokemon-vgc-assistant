import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Resolves the my-team argument to a path on disk.
 *
 * `--my-team <value>` accepts:
 * - **Path-like input** (contains `/`, `\`, `.`, or starts with `~`):
 *   treated as an explicit file path. Relative paths resolve against
 *   `cwd`.
 * - **Bare ID** (alphanumerics, hyphens, underscores): resolves to
 *   `<teamsDir>/<id>.txt` via the lookup chain.
 *
 * `<teamsDir>` lookup order (first match that exists wins; we don't
 * verify file existence at lookup time — only the parent directory's):
 * 1. `--teams-dir <path>` flag (passed in as `cliTeamsDir`)
 * 2. `$PVA_TEAMS_DIR` env var
 * 3. `$XDG_CONFIG_HOME/pva/teams/` if `$XDG_CONFIG_HOME` is set
 * 4. `~/.config/pva/teams/`
 * 5. `./teams/` (repo-local fallback for dev / first-run)
 *
 * Returns the resolved file path. Caller is responsible for reading
 * + parsing.
 */
export interface ResolveTeamOptions {
  readonly cliTeamsDir?: string;
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly home?: string;
}

const ID_RE = /^[A-Za-z0-9_-]+$/;

export function resolveTeamPath(value: string, opts: ResolveTeamOptions = {}): string {
  const cwd = opts.cwd ?? process.cwd();
  const env = opts.env ?? process.env;
  const home = opts.home ?? homedir();

  if (looksLikePath(value)) {
    return resolve(cwd, expandTilde(value, home));
  }
  if (!ID_RE.test(value)) {
    throw new Error(
      `Team value "${value}" is neither a path (contains /, \\, ., or ~) nor a bare ID (alphanumeric / underscore / hyphen). Pass --my-team <id> or --my-team <path>.`,
    );
  }
  const dir = teamsDir(opts.cliTeamsDir, env, home);
  return join(dir, `${value}.txt`);
}

/**
 * Resolves the `<teamsDir>` for ID-based my-team lookups. Exposed for
 * `pva teams list` (which scans the directory) and for error
 * messages that show the user which path was searched.
 */
export function teamsDir(
  cliTeamsDir: string | undefined,
  env: NodeJS.ProcessEnv,
  home: string,
): string {
  if (cliTeamsDir !== undefined && cliTeamsDir.length > 0) {
    return resolve(cliTeamsDir);
  }
  const envDir = env.PVA_TEAMS_DIR;
  if (envDir !== undefined && envDir.length > 0) {
    return resolve(expandTilde(envDir, home));
  }
  const xdg = env.XDG_CONFIG_HOME;
  if (xdg !== undefined && xdg.length > 0) {
    return join(xdg, 'pva', 'teams');
  }
  return join(home, '.config', 'pva', 'teams');
}

/**
 * Returns the chain of directories the resolver walks for a bare ID,
 * in priority order. Used by the "no team found" error message so the
 * user sees every searched path.
 */
export function teamsDirCandidates(
  cliTeamsDir: string | undefined,
  env: NodeJS.ProcessEnv,
  home: string,
  cwd: string,
): readonly string[] {
  return [teamsDir(cliTeamsDir, env, home), join(cwd, 'teams')];
}

function looksLikePath(value: string): boolean {
  return (
    value.includes('/') || value.includes('\\') || value.includes('.') || value.startsWith('~')
  );
}

function expandTilde(value: string, home: string): string {
  if (value === '~') return home;
  if (value.startsWith('~/')) return join(home, value.slice(2));
  return value;
}
