export type LockfileEcosystem = 'npm' | 'pnpm' | 'cargo' | 'uv';
export type LicenseTier = 'permissive' | 'weak-copyleft' | 'strong-copyleft' | 'unknown';
export type CapabilityFlag = 'install-script' | 'network' | 'filesystem' | 'child-process' | 'native-code';

export interface DepNode {
  id: string;
  name: string;
  version: string;
  direct: boolean;
  depth: number;
  transitiveCount: number;
  dependentCount: number;
  license: string;
  licenseTier: LicenseTier;
  capabilities: CapabilityFlag[];
  duplicateVersion: boolean;
  riskScore: number;
  dependencies: string[];
  dependents: string[];
}

export interface DepEdge {
  id: string;
  source: string;
  target: string;
}

export interface DepGraph {
  ecosystem: LockfileEcosystem;
  projectName: string;
  nodes: DepNode[];
  edges: DepEdge[];
  duplicateNames: string[];
  stats: {
    totalPackages: number;
    directCount: number;
    maxDepth: number;
    duplicatePackages: number;
    scriptCount: number;
    highRiskCount: number;
    copyleftCount: number;
  };
}

export interface BlastRadiusResult {
  selectedId: string;
  upstreamIds: Set<string>;
  downstreamIds: Set<string>;
  highlightedEdgeIds: Set<string>;
  rootPaths: string[][];
  exclusiveRemovalIds: string[];
}
