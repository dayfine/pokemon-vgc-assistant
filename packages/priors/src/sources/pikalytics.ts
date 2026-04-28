/**
 * Pikalytics AI-endpoint client + Markdown parser.
 *
 * This is the *only* file in the repo that knows about Pikalytics' slug
 * conventions or the `/ai/pokedex/...` URL shape. Internal format IDs flow
 * in as parameters; the translation table below is the single bridge to
 * Pikalytics' naming.
 *
 * Per `dev/research/pikalytics-2026-04-27.md`:
 *   - ClaudeBot is allow-listed in robots.txt; the `/ai/` endpoints are the
 *     canonical AI surface.
 *   - The Markdown response includes Common Moves / Abilities / Items
 *     sections with bullet rows of `- **<name>**: <percent>%`.
 *   - EV spread / nature / Tera are not exposed.
 *
 * Tests inject the fetcher; `fetchPikalytics` is the thin live-network
 * wrapper. No live calls in unit tests — the parser tests feed committed
 * fixture Markdown directly.
 */

import type { AbilityPrior, ItemPrior, MovePrior, PikalyticsSpeciesData } from '../types.js';

/**
 * Internal format ID + sheet-mode → Pikalytics slug. The translation table is
 * intentionally explicit (not a regex over the format ID) because the
 * mapping is not regular: Reg M-A's slug is `championspreview`, Reg M-A
 * tournament data is `championstournaments`, and earlier formats use
 * Showdown-style slugs (`gen9vgc2026regf`). See the design doc.
 */
const PIKALYTICS_SLUGS: Readonly<Record<string, Readonly<Record<SheetMode, string>>>> = {
  gen9championsvgc2026regma: {
    closed: 'championspreview',
    open: 'championstournaments',
  },
};

export type SheetMode = 'closed' | 'open';

export class UnknownFormatError extends Error {
  constructor(format: string, sheetMode: SheetMode) {
    super(`No Pikalytics slug registered for format='${format}' sheetMode='${sheetMode}'`);
    this.name = 'UnknownFormatError';
  }
}

/**
 * Resolve `(format, sheetMode)` → Pikalytics slug. Throws `UnknownFormatError`
 * for unmapped pairs — silent fallthrough to "championspreview" would mask
 * config typos at runtime.
 */
export function pikalyticsSlug(format: string, sheetMode: SheetMode): string {
  const entry = PIKALYTICS_SLUGS[format];
  if (entry === undefined) throw new UnknownFormatError(format, sheetMode);
  const slug = entry[sheetMode];
  if (slug === undefined) throw new UnknownFormatError(format, sheetMode);
  return slug;
}

/**
 * Build the AI-endpoint URL for `(format, sheetMode, species)`. Species
 * names are URL-encoded as-is — Pikalytics accepts both `Incineroar` and
 * `Calyrex-Shadow` style with a literal hyphen, so we don't lower-case or
 * de-hyphenate.
 */
export function pikalyticsUrl(format: string, sheetMode: SheetMode, species: string): string {
  const slug = pikalyticsSlug(format, sheetMode);
  return `https://www.pikalytics.com/ai/pokedex/${slug}/${encodeURIComponent(species)}`;
}

/** User-Agent used by `fetchPikalytics`. Made distinctive so Pikalytics
 *  can identify our traffic if there's ever a problem. Bumped per package
 *  version so a later coordinated change to traffic patterns is easy. */
export const USER_AGENT =
  'pokemon-vgc-assistant/0.0.0 (+https://github.com/dayfine/pokemon-vgc-assistant)';

/**
 * Live fetch of the Pikalytics AI endpoint. Returns the raw Markdown
 * response body. Throws if HTTP status ≠ 2xx — Pikalytics returns
 * `Pokemon not found` with a 404 for unknown species, and we want callers
 * to see that explicitly rather than feeding it through the parser.
 *
 * Tests inject a custom fetcher via `parsePikalyticsMarkdown` directly;
 * this function is *not* exercised by the unit-test suite.
 */
