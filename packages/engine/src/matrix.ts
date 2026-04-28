import { Move } from '@smogon/calc';
import type { Generation } from '@smogon/calc/dist/data/interface';
import { calc } from './calc.js';
import { effectiveSpeed } from './speed.js';
import type { SideSpeedModifiers } from './speed.js';
import type {
  Field,
  KitCell,
  KitDescriptor,
  Matchup,
  OutcomeProbability,
  Pokemon,
  Side,
  TeamSet,
} from './types.js';

/**
 * One side's full per-move damage grid against the opposing team.
 *
 * `cells[a][d]` = list of `KitCell` — one per opp-kit candidate at the
 * uncertain side of the (a, d) pair. Each `KitCell` carries the per-move
 * calc results (`matchups`) for that kit, plus the kit's prior weight
 * and a lightweight `KitDescriptor` for breakdowns.
 *
 * Why "list of KitCells, not list of Matchups": closed-sheet input only
 * gives opp species, so a single concrete (item, ability, moves, spread)
 * kit per opp slot is fiction. The matrix becomes additive over kit
 * candidates — `score` reads expected counts by summing `weight × indicator`
 * (or `weight × pOhko`) across cells. When the caller passes concrete opp
 * Pokémon (M3 path), `matrix` emits a single-cell list with `weight = 1.0`
 * per (a, d), recovering M3's behaviour bit-for-bit.
 */
export interface MatrixSide {
  readonly attackers: TeamSet;
  readonly defenders: TeamSet;
  readonly cells: ReadonlyArray<ReadonlyArray<readonly KitCell[]>>;
}

export interface MatchupMatrix {
  readonly my: MatrixSide;
  readonly opp: MatrixSide;
}

/**
 * One opp-kit candidate as the matrix builder consumes it: the concrete
 * `Pokemon` that calc should run damage against, the descriptor that the
 * KitCell surfaces back to scoring/report layers, and the prior weight.
 *
 * Decoupling this from `@pva/priors`'s `KitCandidate` keeps the engine
 * package's runtime imports zero — the priors layer's `KitCandidate`
 * carries spread / nature / EVs that engine doesn't read. Callers
 * convert at the boundary (see `recommendBPFromSpecies`).
 */
export interface OppKitOption {
  readonly pokemon: Pokemon;
  readonly kit: KitDescriptor;
  readonly weight: number;
}

/**
 * Optional injected probability function. Receives the (attacker, defender,
 * move, field) tuple plus the kit descriptor for the *opp* side of the
 * pair (whichever side it is for the given direction) and returns the
 * outcome probability the matrix should attach to each `Matchup`.
 *
 * Why a function param rather than a runtime priors import: per
 * `qc-structural-authority.md` §A2, `engine → priors` runtime imports
 * are a structural finding. Injecting the function preserves the
 * `engine` package's purity (no fs / net / cross-package runtime
 * dependency) and lets the caller wire `priors.outcomeProbability(...)`
 * at the CLI / web layer where mixing the two packages is fine. Pure
 * concrete-kit callers omit it; the matrix derives a deterministic
 * P(OHKO) from the calc's `koChance` / `notation` instead.
 */
export type OutcomeProbabilityFn = (input: {
  readonly attacker: Pokemon;
  readonly defender: Pokemon;
  readonly move: Move;
  readonly field: Field | undefined;
  readonly attackerKit: KitDescriptor;
  readonly defenderKit: KitDescriptor;
  /** Which side of the field is the *uncertain* one — i.e. whose kit varies. */
  readonly uncertainSide: 'attacker' | 'defender';
}) => OutcomeProbability;

export interface MatrixOptions {
  /**
   * Field state used for both directions. The wrapper passes this through to
   * `@smogon/calc.calculate`. Defaults to `{ gameType: 'Doubles' }` since the
   * VGC use case is doubles — but spread-move halving is the calc's job, not
   * the matrix's.
   */
  readonly field?: Field;
  /**
   * Per opp slot, the kit candidates the matrix iterates over. When omitted,
   * the matrix builds one kit cell per opp slot from the concrete `Pokemon`
   * the caller already supplied (the M3 backwards-compat path). Length must
   * match `oppTeam`'s length when present.
   */
  readonly oppKits?: ReadonlyArray<readonly OppKitOption[]>;
  /**
   * Optional callable that maps a (move, kit-pair, field) tuple to a
   * real-valued outcome probability. See `OutcomeProbabilityFn`. When
   * omitted, the matrix derives a binary indicator from the calc result —
   * matches M3 semantics for concrete-kit input.
   */
  readonly outcomeProbability?: OutcomeProbabilityFn;
  /**
   * Per-side speed modifiers (Tailwind, Trick Room) used when populating
   * each `KitCell.effectiveSpeed`. The matrix bakes the opp-side
   * modifiers into the kit's pre-computed speed so `score.pickedOutspeedOpp`
   * can weight by kit cell. Mirrors the `sideSpeedModifiers` field on
   * `RecommendBpOptions`; the higher-level `recommendBP` entry point
   * forwards it through. When omitted, no side mods apply (vanilla speeds).
   */
  readonly sideSpeedModifiers?: { [K in Side]?: SideSpeedModifiers };
}

