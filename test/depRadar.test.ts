import { describe, expect, it } from 'vitest';
import { analyzeLockfile, computeBlastRadius } from '../src/core/lockfileParser.ts';
import {
  SAMPLE_CARGO_LOCK,
  SAMPLE_PACKAGE_LOCK,
  SAMPLE_PNPM_LOCK,
  SAMPLE_UV_LOCK,
} from '../src/core/samples.ts';

describe('dep-radar lockfile parsers & blast-radius engine', () => {
  it('parses package-lock.json v3, flags install scripts, duplicates, and upstream blast chains', () => {
    const graph = analyzeLockfile(SAMPLE_PACKAGE_LOCK, 'package-lock.json');
    expect(graph.ecosystem).toBe('npm');
    expect(graph.stats.totalPackages).toBeGreaterThanOrEqual(20);
    expect(graph.stats.scriptCount).toBeGreaterThanOrEqual(2);
    expect(graph.duplicateNames).toContain('ms');

    const ms = graph.nodes.find((n) => n.name === 'ms' && n.version === '2.1.3');
    expect(ms).toBeDefined();
    expect(ms!.depth).toBeGreaterThanOrEqual(3);

    const blast = computeBlastRadius(graph, ms!.id);
    expect(blast.rootPaths.length).toBeGreaterThanOrEqual(1);
    expect(blast.upstreamIds.size).toBeGreaterThanOrEqual(2);
  });

  it('parses pnpm-lock.yaml, Cargo.lock, and uv.lock cleanly', () => {
    const pnpm = analyzeLockfile(SAMPLE_PNPM_LOCK, 'pnpm-lock.yaml');
    expect(pnpm.ecosystem).toBe('pnpm');
    expect(pnpm.nodes.some((n) => n.name === 'vite')).toBe(true);
    expect(pnpm.nodes.some((n) => n.name === 'pg-protocol')).toBe(true);

    const cargo = analyzeLockfile(SAMPLE_CARGO_LOCK, 'Cargo.lock');
    expect(cargo.ecosystem).toBe('cargo');
    expect(cargo.nodes.some((n) => n.name === 'tokio')).toBe(true);
    expect(cargo.nodes.some((n) => n.name === 'ring' && n.capabilities.includes('native-code'))).toBe(true);

    const uv = analyzeLockfile(SAMPLE_UV_LOCK, 'uv.lock');
    expect(uv.ecosystem).toBe('uv');
    expect(uv.nodes.some((n) => n.name === 'fastapi')).toBe(true);
    expect(uv.nodes.some((n) => n.name === 'pydantic-core')).toBe(true);
  });

  it('computes exclusive removal impact cleanly for direct dependencies', () => {
    const graph = analyzeLockfile(SAMPLE_PACKAGE_LOCK, 'package-lock.json');
    const sharp = graph.nodes.find((n) => n.name === 'sharp')!;
    const blast = computeBlastRadius(graph, sharp.id);
    expect(blast.exclusiveRemovalIds).toContain(sharp.id);
    expect(blast.exclusiveRemovalIds.length).toBeGreaterThanOrEqual(3);
  });
});
