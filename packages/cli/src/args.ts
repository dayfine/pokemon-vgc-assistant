/**
 * Hand-rolled argv parser. We have ~3 subcommands × handful of flags;
 * pulling in `commander` / `yargs` / `mri` is overkill for the surface.
 *
 * Shape: positional args, `--flag value` (and `--flag=value`), and
 * `--repeated value` for arrays. No `-x` short flags in v1 — every
 * flag is explicit. No bundled boolean flags. The parser does no
 * validation beyond shape — subcommand handlers decide which flags
 * are required.
 */

export interface ParsedArgs {
  /** First positional arg, e.g. `recommend` or `teams`. */
  readonly command: string | undefined;
  /** Remaining positionals, in order. e.g. `teams show <id>` → `['show', '<id>']`. */
  readonly positionals: readonly string[];
  /**
   * Single-value flags, e.g. `--my-team charx-vgc` → `{ 'my-team': 'charx-vgc' }`.
   * If a flag is repeated as a single-value flag, the last value wins.
   */
  readonly flags: Readonly<Record<string, string>>;
  /**
   * Repeated flags, e.g. `--notes 'a' --notes 'b'` → `{ notes: ['a', 'b'] }`.
   * Values appear in caller-supplied order.
   */
  readonly arrayFlags: Readonly<Record<string, readonly string[]>>;
  /** Boolean flags, e.g. `--json` → `{ json: true }`. */
  readonly bools: Readonly<Record<string, boolean>>;
}

/**
 * Parse argv. The runtime entry receives `process.argv.slice(2)`; tests
 * pass argv arrays directly.
 *
 * Disambiguation: a `--flag` followed by another `--flag` (or end of
 * argv) is treated as a boolean. `--flag=value` is always a value flag.
 * Repeated `--flag value --flag value` accumulates into `arrayFlags`.
 */
export function parseArgs(
  argv: readonly string[],
  config: { readonly arrayFlags?: readonly string[]; readonly bools?: readonly string[] } = {},
): ParsedArgs {
  const arrayFlagSet = new Set(config.arrayFlags ?? []);
  const boolSet = new Set(config.bools ?? []);

  const positionals: string[] = [];
  const flags: Record<string, string> = {};
  const arrayFlags: Record<string, string[]> = {};
  const bools: Record<string, boolean> = {};

  let command: string | undefined;
  let i = 0;
  while (i < argv.length) {
    const tok = argv[i];
    if (tok === undefined) {
      i += 1;
      continue;
    }
    if (tok.startsWith('--')) {
      const eq = tok.indexOf('=');
      const name = eq >= 0 ? tok.slice(2, eq) : tok.slice(2);
      const inlineValue = eq >= 0 ? tok.slice(eq + 1) : undefined;
      if (boolSet.has(name)) {
        bools[name] = true;
        i += 1;
        continue;
      }
      let value: string;
      if (inlineValue !== undefined) {
        value = inlineValue;
        i += 1;
      } else {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) {
          // No following value — treat as a bare boolean even if not
          // pre-declared. Subcommands that expect a value will surface
          // a clearer error than the parser would.
          bools[name] = true;
          i += 1;
          continue;
        }
        value = next;
        i += 2;
      }
      if (arrayFlagSet.has(name)) {
        const bucket = arrayFlags[name] ?? [];
        bucket.push(value);
        arrayFlags[name] = bucket;
      } else {
        flags[name] = value;
      }
    } else {
      if (command === undefined) command = tok;
      else positionals.push(tok);
      i += 1;
    }
  }

  return { command, positionals, flags, arrayFlags, bools };
}