export async function fetchPikalytics(
  format: string,
  sheetMode: SheetMode,
  species: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const url = pikalyticsUrl(format, sheetMode, species);
  const res = await fetcher(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Pikalytics fetch failed: ${res.status} ${res.statusText} for ${url}`);
  }
  return res.text();
}

// --- Markdown parser ---------------------------------------------------------

const SECTION_RE = /^##\s+(.+?)\s*$/;
const BULLET_RE = /^-\s+\*\*(.+?)\*\*\s*:\s*([\d.]+)\s*%\s*$/;
const QUICK_INFO_FORMAT_RE = /\*\*Format\*\*\s*\|\s*(.+?)\s*\|\s*$/m;
const QUICK_INFO_DATA_DATE_RE = /\*\*Data Date\*\*\s*\|\s*(.+?)\s*\|\s*$/m;
const TITLE_SPECIES_RE = /^#\s+([^\s-]+(?:\s+[^\s-]+)*?)\s+-\s+/;

function parseBulletList(lines: readonly string[]): Array<{ name: string; percent: number }> {
  const out: Array<{ name: string; percent: number }> = [];
  for (const line of lines) {
    const m = BULLET_RE.exec(line);
    if (!m) continue;
    const name = m[1];
    const pctStr = m[2];
    if (name === undefined || pctStr === undefined) continue;
    const percent = Number.parseFloat(pctStr);
    if (Number.isFinite(percent)) out.push({ name, percent });
  }
  return out;
}

/**
 * Parse a Pikalytics AI-endpoint Markdown response into structured
 * priors. Recognises the three sections we need (Common Items, Common
 * Abilities, Common Moves) and pulls species + format + data-date from
 * the title line and the Quick Info table.
 *
 * Unknown sections are skipped, not treated as errors — Pikalytics
 * occasionally adds new sections (FAQ, Featured Teams, Common
 * Teammates) and we want the parser stable against those additions.
 */
export function parsePikalyticsMarkdown(md: string): PikalyticsSpeciesData {
  const lines = md.split(/\r?\n/);

  // Section -> body lines, accumulated linearly. The Markdown is tiny
  // (~6 KB), so a single pass with a string switch is fine.
  let currentSection: string | undefined;
  const sections: Record<string, string[]> = {};
  for (const line of lines) {
    const m = SECTION_RE.exec(line);
    if (m) {
      const name = m[1];
      if (name === undefined) continue;
      currentSection = name;
      sections[currentSection] = [];
      continue;
    }
    if (currentSection !== undefined) {
      const bucket = sections[currentSection];
      if (bucket !== undefined) bucket.push(line);
    }
  }

  const items: readonly ItemPrior[] = parseBulletList(sections['Common Items'] ?? []);
  const abilities: readonly AbilityPrior[] = parseBulletList(sections['Common Abilities'] ?? []);
  const moves: readonly MovePrior[] = parseBulletList(sections['Common Moves'] ?? []);

  // Species comes from the H1 title: "# Incineroar - Pokemon Champions VGC ..."
  // The title can contain multi-word names ("Calyrex-Shadow", "Iron Hands"),
  // so we split on the literal " - " separator rather than whitespace.
  const titleLine = lines.find((l) => l.startsWith('# '));
  let species = '';
  if (titleLine !== undefined) {
    const dashIdx = titleLine.indexOf(' - ');
    if (dashIdx > 2) species = titleLine.slice(2, dashIdx).trim();
    else {
      const m = TITLE_SPECIES_RE.exec(titleLine);
      if (m?.[1] !== undefined) species = m[1];
    }
  }

  // Format + data-date from Quick Info table.
  const formatMatch = QUICK_INFO_FORMAT_RE.exec(md);
  const format = formatMatch?.[1]?.trim() ?? '';
  const dataDateMatch = QUICK_INFO_DATA_DATE_RE.exec(md);
  const dataDate = dataDateMatch?.[1]?.trim() ?? '';

  return { species, format, dataDate, items, abilities, moves };
}