function shouldCalc(move: Move): boolean {
  // Status moves do no damage; skip to keep the matrix focused on KO math.
  // BP-zero damaging moves (e.g. counter-style) get a 0 damage range from
  // calc, but we still want to record them — they're rare but real.
  return move.category !== 'Status';
}

/** Derive a `KitDescriptor` from a fully-built `Pokemon`. Used on the M3
 *  path where the caller passes concrete opp mons rather than kit options. */
function describeConcrete(p: Pokemon): KitDescriptor {
  const moves: string[] = [];
  for (const m of p.moves) {
    if (m) moves.push(m);
  }
  return {
    species: p.name,
    item: p.item ?? '',
    ability: p.ability ?? '',
    moves,
  };
}

/**
 * Default OutcomeProbability when the caller didn't inject one. Maps the
 * existing M3 indicator (`koChance: 1 && notation.includes('OHKO')`) to a
 * binary {0, 1} probability. `pTwoHko` mirrors `pOhko` because the M3
 * path didn't track 2HKO separately — score's M3 logic only consumed
 * 1HKO indicators, and that's the scope of this slice.
 */
function deterministicOutcome(damage: Matchup['damage']): OutcomeProbability {
  const ohko = damage.koChance === 1 && damage.notation.includes('OHKO') ? 1 : 0;
  return { pOhko: ohko, pTwoHko: ohko };
}

function matchupsForKit(
  gen: Generation,
  attacker: Pokemon,
  defender: Pokemon,
  attackerKit: KitDescriptor,
  defenderKit: KitDescriptor,
  field: Field | undefined,
  uncertainSide: 'attacker' | 'defender',
  outcomeProbability: OutcomeProbabilityFn | undefined,
): readonly Matchup[] {
  const out: Matchup[] = [];
  for (const moveName of attacker.moves) {
    if (!moveName) continue;
    const move = new Move(gen, moveName);
    if (!shouldCalc(move)) continue;
    const base = calc(gen, attacker, defender, move, field);
    const outcome = outcomeProbability
      ? outcomeProbability({
          attacker,
          defender,
          move,
          field,
          attackerKit,
          defenderKit,
          uncertainSide,
        })
      : deterministicOutcome(base.damage);
    out.push({ ...base, outcome });
  }
  return out;
}

/**
 * Build the cells for one direction. `attackers` and `defenders` are the
 * side's perspective (e.g. on the `my` side, attackers = myTeam,
 * defenders = oppTeam). `oppDefenderOptions` carries opp-kit options when
 * opp sits on the *defender* axis (i.e. the my side); `oppAttackerOptions`
 * does the same for the opp side. Exactly one of them is populated per
 * call — the function knows which axis is uncertain from `uncertainSide`.
 *
 * `oppSideMods` is the side-modifier bundle that applies to the opp side
 * of the field — the kit-bearing side. We bake it into each KitCell's
 * `effectiveSpeed` so the score layer doesn't have to re-derive per-kit
 * speed deltas (Choice Scarf, +1 boost, etc.).
 */
