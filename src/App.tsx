import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Copy,
  Download,
  FileUp,
  Filter,
  GitFork,
  Layers,
  Radar,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  Undo2,
} from 'lucide-react';
import { analyzeLockfile, computeBlastRadius } from './core/lockfileParser.ts';
import {
  SAMPLE_CARGO_LOCK,
  SAMPLE_PACKAGE_LOCK,
  SAMPLE_PNPM_LOCK,
  SAMPLE_UV_LOCK,
} from './core/samples.ts';
import type { CapabilityFlag, DepGraph, DepNode } from './core/types.ts';

interface SimPos {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

type FilterChip = 'all' | 'direct' | 'duplicates' | 'scripts' | 'copyleft' | 'deep';
type SampleKey = 'npm' | 'pnpm' | 'cargo' | 'uv' | 'custom';
type ViewMode = 'gravity' | 'analytics';

function riskColor(n: DepNode): string {
  if (n.licenseTier === 'strong-copyleft' || n.riskScore >= 45) return '#f43f5e';
  if (n.capabilities.includes('install-script') || n.licenseTier === 'weak-copyleft' || n.riskScore >= 25) return '#f59e0b';
  if (n.licenseTier === 'unknown') return '#a78bfa';
  return '#10b981';
}

export function App() {
  const [sampleKey, setSampleKey] = useState<SampleKey>('npm');
  const [viewMode, setViewMode] = useState<ViewMode>('gravity');
  const [graph, setGraph] = useState<DepGraph>(() => analyzeLockfile(SAMPLE_PACKAGE_LOCK, 'package-lock.json'));
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const g = analyzeLockfile(SAMPLE_PACKAGE_LOCK, 'package-lock.json');
    return g.nodes.find((n) => n.name === 'ms')?.id ?? g.nodes[0]?.id ?? null;
  });
  const [hoveredNode, setHoveredNode] = useState<{ node: DepNode; x: number; y: number } | null>(null);
  const [removedRoots, setRemovedRoots] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState('');
  const [filterChip, setFilterChip] = useState<FilterChip>('all');
  const [cam, setCam] = useState({ x: 0, y: 0, zoom: 1 });
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simMapRef = useRef<Map<string, SimPos>>(new Map());
  const dragRef = useRef<{ mode: 'pan' | 'node'; id?: string; sx: number; sy: number; ox: number; oy: number } | null>(null);

  const loadRawLockfile = (text: string, filename: string, key: SampleKey) => {
    const next = analyzeLockfile(text, filename);
    setSampleKey(key);
    setGraph(next);
    setRemovedRoots(new Set());
    const defaultTarget =
      [...next.nodes].sort((a, b) => b.riskScore - a.riskScore)[0]?.id ?? next.nodes[0]?.id ?? null;
    setSelectedId(defaultTarget);
    setCam({ x: 0, y: 0, zoom: 1 });
  };

  useEffect(() => {
    const map = new Map<string, SimPos>();
    const count = Math.max(1, graph.nodes.length);
    graph.nodes.forEach((n, i) => {
      const ring = n.depth * 115;
      const angle = (i / count) * Math.PI * 2;
      map.set(n.id, {
        id: n.id,
        x: Math.cos(angle) * ring,
        y: Math.sin(angle) * ring,
        vx: 0,
        vy: 0,
        r: Math.min(26, 9 + Math.sqrt(n.transitiveCount + 1) * 4.2),
      });
    });
    simMapRef.current = map;
  }, [graph]);

  const filteredIds = useMemo(() => {
    const q = search.trim().toLowerCase();
    return new Set(
      graph.nodes
        .filter((n) => {
          if (filterChip === 'direct' && !n.direct) return false;
          if (filterChip === 'duplicates' && !n.duplicateVersion) return false;
          if (filterChip === 'scripts' && !n.capabilities.includes('install-script')) return false;
          if (
            filterChip === 'copyleft' &&
            n.licenseTier !== 'weak-copyleft' &&
            n.licenseTier !== 'strong-copyleft' &&
            n.licenseTier !== 'unknown'
          ) {
            return false;
          }
          if (filterChip === 'deep' && n.depth < 3) return false;
          if (q && !n.name.toLowerCase().includes(q) && !n.version.toLowerCase().includes(q)) return false;
          return true;
        })
        .map((n) => n.id),
    );
  }, [graph.nodes, search, filterChip]);

  const blast = useMemo(
    () => (selectedId ? computeBlastRadius(graph, selectedId) : null),
    [graph, selectedId],
  );
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);
  const selectedNode = selectedId ? byId.get(selectedId) ?? null : null;

  // Compute simulated pruned node set when user activates "What-If Remove"
  const prunedIds = useMemo(() => {
    if (removedRoots.size === 0) return new Set<string>();
    const reachable = new Set<string>();
    const queue = graph.nodes.filter((n) => n.direct && !removedRoots.has(n.id)).map((n) => n.id);
    for (const id of queue) reachable.add(id);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const node = byId.get(cur);
      if (!node) continue;
      for (const dep of node.dependencies) {
        if (!removedRoots.has(dep) && !reachable.has(dep)) {
          reachable.add(dep);
          queue.push(dep);
        }
      }
    }
    const pruned = new Set<string>();
    for (const n of graph.nodes) {
      if (!reachable.has(n.id)) pruned.add(n.id);
    }
    return pruned;
  }, [graph.nodes, removedRoots, byId]);

  const prunedRiskSaved = useMemo(
    () => graph.nodes.filter((n) => prunedIds.has(n.id)).reduce((s, n) => s + n.riskScore, 0),
    [graph.nodes, prunedIds],
  );

  // Analytics metrics for dashboard tab
  const analytics = useMemo(() => {
    const licenses: Record<string, number> = { permissive: 0, 'weak-copyleft': 0, 'strong-copyleft': 0, unknown: 0 };
    const caps: Record<CapabilityFlag, number> = {
      'install-script': 0,
      network: 0,
      filesystem: 0,
      'child-process': 0,
      'native-code': 0,
    };
    const depths = new Map<number, number>();
    for (const n of graph.nodes) {
      licenses[n.licenseTier] = (licenses[n.licenseTier] ?? 0) + 1;
      for (const c of n.capabilities) caps[c] = (caps[c] ?? 0) + 1;
      depths.set(n.depth, (depths.get(n.depth) ?? 0) + 1);
    }
    const sortedRisk = [...graph.nodes].sort((a, b) => b.riskScore - a.riskScore || b.transitiveCount - a.transitiveCount);
    return {
      licenses,
      caps,
      depths: Array.from(depths.entries()).sort((a, b) => a[0] - b[0]),
      sortedRisk,
    };
  }, [graph.nodes]);

  // Live force-directed physics & Canvas render loop with animated blast-radius pulses
  useEffect(() => {
    if (viewMode !== 'gravity') return;
    let raf = 0;
    const render = (now: number) => {
      const canvas = canvasRef.current;
      const simMap = simMapRef.current;
      if (canvas && simMap.size > 0) {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
            canvas.width = Math.round(rect.width * dpr);
            canvas.height = Math.round(rect.height * dpr);
          }
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const arr = Array.from(simMap.values());
            for (let i = 0; i < arr.length; i++) {
              const a = arr[i];
              a.vx += -a.x * 0.004;
              a.vy += -a.y * 0.004;
              for (let j = i + 1; j < arr.length; j++) {
                const b = arr[j];
                const dx = b.x - a.x || 0.5;
                const dy = b.y - a.y || 0.5;
                const d2 = dx * dx + dy * dy + 80;
                const force = 1550 / d2;
                const fx = dx * force * 0.03;
                const fy = dy * force * 0.03;
                a.vx -= fx;
                a.vy -= fy;
                b.vx += fx;
                b.vy += fy;
              }
            }

            for (const e of graph.edges) {
              const s = simMap.get(e.source);
              const t = simMap.get(e.target);
              if (!s || !t) continue;
              const dx = t.x - s.x;
              const dy = t.y - s.y;
              const dist = Math.hypot(dx, dy) || 1;
              const targetLen = 112;
              const pull = (dist - targetLen) * 0.015;
              const px = (dx / dist) * pull;
              const py = (dy / dist) * pull;
              s.vx += px;
              s.vy += py;
              t.vx -= px;
              t.vy -= py;
            }

            for (const p of arr) {
              if (dragRef.current?.mode === 'node' && dragRef.current.id === p.id) {
                p.vx = 0;
                p.vy = 0;
                continue;
              }
              p.vx *= 0.82;
              p.vy *= 0.82;
              p.x += p.vx;
              p.y += p.vy;
            }

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.fillStyle = '#0B0F17';
            ctx.fillRect(0, 0, rect.width, rect.height);

            const cx = rect.width / 2 + cam.x;
            const cy = rect.height / 2 + cam.y;
            ctx.translate(cx, cy);
            ctx.scale(cam.zoom, cam.zoom);

            // Subtle radar crosshairs + labeled depth gravity rings
            ctx.strokeStyle = 'rgba(30, 41, 59, 0.5)';
            ctx.lineWidth = 1 / cam.zoom;
            ctx.beginPath();
            ctx.moveTo(-420, 0);
            ctx.lineTo(420, 0);
            ctx.moveTo(0, -420);
            ctx.lineTo(0, 420);
            ctx.stroke();

            const rings = [
              { r: 115, label: 'DIRECT (D1)' },
              { r: 230, label: 'DEPTH 2' },
              { r: 345, label: 'DEPTH 3+' },
            ];
            ctx.font = `600 ${Math.max(9, 10 / Math.sqrt(cam.zoom))}px ui-monospace, monospace`;
            for (const ring of rings) {
              ctx.strokeStyle = 'rgba(51, 65, 85, 0.5)';
              ctx.beginPath();
              ctx.arc(0, 0, ring.r, 0, Math.PI * 2);
              ctx.stroke();
              ctx.fillStyle = 'rgba(100, 116, 139, 0.7)';
              ctx.fillText(ring.label, 6, -ring.r + 12);
            }

            // Edges + animated blast-radius signal pulses
            const pulseT = (now % 1800) / 1800;
            for (const e of graph.edges) {
              const s = simMap.get(e.source);
              const t = simMap.get(e.target);
              if (!s || !t) continue;
              const isPruned = prunedIds.has(e.source) || prunedIds.has(e.target);
              const isBlast = !isPruned && blast?.highlightedEdgeIds.has(e.id);
              const visible = filteredIds.has(e.source) && filteredIds.has(e.target);
              ctx.strokeStyle = isPruned
                ? 'rgba(71, 85, 105, 0.12)'
                : isBlast
                  ? '#38bdf8'
                  : visible
                    ? 'rgba(100, 116, 139, 0.34)'
                    : 'rgba(51, 65, 85, 0.1)';
              ctx.lineWidth = (isBlast ? 2.3 : 1) / cam.zoom;
              ctx.beginPath();
              ctx.moveTo(s.x, s.y);
              ctx.lineTo(t.x, t.y);
              ctx.stroke();

              if (isBlast) {
                const px = s.x + (t.x - s.x) * pulseT;
                const py = s.y + (t.y - s.y) * pulseT;
                ctx.beginPath();
                ctx.arc(px, py, 3.2 / Math.sqrt(cam.zoom), 0, Math.PI * 2);
                ctx.fillStyle = '#7dd3fc';
                ctx.fill();
              }
            }

            // Nodes with risk halos & pruned ghost states
            for (const n of graph.nodes) {
              const pos = simMap.get(n.id);
              if (!pos) continue;
              const isSel = selectedId === n.id;
              const isPruned = prunedIds.has(n.id);
              const inBlast = isSel || blast?.upstreamIds.has(n.id) || blast?.downstreamIds.has(n.id);
              const matchFilter = filteredIds.has(n.id);
              const col = isPruned ? '#475569' : riskColor(n);

              ctx.globalAlpha = isPruned ? 0.22 : !matchFilter ? 0.18 : selectedId && !inBlast ? 0.36 : 1;

              // Outer risk halo for high-risk or selected nodes
              if (!isPruned && (n.riskScore >= 25 || isSel)) {
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, pos.r + (isSel ? 7 : 4.5), 0, Math.PI * 2);
                ctx.fillStyle = isSel ? 'rgba(56, 189, 248, 0.22)' : 'rgba(244, 63, 94, 0.16)';
                ctx.fill();
              }

              ctx.beginPath();
              ctx.arc(pos.x, pos.y, pos.r, 0, Math.PI * 2);
              ctx.fillStyle = col;
              ctx.fill();
              ctx.lineWidth = (isSel ? 3 : n.direct ? 2 : 1) / cam.zoom;
              ctx.strokeStyle = isSel ? '#f8fafc' : n.direct ? '#38bdf8' : '#0B0F17';
              ctx.stroke();

              if (matchFilter || inBlast) {
                ctx.fillStyle = isPruned ? '#64748b' : '#e2e8f0';
                ctx.font = `${isSel ? '700' : '500'} ${Math.max(10, 11 / Math.sqrt(cam.zoom))}px ui-monospace, monospace`;
                ctx.fillText(n.name, pos.x + pos.r + 5, pos.y + 4);
              }
            }
            ctx.globalAlpha = 1;
          }
        }
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [graph, selectedId, blast, filteredIds, prunedIds, cam, viewMode]);

  const toWorldCoords = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const wx = (clientX - rect.left - rect.width / 2 - cam.x) / cam.zoom;
    const wy = (clientY - rect.top - rect.height / 2 - cam.y) / cam.zoom;
    return { wx, wy };
  };

  const hitTestNode = (wx: number, wy: number): SimPos | null => {
    for (const p of simMapRef.current.values()) {
      if (Math.hypot(p.x - wx, p.y - wy) <= p.r + 6) return p;
    }
    return null;
  };

  const toggleSimulateRemove = (id: string) => {
    setRemovedRoots((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportMarkdownSummary = () => {
    const lines = [
      `# Dependency Radar Report (${graph.projectName} · ${graph.ecosystem})`,
      `- Packages: ${graph.stats.totalPackages} (${graph.stats.directCount} direct, max depth ${graph.stats.maxDepth})`,
      `- Install scripts: ${graph.stats.scriptCount} | Duplicate versions: ${graph.stats.duplicatePackages} | Copyleft: ${graph.stats.copyleftCount}`,
      '',
      '## Highest Risk Nodes',
      ...[...graph.nodes]
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, 10)
        .map((n) => `- \`${n.id}\`: risk=${n.riskScore}, subtree=${n.transitiveCount}, license=${n.license}, caps=[${n.capabilities.join(', ')}]`),
    ].join('\n');
    const blob = new Blob([lines], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dep-radar-${graph.projectName}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  const exportJsonSbom = () => {
    const sbom = {
      bomFormat: 'dep-radar-sbom',
      generatedAt: new Date().toISOString(),
      project: graph.projectName,
      ecosystem: graph.ecosystem,
      stats: graph.stats,
      components: graph.nodes.map((n) => ({
        id: n.id,
        name: n.name,
        version: n.version,
        direct: n.direct,
        depth: n.depth,
        license: n.license,
        licenseTier: n.licenseTier,
        capabilities: n.capabilities,
        riskScore: n.riskScore,
      })),
    };
    const blob = new Blob([JSON.stringify(sbom, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dep-radar-${graph.projectName}.sbom.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-[#0B0F17] text-slate-100"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) loadRawLockfile(await f.text(), f.name, 'custom');
      }}
    >
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-800 bg-[#111827] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/15 text-amber-300">
            <Radar className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-50">dep-radar</h1>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] uppercase text-amber-300">
                {graph.ecosystem}
              </span>
              <span className="font-mono text-xs text-slate-300">{graph.projectName}</span>
            </div>
            <p className="text-[11px] text-slate-400">
              {graph.stats.totalPackages} pkgs · max depth {graph.stats.maxDepth} ·{' '}
              <span className="text-amber-300">{graph.stats.scriptCount} scripts</span> ·{' '}
              <span className="text-rose-300">{graph.stats.duplicatePackages} duplicates</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* View Mode Toggle */}
          <div className="flex rounded-lg border border-slate-700 bg-[#0B0F17] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('gravity')}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${
                viewMode === 'gravity' ? 'bg-sky-500/20 font-semibold text-sky-200' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Radar className="h-3.5 w-3.5" /> Gravity
            </button>
            <button
              type="button"
              onClick={() => setViewMode('analytics')}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${
                viewMode === 'analytics' ? 'bg-sky-500/20 font-semibold text-sky-200' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" /> Telemetry
            </button>
          </div>

          <div className="flex rounded-lg border border-slate-700 bg-[#0B0F17] p-0.5 text-xs">
            {(
              [
                { k: 'npm', label: 'npm', text: SAMPLE_PACKAGE_LOCK, file: 'package-lock.json' },
                { k: 'pnpm', label: 'pnpm', text: SAMPLE_PNPM_LOCK, file: 'pnpm-lock.yaml' },
                { k: 'cargo', label: 'Cargo', text: SAMPLE_CARGO_LOCK, file: 'Cargo.lock' },
                { k: 'uv', label: 'uv', text: SAMPLE_UV_LOCK, file: 'uv.lock' },
              ] as const
            ).map((s) => (
              <button
                key={s.k}
                type="button"
                onClick={() => loadRawLockfile(s.text, s.file, s.k)}
                className={`rounded-md px-2 py-1 ${
                  sampleKey === s.k ? 'bg-amber-500/20 font-semibold text-amber-200' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-700 bg-[#0B0F17] px-2.5 py-1 text-xs text-slate-200 hover:border-amber-500">
            <FileUp className="h-3.5 w-3.5 text-amber-400" />
            <span>Upload</span>
            <input
              type="file"
              accept=".json,.yaml,.yml,.lock"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) loadRawLockfile(await f.text(), f.name, 'custom');
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => setPasteOpen((v) => !v)}
            className="rounded-lg border border-slate-700 bg-[#0B0F17] px-2.5 py-1 text-xs text-slate-200 hover:border-sky-500"
          >
            Paste
          </button>
          <button
            type="button"
            onClick={exportMarkdownSummary}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-[#0B0F17] px-2 py-1 text-xs text-slate-200 hover:border-emerald-500"
          >
            <Download className="h-3 w-3 text-emerald-400" /> .md
          </button>
          <button
            type="button"
            onClick={exportJsonSbom}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-[#0B0F17] px-2 py-1 text-xs text-slate-200 hover:border-violet-500"
          >
            <Download className="h-3 w-3 text-violet-400" /> SBOM
          </button>
        </div>
      </header>

      {/* Filter Bar + What-If Removal Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-[#0F172A] px-4 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <Filter className="mr-1 h-3.5 w-3.5 text-slate-400" />
          {(
            [
              { k: 'all', label: `All (${graph.nodes.length})` },
              { k: 'direct', label: `Direct (${graph.stats.directCount})` },
              { k: 'duplicates', label: `Duplicates (${graph.stats.duplicatePackages})` },
              { k: 'scripts', label: `Install Scripts (${graph.stats.scriptCount})` },
              { k: 'copyleft', label: `Copyleft / Unknown` },
              { k: 'deep', label: `Depth ≥ 3` },
            ] as const
          ).map((c) => (
            <button
              key={c.k}
              type="button"
              onClick={() => setFilterChip(c.k)}
              className={`rounded-md border px-2 py-0.5 ${
                filterChip === c.k
                  ? 'border-amber-500/60 bg-amber-500/15 font-semibold text-amber-200'
                  : 'border-slate-700 bg-[#111827] text-slate-400 hover:text-slate-200'
              }`}
            >
              {c.label}
            </button>
          ))}

          {removedRoots.size > 0 && (
            <div className="ml-2 inline-flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-emerald-200">
              <span>
                What-If Pruning: <strong>-{prunedIds.size}</strong> pkgs ({Math.round((prunedIds.size / Math.max(1, graph.nodes.length)) * 100)}%) ·{' '}
                <strong>-{prunedRiskSaved}</strong> risk pts
              </span>
              <button
                type="button"
                onClick={() => setRemovedRoots(new Set())}
                className="inline-flex items-center gap-0.5 rounded bg-emerald-500/25 px-1.5 py-0.5 text-[10px] font-semibold hover:bg-emerald-500/40"
              >
                <Undo2 className="h-3 w-3" /> Reset
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find package..."
              className="w-40 rounded-lg border border-slate-700 bg-[#111827] py-1 pl-8 pr-2.5 text-xs text-slate-100"
            />
          </div>
          <button
            type="button"
            onClick={() => setCam({ x: 0, y: 0, zoom: 1 })}
            className="rounded border border-slate-700 bg-[#111827] p-1 text-slate-300 hover:border-slate-500"
            title="Reset gravity view"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {pasteOpen && (
        <div className="border-b border-slate-800 bg-[#111827] p-3">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste package-lock.json, pnpm-lock.yaml, Cargo.lock, or uv.lock content..."
            className="h-28 w-full rounded-lg border border-slate-700 bg-[#0B0F17] p-2 font-mono text-xs text-slate-100"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setPasteOpen(false)} className="rounded border border-slate-700 px-3 py-1 text-xs">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (pasteText.trim()) {
                  loadRawLockfile(pasteText, '', 'custom');
                  setPasteOpen(false);
                }
              }}
              className="rounded bg-amber-500 px-3 py-1 text-xs font-semibold text-slate-950"
            >
              Analyze Lockfile
            </button>
          </div>
        </div>
      )}

      {/* Main Content: Gravity Canvas OR Telemetry Analytics + Blast Radius Inspector */}
      <div className="flex flex-1 overflow-hidden">
        {viewMode === 'gravity' ? (
          <div className={`relative flex-1 overflow-hidden ${dragOver ? 'ring-2 ring-inset ring-amber-400' : ''}`}>
            {dragOver && (
              <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-amber-950/50 backdrop-blur-sm">
                <div className="rounded-2xl border-2 border-dashed border-amber-400 bg-[#0B0F17]/90 px-8 py-6 text-center">
                  <FileUp className="mx-auto mb-2 h-8 w-8 text-amber-400" />
                  <div className="text-sm font-bold text-slate-100">Drop lockfile (`package-lock.json`, `pnpm-lock.yaml`, `Cargo.lock`, `uv.lock`)</div>
                </div>
              </div>
            )}

            <canvas
              ref={canvasRef}
              onPointerDown={(e) => {
                const { wx, wy } = toWorldCoords(e.clientX, e.clientY);
                const hit = hitTestNode(wx, wy);
                if (hit) {
                  setSelectedId(hit.id);
                  dragRef.current = { mode: 'node', id: hit.id, sx: e.clientX, sy: e.clientY, ox: hit.x, oy: hit.y };
                } else {
                  dragRef.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: cam.x, oy: cam.y };
                }
              }}
              onPointerMove={(e) => {
                const d = dragRef.current;
                if (d) {
                  if (d.mode === 'pan') {
                    setCam((c) => ({ ...c, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }));
                  } else if (d.id) {
                    const pos = simMapRef.current.get(d.id);
                    if (pos) {
                      pos.x = d.ox + (e.clientX - d.sx) / cam.zoom;
                      pos.y = d.oy + (e.clientY - d.sy) / cam.zoom;
                    }
                  }
                  return;
                }
                const { wx, wy } = toWorldCoords(e.clientX, e.clientY);
                const hit = hitTestNode(wx, wy);
                if (hit) {
                  const node = byId.get(hit.id);
                  const rect = canvasRef.current!.getBoundingClientRect();
                  if (node) setHoveredNode({ node, x: e.clientX - rect.left + 14, y: e.clientY - rect.top + 14 });
                } else if (hoveredNode) {
                  setHoveredNode(null);
                }
              }}
              onPointerUp={() => {
                dragRef.current = null;
              }}
              onPointerLeave={() => setHoveredNode(null)}
              onWheel={(e) =>
                setCam((c) => ({ ...c, zoom: Math.max(0.4, Math.min(2.2, c.zoom + (e.deltaY < 0 ? 0.08 : -0.08))) }))
              }
              className="h-full w-full cursor-grab active:cursor-grabbing"
            />

            {hoveredNode && (
              <div
                style={{ left: Math.min(hoveredNode.x, 520), top: Math.max(16, hoveredNode.y) }}
                className="pointer-events-none absolute z-20 w-56 rounded-xl border border-slate-700 bg-[#0B0F17]/95 p-2.5 text-xs shadow-2xl backdrop-blur"
              >
                <div className="flex items-center justify-between font-mono font-bold text-slate-50">
                  <span className="truncate">{hoveredNode.node.name}</span>
                  <span className="text-amber-300">v{hoveredNode.node.version}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                  <span>License: {hoveredNode.node.license}</span>
                  <span>Risk {hoveredNode.node.riskScore}</span>
                </div>
                <div className="mt-1 font-mono text-[10px] text-sky-300">
                  Subtree: {hoveredNode.node.transitiveCount} · Depth {hoveredNode.node.depth}
                </div>
              </div>
            )}

            <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-3 rounded-xl border border-slate-800 bg-[#111827]/90 px-3 py-2 text-[11px] backdrop-blur">
              <span className="flex items-center gap-1.5 text-emerald-300">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Permissive / Low Risk
              </span>
              <span className="flex items-center gap-1.5 text-amber-300">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Script / Weak Copyleft
              </span>
              <span className="flex items-center gap-1.5 text-rose-300">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" /> High Risk / Strong Copyleft
              </span>
              <span className="text-slate-400">· Size = transitive footprint · Pulses = blast chain</span>
            </div>
          </div>
        ) : (
          /* Visual Supply-Chain Telemetry Dashboard */
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            <div className="grid gap-4 md:grid-cols-2">
              {/* License Tier Distribution */}
              <div className="rounded-xl border border-slate-800 bg-[#111827] p-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">License Risk Breakdown</h2>
                <div className="mt-3 flex h-4 w-full overflow-hidden rounded-full bg-slate-800">
                  <div className="bg-emerald-400" style={{ width: `${(analytics.licenses.permissive / Math.max(1, graph.nodes.length)) * 100}%` }} />
                  <div className="bg-amber-400" style={{ width: `${(analytics.licenses['weak-copyleft'] / Math.max(1, graph.nodes.length)) * 100}%` }} />
                  <div className="bg-rose-500" style={{ width: `${(analytics.licenses['strong-copyleft'] / Math.max(1, graph.nodes.length)) * 100}%` }} />
                  <div className="bg-violet-400" style={{ width: `${(analytics.licenses.unknown / Math.max(1, graph.nodes.length)) * 100}%` }} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs">
                  <div className="text-emerald-300">Permissive: {analytics.licenses.permissive}</div>
                  <div className="text-amber-300">Weak Copyleft: {analytics.licenses['weak-copyleft']}</div>
                  <div className="text-rose-300">Strong Copyleft: {analytics.licenses['strong-copyleft']}</div>
                  <div className="text-violet-300">Unknown: {analytics.licenses.unknown}</div>
                </div>
              </div>

              {/* Capability Surface Matrix */}
              <div className="rounded-xl border border-slate-800 bg-[#111827] p-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">Detected Capability Flags</h2>
                <div className="mt-3 space-y-2">
                  {(Object.entries(analytics.caps) as Array<[CapabilityFlag, number]>).map(([cap, count]) => (
                    <div key={cap} className="flex items-center gap-3 text-xs">
                      <span className="w-28 font-mono text-slate-300">{cap}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className={`h-full ${cap === 'install-script' || cap === 'child-process' ? 'bg-rose-400' : 'bg-amber-400'}`}
                          style={{ width: `${Math.min(100, (count / Math.max(1, graph.nodes.length)) * 220)}%` }}
                        />
                      </div>
                      <span className="w-6 text-right font-mono text-slate-200">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Depth Distribution */}
            <div className="rounded-xl border border-slate-800 bg-[#111827] p-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">Transitive Depth Histogram</h2>
              <div className="mt-3 flex items-end gap-4 h-28">
                {analytics.depths.map(([depth, count]) => {
                  const maxD = Math.max(1, ...analytics.depths.map((x) => x[1]));
                  return (
                    <div key={depth} className="flex flex-1 flex-col items-center gap-1">
                      <span className="font-mono text-xs text-sky-300">{count}</span>
                      <div className="flex h-16 w-full max-w-[64px] items-end rounded-t bg-slate-800/70">
                        <div
                          className="w-full rounded-t bg-gradient-to-t from-sky-600 to-cyan-400"
                          style={{ height: `${Math.max(12, Math.round((count / maxD) * 100))}%` }}
                        />
                      </div>
                      <span className="font-mono text-[11px] text-slate-400">Depth {depth}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Risk Leaderboard */}
            <div className="rounded-xl border border-slate-800 bg-[#111827] p-4">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-200">
                Top Risk &amp; Footprint Packages (click to inspect in Gravity Well)
              </h2>
              <div className="space-y-1.5">
                {analytics.sortedRisk.slice(0, 12).map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(n.id);
                      setViewMode('gravity');
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#0B0F17] px-3 py-2 text-left text-xs hover:border-amber-500/60"
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-bold text-slate-100">{n.id}</span>
                      <span className="ml-2 font-mono text-[10px] text-slate-400">
                        depth {n.depth} · subtree {n.transitiveCount} · {n.license}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {n.capabilities.map((c) => (
                        <span key={c} className="rounded bg-rose-500/15 px-1.5 py-0.5 font-mono text-[10px] text-rose-300">
                          {c}
                        </span>
                      ))}
                      <span className="w-16 text-right font-mono font-bold text-amber-300">Risk {n.riskScore}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Right Blast Radius Panel */}
        <aside className="flex w-full max-w-md flex-col space-y-4 overflow-y-auto border-l border-slate-800 bg-[#111827] p-4">
          {selectedNode && blast ? (
            <>
              <div className="space-y-2.5 rounded-xl border border-slate-800 bg-[#0B0F17] p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-amber-300">
                    {selectedNode.direct ? 'DIRECT DEP' : `DEPTH ${selectedNode.depth}`}
                  </span>
                  <span className="font-mono text-xs font-bold text-rose-300">
                    Risk {selectedNode.riskScore}/100
                  </span>
                </div>
                <h2 className="font-mono text-base font-bold text-slate-50">{selectedNode.id}</h2>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-slate-300">
                    License: {selectedNode.license} ({selectedNode.licenseTier})
                  </span>
                  {selectedNode.duplicateVersion && (
                    <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-amber-200">
                      <Copy className="h-3 w-3" /> Duplicate version in tree
                    </span>
                  )}
                </div>
                {selectedNode.capabilities.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedNode.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="inline-flex items-center gap-1 rounded bg-rose-500/15 px-2 py-0.5 font-mono text-[10px] text-rose-300"
                      >
                        <ShieldAlert className="h-3 w-3" /> {cap}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Interactive What-If Removal Simulator */}
              <div className="space-y-2.5 rounded-xl border border-slate-800 bg-[#0B0F17] p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-200">
                    <Trash2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span>What-If Removal Simulation</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleSimulateRemove(selectedNode.id)}
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold transition ${
                      removedRoots.has(selectedNode.id)
                        ? 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
                    }`}
                  >
                    {removedRoots.has(selectedNode.id) ? 'Restore Package' : 'Simulate Remove'}
                  </button>
                </div>
                <p className="text-xs text-slate-300">
                  Removing <strong>{selectedNode.name}</strong> eliminates{' '}
                  <strong className="text-emerald-400">{blast.exclusiveRemovalIds.length}</strong> exclusive node(s) and reaches{' '}
                  <strong className="text-sky-300">{selectedNode.dependentCount}</strong> upstream dependent(s).
                </p>
              </div>

              {/* Why is this here? (Upstream Blast Chains) */}
              <div className="space-y-2.5 rounded-xl border border-slate-800 bg-[#0B0F17] p-3.5">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-200">
                  <GitFork className="h-3.5 w-3.5 text-sky-400" />
                  <span>Why Is This Here? (Upstream Chains)</span>
                </div>
                {blast.rootPaths.length === 0 ? (
                  <p className="text-xs text-slate-400">Top-level direct dependency.</p>
                ) : (
                  <div className="space-y-2">
                    {blast.rootPaths.map((chain, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-800 bg-[#111827] p-2 font-mono text-[11px]">
                        {chain.map((id, idx) => (
                          <span key={id} className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setSelectedId(id)}
                              className={`rounded px-1.5 py-0.5 ${
                                id === selectedNode.id
                                  ? 'bg-amber-500/20 font-bold text-amber-200'
                                  : 'bg-slate-800 text-sky-300 hover:bg-slate-700'
                              }`}
                            >
                              {byId.get(id)?.name ?? id}
                            </button>
                            {idx < chain.length - 1 && <span className="text-slate-500">→</span>}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Direct Sub-Dependencies */}
              <div className="space-y-2 rounded-xl border border-slate-800 bg-[#0B0F17] p-3.5">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-200">
                  <Layers className="h-3.5 w-3.5 text-violet-400" />
                  <span>Direct Dependencies ({selectedNode.dependencies.length})</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedNode.dependencies.length === 0 && (
                    <span className="text-xs text-slate-500">Leaf package (0 dependencies)</span>
                  )}
                  {selectedNode.dependencies.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSelectedId(id)}
                      className="rounded border border-slate-700 bg-[#111827] px-2 py-0.5 font-mono text-[11px] text-slate-200 hover:border-sky-500"
                    >
                      {id}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-[#0B0F17] p-4 text-xs text-slate-400">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <span>Click any package node on the gravity canvas to trace its blast radius.</span>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default App;
