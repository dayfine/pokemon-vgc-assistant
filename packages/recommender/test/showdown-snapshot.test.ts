import { describe, expect, it } from 'vitest';

import {
  itemExists,
  megaStoneTriggers,
  speciesEntry,
  speciesHasAbility,
  speciesLearnsMoveGen9,
  toID,
} from './helpers/showdown-snapshot';

describe('showdown-snapshot loader', () => {
  describe('toID', () => {
    it('lowercases and strips non-alphanumeric', () => {
      expect(toID('Indeedee-F')).toBe('indeedeef');
      expect(toID('Kommo-o')).toBe('kommoo');
      expect(toID('Mr. Mime')).toBe('mrmime');
      expect(toID('Helping Hand')).toBe('helpinghand');
      expect(toID('Good as Gold')).toBe('goodasgold');
    });
  });

  describe('speciesLearnsMoveGen9', () => {
    // Positive cases: species we actually claim use these moves in
    // facts.ts post-M6.5.1.
    it.each([
      ['Hitmontop', 'Wide Guard'],
      ['Hitmontop', 'Quick Guard'],
      ['Hitmontop', 'Fake Out'],
      ['Mienshao', 'Wide Guard'],
      ['Mienshao', 'Quick Guard'],
      ['Indeedee-F', 'Helping Hand'],
      ['Indeedee-F', 'Follow Me'],
      ['Whimsicott', 'Helping Hand'],
      ['Whimsicott', 'Tailwind'],
      ['Whimsicott', 'Encore'],
      ['Pelipper', 'Tailwind'],
      ['Salamence', 'Tailwind'],
      ['Dragonite', 'Extreme Speed'],
      ['Baxcalibur', 'Glaive Rush'],
      ['Corviknight', 'Body Press'],
      ['Aggron', 'Body Press'],
    ])('%s learns %s', (species, move) => {
      expect(speciesLearnsMoveGen9(species, move)).toBe(true);
    });

    // Regression: M6.5.1 QC findings. Each of these would have been
    // caught at CI by the data gate had it existed.
    it.each([
      ['Sneasler', 'Helping Hand'], // B-LRN
      ['Sinistcha', 'Helping Hand'], // B-LRN
      ['Kommo-o', 'Wide Guard'], // B-LRN-2
      ['Toxicroak', 'Wide Guard'], // B-LRN-2
      ['Kommo-o', 'Quick Guard'], // B-LRN-3
    ])('%s does NOT learn %s (M6.5.1 regression case)', (species, move) => {
      expect(speciesLearnsMoveGen9(species, move)).toBe(false);
    });

    it('unknown species returns false', () => {
      expect(speciesLearnsMoveGen9('NotARealMon', 'Tackle')).toBe(false);
    });

    it('unknown move returns false', () => {
      expect(speciesLearnsMoveGen9('Pikachu', 'TotallyMadeUpMove')).toBe(false);
    });
  });

  describe('speciesHasAbility', () => {
    it.each([
      ['Pelipper', 'Drizzle'],
      ['Torkoal', 'Drought'],
      ['Ninetales', 'Drought'],
      ['Hydreigon', 'Levitate'],
      ['Gholdengo', 'Good as Gold'],
      ['Rillaboom', 'Grassy Surge'],
      ['Amoonguss', 'Effect Spore'],
      ['Whimsicott', 'Prankster'],
      ['Dragonite', 'Multiscale'],
      ['Tatsugiri', 'Commander'],
    ])('%s has %s', (species, ability) => {
      expect(speciesHasAbility(species, ability)).toBe(true);
    });

    it('unknown ability returns false', () => {
      expect(speciesHasAbility('Pelipper', 'Solar Power')).toBe(false);
    });

    it('unknown species returns false', () => {
      expect(speciesHasAbility('NotARealMon', 'Drizzle')).toBe(false);
    });
  });

  describe('itemExists / megaStoneTriggers', () => {
    it('known Mega Stones exist', () => {
      expect(itemExists('Salamencite')).toBe(true);
      expect(itemExists('Metagrossite')).toBe(true);
      expect(itemExists('Charizardite Y')).toBe(true);
    });

    it('common items exist', () => {
      expect(itemExists('Choice Scarf')).toBe(true);
      expect(itemExists('Safety Goggles')).toBe(true);
      expect(itemExists('Covert Cloak')).toBe(true);
      expect(itemExists('Eject Pack')).toBe(true);
      expect(itemExists('Focus Sash')).toBe(true);
    });

    it('unknown item returns false', () => {
      expect(itemExists('Definitely Not An Item')).toBe(false);
    });

    it('Mega Stones list their base-form triggers', () => {
      expect(megaStoneTriggers('Salamencite')).toEqual(['Salamence']);
      expect(megaStoneTriggers('Metagrossite')).toEqual(['Metagross']);
      expect(megaStoneTriggers('Charizardite Y')).toEqual(['Charizard']);
    });

    it('non-Mega-Stone items return an empty array', () => {
      expect(megaStoneTriggers('Choice Scarf')).toEqual([]);
    });
  });

  describe('speciesEntry', () => {
    it('returns the pokedex entry for a known species', () => {
      const entry = speciesEntry('Hitmontop');
      expect(entry).toBeDefined();
      expect(entry?.name).toBe('Hitmontop');
      expect(entry?.types).toEqual(['Fighting']);
    });

    it('handles dashed forms', () => {
      const entry = speciesEntry('Indeedee-F');
      expect(entry?.name).toBe('Indeedee-F');
    });
  });
});