function cellsFor(
  gen: Generation,
  attackers: TeamSet,
  defenders: TeamSet,
  field: Field | undefined,
  uncertainSide: 'attacker' | 'defender',
  oppOptionsByIdx: ReadonlyArray<readonly OppKitOption[]>,
  outcomeProbability: OutcomeProbabilityFn | undefined,
  oppSideMods: SideSpeedModifiers,
): ReadonlyArray<ReadonlyArray<readonly KitCell[]>> {
  return attackers.map((attacker, ai) =>
    defenders.map((defender, di) => {
      const concreteSideIdx = uncertainSide === 'attacker' ? ai : di;
      const concreteSidePokemon = uncertainSide === 'attacker' ? attacker : defender;
      const options = oppOptionsByIdx[concreteSideIdx];
      // M3 path: caller didn't supply oppKits → emit a single cell with
      // weight 1 derived from the concrete Pokémon.
      if (options === undefined) {
        const concreteDescriptor = describeConcrete(concreteSidePokemon);
        const otherDescriptor = describeConcrete(
          uncertainSide === 'attacker' ? defender : attacker,
        );
        const attackerKit = uncertainSide === 'attacker' ? concreteDescriptor : otherDescriptor;
        const defenderKit = uncertainSide === 'attacker' ? otherDescriptor : concreteDescriptor;
        return [
          {
            weight: 1,
            kit: concreteDescriptor,
            matchups: matchupsForKit(
              gen,
              attacker,
              defender,
              attackerKit,
              defenderKit,
              field,
              uncertainSide,
              outcomeProbability,
            ),
            // The opp-side Pokémon is the concrete one on the M3 path —
            // single weight-1 cell, speed equals the global ranking's
            // opp-side speed for this slot. Bit-for-bit compatible.
            effectiveSpeed: effectiveSpeed(concreteSidePokemon, {}, oppSideMods),
          },
        ];
      }
      // Closed-sheet path: iterate over each opp kit candidate.
      const otherDescriptor = describeConcrete(uncertainSide === 'attacker' ? defender : attacker);
      return options.map((opt) => {
        const realAttacker = uncertainSide === 'attacker' ? opt.pokemon : attacker;
        const realDefender = uncertainSide === 'attacker' ? defender : opt.pokemon;
        const attackerKit = uncertainSide === 'attacker' ? opt.kit : otherDescriptor;
        const defenderKit = uncertainSide === 'attacker' ? otherDescriptor : opt.kit;
        return {
          weight: opt.weight,
          kit: opt.kit,
          matchups: matchupsForKit(
            gen,
            realAttacker,
            realDefender,
            attackerKit,
            defenderKit,
            field,
            uncertainSide,
            outcomeProbability,
          ),
          // Per-kit speed: each candidate's `Pokemon` already encodes its
          // item (Choice Scarf flips here automatically) and spread, so the
          // helper handles the kit dimension naturally.
          effectiveSpeed: effectiveSpeed(opt.pokemon, {}, oppSideMods),
        };
      });
    }),
  );
}

/**
 * Compute the full damage grid for two teams, both directions.
 *
 * Pure: no globals, no I/O. The Pokémon objects must already carry their
 * move list (`pokemon.moves`); this function only iterates them. Use the
 * `Pokemon` constructor's `moves` option to populate.
 *
 * Backwards compatibility: omitting `options.oppKits` reproduces M3
 * behaviour — every cell gets a single `KitCell` with `weight: 1` whose
 * `kit` descriptor is derived from the concrete opp Pokémon. The same
 * call site that worked at M3 still works here.
 */
export function matrix(
  gen: Generation,
  myTeam: TeamSet,
  oppTeam: TeamSet,
  options: MatrixOptions = {},
): MatchupMatrix {
  const { field, oppKits, outcomeProbability, sideSpeedModifiers } = options;
  if (oppKits !== undefined && oppKits.length !== oppTeam.length) {
    throw new Error(
      `matrix: options.oppKits.length (${oppKits.length}) must match oppTeam.length (${oppTeam.length})`,
    );
  }
  // On the my side, my mons attack opp mons → the opp is the defender,
  // so opp-kit options index defenders. On the opp side, opp mons attack
  // my mons → the opp is the attacker, so opp-kit options index attackers.
  const oppAsDefenderOptions = oppKits ?? [];
  const oppAsAttackerOptions = oppKits ?? [];
  // Both directions' KitCells live on the *opp* side — that's the only
  // side with kit ambiguity under closed-sheet input. We bake `sideMods.opp`
  // into every cell's `effectiveSpeed`, regardless of which direction the
  // matrix builder is running.
  const oppSideMods = sideSpeedModifiers?.opp ?? {};
  return {
    my: {
      attackers: myTeam,
      defenders: oppTeam,
      cells: cellsFor(
        gen,
        myTeam,
        oppTeam,
        field,
        'defender',
        oppAsDefenderOptions,
        outcomeProbability,
        oppSideMods,
      ),
    },
    opp: {
      attackers: oppTeam,
      defenders: myTeam,
      cells: cellsFor(
        gen,
        oppTeam,
        myTeam,
        field,
        'attacker',
        oppAsAttackerOptions,
        outcomeProbability,
        oppSideMods,
      ),
    },
  };
}
