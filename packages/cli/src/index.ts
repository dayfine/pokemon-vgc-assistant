/**
 * `@pva/cli` — exported surface for tests and any future programmatic
 * embedders. The actual binary entry is `dist/main.js` (per
 * `package.json` `bin.pva`).
 */

export { parseArgs } from './args.js';
export type { ParsedArgs } from './args.js';
export { main } from './main.js';
export {
  type RecommendCommandArgs,
  type RecommendCommandContext,
  parseFormatFlag,
  parseSheetModeFlag,
  recommendCommand,
} from './commands/recommend.js';
export {
  type TeamsCommandContext,
  teamsList,
  teamsShow,
  teamsValidate,
} from './commands/teams.js';
export { type OrchestrateOptions, type OrchestrateResult, orchestrate } from './orchestrate.js';
export { renderMarkdown } from './render/markdown.js';
export { type ParsedTeam, TeamParseError, parseTeam } from './teams/parse.js';
export {
  type ResolveTeamOptions,
  resolveTeamPath,
  teamsDir,
  teamsDirCandidates,
} from './teams/resolve.js';
export { OppKitMissingError, oppTeamFromVision } from './teams/from-vision.js';
export { oppSlotPriorsFromVision } from './teams/from-vision-closed.js';
export {
  type DefaultPriorsClientOptions,
  type PriorsClient,
  createDefaultPriorsClient,
} from './priors.js';
