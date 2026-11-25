import type {
  BlastRadiusResult,
  CapabilityFlag,
  DepEdge,
  DepGraph,
  DepNode,
  LicenseTier,
  LockfileEcosystem,
} from './types.ts';

interface RawPkg {
  id: string;
  name: string;
  version: string;
  direct: boolean;
  license: string;
  hasInstallScript: boolean;
  depNames: string[];
  depSpecs?: Record<string, string>;
}

export function classifyLicenseTier(license: string): LicenseTier {
  const l = license.trim().toUpperCase();
  if (!l || l === 'UNKNOWN' || l === 'UNLICENSED' || l === 'PROPRIETARY') return 'unknown';
  if (/(AGPL|GPL-?2|GPL-?3|GPLV)/.test(l) && !/LGPL/.test(l)) return 'strong-copyleft';
  if (/(LGPL|MPL-?2|EPL|EUPL|CDDL)/.test(l)) return 'weak-copyleft';
  if (/(MIT|ISC|BSD|APACHE|0BSD|CC0|UNLICENSE|ZLIB)/.test(l)) return 'permissive';
  return 'unknown';
}

export function inferCapabilities(name: string, hasInstallScript: boolean, depNames: string[]): CapabilityFlag[] {
  const n = name.toLowerCase();
  const flags = new Set<CapabilityFlag>();
  if (hasInstallScript) flags.add('install-script');
  if (/(^|[-_/])(axios|fetch|undici|got|superagent|reqwest|hyper|httpx|aiohttp|urllib3|ws|socket|grpc|tonic)/.test(n)) {
    flags.add('network');
  }
  if (/(^|[-_/])(fs-extra|rimraf|glob|chokidar|tar|unzip|walkdir|tempfile|multer)/.test(n)) {
    flags.add('filesystem');
  }
  if (/(^|[-_/])(execa|cross-spawn|shelljs|child|spawn)/.test(n)) {
    flags.add('child-process');
  }
  if (
    /(^|[-_/])(sharp|esbuild|canvas|sqlite3|bcrypt|ffi|napi|node-gyp|cc|bindgen|cmake|libc|ring|openssl-sys|cryptography|pydantic-core|numpy|torch)/.test(n) ||
    depNames.some((d) => /^(cc|bindgen|cmake|node-gyp|prebuild-install)$/.test(d.toLowerCase()))
  ) {
    flags.add('native-code');
  }
  return Array.from(flags);
}

function parsePackageLockJson(text: string): { projectName: string; packages: RawPkg[]; rootDeps: string[] } {
  const data = JSON.parse(text) as {
    name?: string;
    dependencies?: Record<string, { version?: string; requires?: Record<string, string>; dependencies?: unknown }>;
    packages?: Record<
      string,
      {
        version?: string;
        license?: string;
        hasInstallScript?: boolean;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
      }
    >;
  };

  const projectName = data.name || 'npm-workspace';
  const rawList: RawPkg[] = [];
  const rootDeps: string[] = [];

  if (data.packages && typeof data.packages === 'object') {
    const rootEntry = data.packages[''] ?? {};
    const directSet = new Set([
      ...Object.keys(rootEntry.dependencies ?? {}),
      ...Object.keys(rootEntry.devDependencies ?? {}),
      ...Object.keys(rootEntry.optionalDependencies ?? {}),
    ]);
    rootDeps.push(...directSet);

    const byKey = new Map<string, RawPkg>();
    for (const [pkgPath, meta] of Object.entries(data.packages)) {
      if (pkgPath === '' || !meta.version) continue;
      const nmIdx = pkgPath.lastIndexOf('node_modules/');
      const name = nmIdx >= 0 ? pkgPath.slice(nmIdx + 'node_modules/'.length) : pkgPath;
      const isTopLevel = pkgPath === `node_modules/${name}`;
      const depSpecs: Record<string, string> = {
        ...(meta.optionalDependencies ?? {}),
        ...(meta.dependencies ?? {}),
      };
      const depNames = Object.keys(depSpecs);
      const item: RawPkg = {
        id: `${name}@${meta.version}`,
        name,
        version: meta.version,
        direct: isTopLevel && directSet.has(name),
        license: meta.license ?? 'UNKNOWN',
        hasInstallScript: Boolean(meta.hasInstallScript),
        depNames,
        depSpecs,
      };
      // Prefer unique name@version; merge depNames cleanly
      const existing = byKey.get(item.id);
      if (existing) {
        existing.direct = existing.direct || item.direct;
        existing.hasInstallScript = existing.hasInstallScript || item.hasInstallScript;
        for (const d of item.depNames) {
          if (!existing.depNames.includes(d)) existing.depNames.push(d);
        }
      } else {
        byKey.set(item.id, item);
      }
    }
    rawList.push(...byKey.values());
  } else if (data.dependencies && typeof data.dependencies === 'object') {
    const walkV1 = (deps: typeof data.dependencies, isTop: boolean) => {
      for (const [name, meta] of Object.entries(deps ?? {})) {
        const ver = meta.version ?? '0.0.0';
        const depNames = Object.keys(meta.requires ?? {});
        if (isTop) rootDeps.push(name);
        rawList.push({
          id: `${name}@${ver}`,
          name,
          version: ver,
          direct: isTop,
          license: 'MIT',
          hasInstallScript: false,
          depNames,
        });
        if (meta.dependencies && typeof meta.dependencies === 'object') {
          walkV1(meta.dependencies as typeof data.dependencies, false);
        }
      }
    };
    walkV1(data.dependencies, true);
  }

  return { projectName, packages: rawList, rootDeps };
}

