import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyzeLockfile } from '../core/lockfileParser.ts';
import { SAMPLE_CARGO_LOCK, SAMPLE_PACKAGE_LOCK, SAMPLE_UV_LOCK } from '../core/samples.ts';

export async function runCli(argv: string[]) {
  let target: string | undefined;
  let asJson = false;
  let demoKind: 'npm' | 'cargo' | 'uv' = 'npm';

  for (const arg of argv) {
    if (arg === '--json') asJson = true;
    else if (arg === '--cargo') demoKind = 'cargo';
    else if (arg === '--uv') demoKind = 'uv';
    else if (!arg.startsWith('-')) target = arg;
  }

  let raw = '';
  let filename = '';
  if (target) {
    const abs = resolve(target);
    if (!existsSync(abs)) {
      console.error(`Lockfile not found: ${abs}`);
      process.exit(1);
    }
    raw = readFileSync(abs, 'utf8');
    filename = abs;
  } else {
    raw = demoKind === 'cargo' ? SAMPLE_CARGO_LOCK : demoKind === 'uv' ? SAMPLE_UV_LOCK : SAMPLE_PACKAGE_LOCK;
    filename = demoKind === 'cargo' ? 'Cargo.lock' : demoKind === 'uv' ? 'uv.lock' : 'package-lock.json';
  }

  const graph = analyzeLockfile(raw, filename);
  if (asJson) {
    console.log(JSON.stringify(graph, null, 2));
    return;
  }

  console.log(`dep-radar (${graph.ecosystem}) — ${graph.projectName}`);
  console.log(
    `packages=${graph.stats.totalPackages} direct=${graph.stats.directCount} maxDepth=${graph.stats.maxDepth} ` +
      `duplicates=${graph.stats.duplicatePackages} scripts=${graph.stats.scriptCount} highRisk=${graph.stats.highRiskCount}`,
  );
  const top = [...graph.nodes].sort((a, b) => b.riskScore - a.riskScore || b.transitiveCount - a.transitiveCount).slice(0, 8);
  for (const n of top) {
    console.log(
      `  - ${n.id.padEnd(28)} risk=${String(n.riskScore).padStart(3)} depth=${n.depth} subtree=${n.transitiveCount} caps=[${n.capabilities.join(',')}]`,
    );
  }
}
