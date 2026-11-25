import { describe, expect, it } from 'vitest';
import { analyzeLockfile } from '../src/core/lockfileParser.ts';
import {
  diffLockfiles,
  evaluateLicensePolicy,
  generateDedupeOverrides,
  SAMPLE_UPGRADED_PACKAGE_LOCK,
} from '../src/core/lockfileDiff.ts';
import { SAMPLE_PACKAGE_LOCK } from '../src/core/samples.ts';

describe('dep-radar Lockfile Diff, License Policy & Dedupe Engine', () => {
  it('computes added, removed, upgraded packages and newly introduced install scripts', () => {
    const before = analyzeLockfile(SAMPLE_PACKAGE_LOCK, 'package-lock.json');
    const after = analyzeLockfile(SAMPLE_UPGRADED_PACKAGE_LOCK, 'package-lock.json');
    const diff = diffLockfiles(before, after);
    expect(diff.added.some((n) => n.name === 'node-pty')).toBe(true);
    expect(diff.newScriptPackages.some((n) => n.name === 'node-pty')).toBe(true);
    expect(diff.upgraded.some((u) => u.name === 'next' && u.afterVersion === '15.6.0')).toBe(true);
  });

  it('enforces strict permissive vs allow-weak-copyleft policies and generates dedupe overrides', () => {
    const graph = analyzeLockfile(SAMPLE_PACKAGE_LOCK, 'package-lock.json');
    const strict = evaluateLicensePolicy(graph, 'strict-permissive');
    expect(strict.some((n) => n.license === 'MPL-2.0')).toBe(true);
    expect(evaluateLicensePolicy(graph, 'open')).toHaveLength(0);

    const overrides = generateDedupeOverrides(graph);
    expect(overrides.ms).toBe('2.1.3');
  });
});