function parsePnpmLockYaml(text: string): { projectName: string; packages: RawPkg[]; rootDeps: string[] } {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const directSet = new Set<string>();
  const byId = new Map<string, RawPkg>();

  let section: 'none' | 'importers' | 'packages' | 'snapshots' = 'none';
  let inDeps = false;
  let curPkg: RawPkg | null = null;
  let inPkgDeps = false;

  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.search(/\S/);
    const trimmed = raw.trim();

    if (indent === 0) {
      curPkg = null;
      inDeps = false;
      inPkgDeps = false;
      if (trimmed.startsWith('importers:') || trimmed.startsWith('dependencies:') || trimmed.startsWith('devDependencies:')) {
        section = 'importers';
        if (!trimmed.startsWith('importers:')) inDeps = true;
      } else if (trimmed.startsWith('packages:')) section = 'packages';
      else if (trimmed.startsWith('snapshots:')) section = 'snapshots';
      else section = 'none';
      continue;
    }

    if (section === 'importers') {
      if (trimmed === 'dependencies:' || trimmed === 'devDependencies:') {
        inDeps = true;
        continue;
      }
      if (inDeps && indent >= 4 && trimmed.includes(':')) {
        const key = trimmed.split(':')[0].replace(/['"]/g, '').trim();
        if (key && key !== 'specifier' && key !== 'version') directSet.add(key);
      }
    } else if (section === 'packages' || section === 'snapshots') {
      if (indent === 2 && trimmed.endsWith(':')) {
        let spec = trimmed.slice(0, -1).replace(/^['"]|['"]$/g, '').replace(/^\//, '');
        spec = spec.split('(')[0];
        const atIdx = spec.lastIndexOf('@');
        if (atIdx > 0) {
          const name = spec.slice(0, atIdx);
          const version = spec.slice(atIdx + 1);
          const id = `${name}@${version}`;
          curPkg = byId.get(id) ?? {
            id,
            name,
            version,
            direct: directSet.has(name),
            license: 'MIT',
            hasInstallScript: false,
            depNames: [],
          };
          byId.set(id, curPkg);
          inPkgDeps = false;
        }
        continue;
      }
      if (!curPkg) continue;
      if (indent === 4 && (trimmed === 'dependencies:' || trimmed === 'optionalDependencies:')) {
        inPkgDeps = true;
        continue;
      }
      if (indent === 4 && trimmed.startsWith('requiresBuild:')) {
        curPkg.hasInstallScript = trimmed.includes('true');
        inPkgDeps = false;
        continue;
      }
      if (indent === 4 && trimmed.startsWith('license:')) {
        curPkg.license = trimmed.slice(8).trim().replace(/^['"]|['"]$/g, '');
        inPkgDeps = false;
        continue;
      }
      if (indent === 4 && trimmed.endsWith(':')) {
        inPkgDeps = false;
        continue;
      }
      if (inPkgDeps && indent >= 6 && trimmed.includes(':')) {
        const depName = trimmed.split(':')[0].replace(/['"]/g, '').trim();
        if (depName && !curPkg.depNames.includes(depName)) curPkg.depNames.push(depName);
      }
    }
  }

  for (const pkg of byId.values()) {
    pkg.direct = directSet.has(pkg.name);
  }
  return { projectName: 'pnpm-workspace', packages: Array.from(byId.values()), rootDeps: Array.from(directSet) };
}

function parseTomlLockfile(text: string, ecosystem: 'cargo' | 'uv'): { projectName: string; packages: RawPkg[]; rootDeps: string[] } {
  const blocks = text.split(/^\[\[package\]\]/m).slice(1);
  const rawList: RawPkg[] = [];
  let rootPkgName = ecosystem === 'cargo' ? 'cargo-workspace' : 'uv-workspace';
  let rootDeps: string[] = [];

  for (const block of blocks) {
    const nameMatch = /^name\s*=\s*"([^"]+)"/m.exec(block);
    const verMatch = /^version\s*=\s*"([^"]+)"/m.exec(block);
    if (!nameMatch || !verMatch) continue;
    const name = nameMatch[1];
    const version = verMatch[1];
    const hasSource = /^source\s*=/m.test(block);
    const licMatch = /^license\s*=\s*"([^"]+)"/m.exec(block);

    const depNames: string[] = [];
    const depsBlock = /dependencies\s*=\s*\[([\s\S]*?)\]/m.exec(block);
    if (depsBlock) {
      if (ecosystem === 'cargo') {
        for (const m of depsBlock[1].matchAll(/"([^"\s]+)/g)) {
          depNames.push(m[1]);
        }
      } else {
        for (const m of depsBlock[1].matchAll(/name\s*=\s*"([^"]+)"/g)) {
          depNames.push(m[1]);
        }
      }
    }

    if (!hasSource && depNames.length > 0 && rawList.length === 0) {
      rootPkgName = name;
      rootDeps = depNames;
      continue;
    }

    rawList.push({
      id: `${name}@${version}`,
      name,
      version,
      direct: false,
      license: licMatch?.[1] ?? (ecosystem === 'cargo' ? 'MIT OR Apache-2.0' : 'MIT'),
      hasInstallScript: /^build\s*=|sdist\s*=/.test(block) && name.endsWith('-sys'),
      depNames,
    });
  }

  // Fallback root heuristics if no explicit local workspace [[package]] block
  if (rootDeps.length === 0) {
    const referenced = new Set<string>();
    for (const p of rawList) for (const d of p.depNames) referenced.add(d);
    rootDeps = rawList.filter((p) => !referenced.has(p.name)).map((p) => p.name);
  }
  const directSet = new Set(rootDeps);
  for (const p of rawList) p.direct = directSet.has(p.name);

  return { projectName: rootPkgName, packages: rawList, rootDeps };
}

