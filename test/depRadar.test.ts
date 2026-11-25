import { describe, expect, it } from 'vitest';
import { analyzeLockfile, classifyLicenseTier, computeBlastRadius } from '../src/core/lockfileParser.ts';
import { SAMPLE_CARGO_LOCK, SAMPLE_PACKAGE_LOCK, SAMPLE_UV_LOCK } from '../src/core/samples.ts';

describe('dep-radar lockfile parsers & blast-radius engine', () => {
  it('parses package-lock.json v3, flags install scripts, duplicates, and upstream blast chains', () => {
    const graph = analyzeLockfile(SAMPLE_PACKAGE_LOCK, 'package-lock.json');
    expect(graph.ecosystem).toBe('npm');
    expect(graph.duplicateNames).toContain('ms');
    expect(graph.stats.scriptCount).toBeGreaterThanOrEqual(2);

    const ms = graph.nodes.find((n) => n.name === 'ms' && n.version === '2.1.3');
    expect(ms).toBeDefined();
    expect(ms!.depth).toBeGreaterThanOrEqual(3);
    const blast = computeBlastRadius(graph, ms!.id);
    expect(blast.rootPaths.length).toBeGreaterThan(0);
    expect(blast.upstreamIds.has('axios@1.7.9')).toBe(true);
  });

  it('parses pnpm-lock.yaml, Cargo.lock, and uv.lock cleanly', () => {
    const pnpm = analyzeLockfile(
      `
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      zod:
        specifier: ^3.23.0
        version: 3.23.8
packages:
  zod@3.23.8:
    resolution: {integrity: sha512-abc}
`,
      'pnpm-lock.yaml',
    );
    expect(pnpm.ecosystem).toBe('pnpm');
    expect(pnpm.nodes.find((n) => n.name === 'zod')?.direct).toBe(true);

    const cargo = analyzeLockfile(SAMPLE_CARGO_LOCK, 'Cargo.lock');
    expect(cargo.ecosystem).toBe('cargo');
    expect(cargo.nodes.find((n) => n.name === 'ring')?.capabilities).toContain('native-code');

    const uv = analyzeLockfile(SAMPLE_UV_LOCK, 'uv.lock');
    expect(uv.ecosystem).toBe('uv');
    expect(uv.nodes.find((n) => n.name === 'fastapi')?.direct).toBe(true);
    expect(classifyLicenseTier('AGPL-3.0-only')).toBe('strong-copyleft');
  });
});
