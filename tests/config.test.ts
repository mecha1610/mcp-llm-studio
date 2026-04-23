import { describe, it, expect, afterEach } from 'vitest';
import { readEnvInt } from '../src/config.js';

const VAR = 'LM_STUDIO_TEST_INT_ONLY';

describe('readEnvInt', () => {
  afterEach(() => {
    delete process.env[VAR];
  });

  it('returns default when unset', () => {
    delete process.env[VAR];
    expect(readEnvInt(VAR, 42)).toBe(42);
  });

  it('returns default when empty', () => {
    process.env[VAR] = '';
    expect(readEnvInt(VAR, 42)).toBe(42);
  });

  it('parses a positive integer', () => {
    process.env[VAR] = '15000';
    expect(readEnvInt(VAR, 42)).toBe(15000);
  });

  it('rejects non-numeric and returns default', () => {
    process.env[VAR] = 'forever';
    expect(readEnvInt(VAR, 42)).toBe(42);
  });

  it('rejects floats and returns default', () => {
    process.env[VAR] = '1.5';
    expect(readEnvInt(VAR, 42)).toBe(42);
  });

  it('rejects zero and returns default', () => {
    process.env[VAR] = '0';
    expect(readEnvInt(VAR, 42)).toBe(42);
  });

  it('rejects negatives and returns default', () => {
    process.env[VAR] = '-1000';
    expect(readEnvInt(VAR, 42)).toBe(42);
  });

  it('rejects whitespace-only and returns default', () => {
    process.env[VAR] = '   ';
    expect(readEnvInt(VAR, 42)).toBe(42);
  });
});
