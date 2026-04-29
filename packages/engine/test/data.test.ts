import { describe, expect, it } from 'vitest';
import { DEFAULT_FORMAT, type Format, getGeneration } from '../src/data.js';

describe('Format type — multi-format support', () => {
  it('default format is Reg M-A', () => {
    expect(DEFAULT_FORMAT).toBe('gen9championsvgc2026regma');
  });

  it('every Format value resolves to a Generation via getGeneration', () => {
    const formats: readonly Format[] = ['gen9championsvgc2026regma', 'gen9championsvgc2026regmb'];
    for (const format of formats) {
      const gen = getGeneration(format);
      expect(gen, `format ${format} did not resolve to a Generation`).toBeDefined();
      expect(gen.num).toBe(9);
    }
  });

  it('getGeneration without args resolves to the default format', () => {
    // `Generations.get(9)` returns a fresh wrapper per call, so identity
    // comparison fails; assert equivalent generation numbers.
    expect(getGeneration().num).toBe(getGeneration(DEFAULT_FORMAT).num);
  });
});