export function detectLockfileEcosystem(text: string, filename = ''): LockfileEcosystem {
  const lower = filename.toLowerCase();
  if (lower.endsWith('cargo.lock')) return 'cargo';
  if (lower.endsWith('uv.lock')) return 'uv';
  if (lower.endsWith('pnpm-lock.yaml')) return 'pnpm';
  if (lower.endsWith('.json')) return 'npm';
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return 'npm';
  if (trimmed.includes('[[package]]')) {
    return trimmed.includes('{ name =') ? 'uv' : 'cargo';
  }
  return 'pnpm';
}

export function analyzeLockfile(text: string, filename = ''): DepGraph {
  const ecosystem = detectLockfileEcosystem(text, filename);
  const parsed =
    ecosystem === 'npm'
      ? parsePackageLockJson(text)
      : ecosystem === 'pnpm'
        ? parsePnpmLockYaml(text)
        : parseTomlLockfile(text, ecosystem);

  const byId = new Map<string, RawPkg>();
  const byName = new Map<string, RawPkg[]>();

  for (const p of parsed.packages) {
    byId.set(p.id, p);
    const list = byName.get(p.name) ?? [];
    list.push(p);
    byName.set(p.name, list);
  }

  const duplicateNames = Array.from(byName.entries())
    .filter(([, list]) => list.length > 1)
    .map(([name]) => name);
  const dupSet = new Set(duplicateNames);

  // Build adjacency lists (source -> targets)
  const edges: DepEdge[] = [];
  const edgeKeys = new Set<string>();
  const adj = new Map<string, string[]>();
  const revAdj = new Map<string, string[]>();

  for (const p of parsed.packages) {
    const targets: string[] = [];
    for (const dName of p.depNames) {
      const candidates = byName.get(dName);
      if (!candidates || candidates.length === 0) continue;
      let chosen = candidates[0];
      const spec = p.depSpecs?.[dName];
      if (spec && candidates.length > 1) {
        const cleanSpec = spec.replace(/^[\^~>=<\s]+/, '');
        chosen = candidates.find((c) => c.version === cleanSpec || c.version.startsWith(cleanSpec)) ?? chosen;
      }
      const targetId = chosen.id;
      if (targetId === p.id) continue;
      targets.push(targetId);
      const ek = `${p.id}->${targetId}`;
      if (!edgeKeys.has(ek)) {
        edgeKeys.add(ek);
        edges.push({ id: ek, source: p.id, target: targetId });
        const rev = revAdj.get(targetId) ?? [];
        rev.push(p.id);
        revAdj.set(targetId, rev);
      }
    }
    adj.set(p.id, targets);
  }

  // BFS depth from direct roots
  const depthMap = new Map<string, number>();
  const queue: string[] = [];
  for (const p of parsed.packages) {
    if (p.direct) {
      depthMap.set(p.id, 1);
      queue.push(p.id);
    }
  }
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curD = depthMap.get(cur) ?? 1;
    for (const nxt of adj.get(cur) ?? []) {
      const existingD = depthMap.get(nxt);
      if (existingD === undefined || curD + 1 < existingD) {
        depthMap.set(nxt, curD + 1);
        queue.push(nxt);
      }
    }
  }

  const countReachable = (start: string, graphMap: Map<string, string[]>): number => {
    const seen = new Set<string>([start]);
    const q = [start];
    while (q.length > 0) {
      const c = q.shift()!;
      for (const n of graphMap.get(c) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          q.push(n);
        }
      }
    }
    return seen.size - 1;
  };

  const nodes: DepNode[] = parsed.packages.map((p) => {
    const depth = depthMap.get(p.id) ?? 2;
    const transitiveCount = countReachable(p.id, adj);
    const dependentCount = countReachable(p.id, revAdj);
    const licenseTier = classifyLicenseTier(p.license);
    const capabilities = inferCapabilities(p.name, p.hasInstallScript, p.depNames);
    const duplicateVersion = dupSet.has(p.name);

    let risk = 0;
    if (licenseTier === 'strong-copyleft') risk += 45;
    else if (licenseTier === 'unknown') risk += 25;
    else if (licenseTier === 'weak-copyleft') risk += 15;
    if (capabilities.includes('install-script')) risk += 30;
    if (capabilities.includes('child-process')) risk += 18;
    if (capabilities.includes('native-code')) risk += 14;
    if (capabilities.includes('network')) risk += 10;
    if (duplicateVersion) risk += 10;
    risk += Math.min(20, transitiveCount * 2);

    return {
      id: p.id,
      name: p.name,
      version: p.version,
      direct: p.direct,
      depth,
      transitiveCount,
      dependentCount,
      license: p.license,
      licenseTier,
      capabilities,
      duplicateVersion,
      riskScore: Math.min(100, risk),
      dependencies: adj.get(p.id) ?? [],
      dependents: revAdj.get(p.id) ?? [],
    };
  });

  const maxDepth = Math.max(0, ...nodes.map((n) => n.depth));
  return {
    ecosystem,
    projectName: parsed.projectName,
    nodes,
    edges,
    duplicateNames,
    stats: {
      totalPackages: nodes.length,
      directCount: nodes.filter((n) => n.direct).length,
      maxDepth,
      duplicatePackages: duplicateNames.length,
      scriptCount: nodes.filter((n) => n.capabilities.includes('install-script')).length,
      highRiskCount: nodes.filter((n) => n.riskScore >= 40).length,
      copyleftCount: nodes.filter((n) => n.licenseTier === 'weak-copyleft' || n.licenseTier === 'strong-copyleft').length,
    },
  };
}

