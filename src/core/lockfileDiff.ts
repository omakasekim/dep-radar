import type { DepGraph, DepNode } from './types.ts';

export type LicensePolicyMode = 'strict-permissive' | 'allow-weak-copyleft' | 'open';

export interface LockfileDiffReport {
  added: DepNode[];
  removed: DepNode[];
  upgraded: Array<{ name: string; beforeVersion: string; afterVersion: string; riskDelta: number }>;
  newScriptPackages: DepNode[];
  netRiskDelta: number;
}

export function diffLockfiles(before: DepGraph, after: DepGraph): LockfileDiffReport {
  const beforeByName = new Map<string, DepNode>();
  for (const n of before.nodes) {
    if (!beforeByName.has(n.name)) beforeByName.set(n.name, n);
  }
  const afterByName = new Map<string, DepNode>();
  for (const n of after.nodes) {
    if (!afterByName.has(n.name)) afterByName.set(n.name, n);
  }

  const added: DepNode[] = [];
  const removed: DepNode[] = [];
  const upgraded: LockfileDiffReport['upgraded'] = [];

  for (const [name, an] of afterByName) {
    const bn = beforeByName.get(name);
    if (!bn) {
      added.push(an);
    } else if (bn.version !== an.version) {
      upgraded.push({
        name,
        beforeVersion: bn.version,
        afterVersion: an.version,
        riskDelta: an.riskScore - bn.riskScore,
      });
    }
  }
  for (const [name, bn] of beforeByName) {
    if (!afterByName.has(name)) removed.push(bn);
  }

  const newScriptPackages = added.filter((n) => n.capabilities.includes('install-script'));
  const beforeRisk = before.nodes.reduce((a, n) => a + n.riskScore, 0);
  const afterRisk = after.nodes.reduce((a, n) => a + n.riskScore, 0);

  return {
    added,
    removed,
    upgraded,
    newScriptPackages,
    netRiskDelta: afterRisk - beforeRisk,
  };
}

export function evaluateLicensePolicy(graph: DepGraph, policy: LicensePolicyMode): DepNode[] {
  if (policy === 'open') return [];
  if (policy === 'allow-weak-copyleft') {
    return graph.nodes.filter((n) => n.licenseTier === 'strong-copyleft' || n.licenseTier === 'unknown');
  }
  return graph.nodes.filter((n) => n.licenseTier !== 'permissive');
}

export function generateDedupeOverrides(graph: DepGraph): Record<string, string> {
  const versionsByName = new Map<string, string[]>();
  for (const n of graph.nodes) {
    const arr = versionsByName.get(n.name) ?? [];
    if (!arr.includes(n.version)) arr.push(n.version);
    versionsByName.set(n.name, arr);
  }
  const overrides: Record<string, string> = {};
  for (const [name, versions] of versionsByName) {
    if (versions.length > 1) {
      const sorted = [...versions].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      overrides[name] = sorted[0];
    }
  }
  return overrides;
}

export const SAMPLE_UPGRADED_PACKAGE_LOCK = JSON.stringify(
  {
    name: 'chronos-web-stack',
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'chronos-web-stack',
        dependencies: {
          next: '15.6.0',
          axios: '1.8.2',
          sharp: '0.33.5',
          zod: '3.24.1',
          'node-pty': '1.0.0',
        },
      },
      'node_modules/next': {
        version: '15.6.0',
        license: 'MIT',
        dependencies: { react: '19.0.0', postcss: '8.4.49', '@swc/core': '1.10.1' },
      },
      'node_modules/react': { version: '19.0.0', license: 'MIT' },
      'node_modules/postcss': { version: '8.4.49', license: 'MIT', dependencies: { nanoid: '3.3.8', picocolors: '1.1.1' } },
      'node_modules/nanoid': { version: '3.3.8', license: 'MIT' },
      'node_modules/picocolors': { version: '1.1.1', license: 'ISC' },
      'node_modules/@swc/core': { version: '1.10.1', license: 'Apache-2.0', hasInstallScript: true },
      'node_modules/axios': { version: '1.8.2', license: 'MIT', dependencies: { 'follow-redirects': '1.15.9' } },
      'node_modules/follow-redirects': { version: '1.15.9', license: 'MIT', dependencies: { debug: '4.3.7' } },
      'node_modules/debug': { version: '4.3.7', license: 'MIT', dependencies: { ms: '2.1.3' } },
      'node_modules/ms': { version: '2.1.3', license: 'MIT' },
      'node_modules/sharp': { version: '0.33.5', license: 'Apache-2.0', hasInstallScript: true },
      'node_modules/zod': { version: '3.24.1', license: 'MIT' },
      'node_modules/node-pty': { version: '1.0.0', license: 'GPL-3.0', hasInstallScript: true },
    },
  },
  null,
  2,
);