export function computeBlastRadius(graph: DepGraph, selectedId: string): BlastRadiusResult {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const selected = byId.get(selectedId);
  if (!selected) {
    return {
      selectedId,
      upstreamIds: new Set(),
      downstreamIds: new Set(),
      highlightedEdgeIds: new Set(),
      rootPaths: [],
      exclusiveRemovalIds: [],
    };
  }

  // Upstream ("Why is this here?")
  const upstreamIds = new Set<string>();
  const highlightedEdgeIds = new Set<string>();
  const qUp = [selectedId];
  while (qUp.length > 0) {
    const cur = qUp.shift()!;
    const node = byId.get(cur);
    if (!node) continue;
    for (const depBy of node.dependents) {
      highlightedEdgeIds.add(`${depBy}->${cur}`);
      if (!upstreamIds.has(depBy)) {
        upstreamIds.add(depBy);
        qUp.push(depBy);
      }
    }
  }

  // Downstream subtree
  const downstreamIds = new Set<string>();
  const qDown = [selectedId];
  while (qDown.length > 0) {
    const cur = qDown.shift()!;
    const node = byId.get(cur);
    if (!node) continue;
    for (const dep of node.dependencies) {
      highlightedEdgeIds.add(`${cur}->${dep}`);
      if (!downstreamIds.has(dep)) {
        downstreamIds.add(dep);
        qDown.push(dep);
      }
    }
  }

  // Shortest upstream paths to direct roots (up to 4)
  const rootPaths: string[][] = [];
  const pathQueue: string[][] = [[selectedId]];
  const visitedPathNodes = new Set<string>([selectedId]);
  while (pathQueue.length > 0 && rootPaths.length < 4) {
    const path = pathQueue.shift()!;
    const head = byId.get(path[0]);
    if (!head) continue;
    if (head.direct || head.dependents.length === 0) {
      rootPaths.push(path);
      continue;
    }
    for (const parent of head.dependents) {
      if (!visitedPathNodes.has(parent) && path.length < 7) {
        visitedPathNodes.add(parent);
        pathQueue.push([parent, ...path]);
      }
    }
  }

  // Removal impact: nodes reachable from roots WITHOUT selectedId vs WITH selectedId
  const reachableWithout = new Set<string>();
  const qSim: string[] = [];
  for (const n of graph.nodes) {
    if (n.direct && n.id !== selectedId) {
      reachableWithout.add(n.id);
      qSim.push(n.id);
    }
  }
  while (qSim.length > 0) {
    const cur = qSim.shift()!;
    const node = byId.get(cur);
    if (!node) continue;
    for (const d of node.dependencies) {
      if (d !== selectedId && !reachableWithout.has(d)) {
        reachableWithout.add(d);
        qSim.push(d);
      }
    }
  }
  const exclusiveRemovalIds = graph.nodes
    .filter((n) => n.id === selectedId || (downstreamIds.has(n.id) && !reachableWithout.has(n.id)))
    .map((n) => n.id);

  return {
    selectedId,
    upstreamIds,
    downstreamIds,
    highlightedEdgeIds,
    rootPaths,
    exclusiveRemovalIds,
  };
}
