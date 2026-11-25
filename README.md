# dep-radar

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![GitHub Pages](https://img.shields.io/badge/demo-GitHub%20Pages-f59e0b.svg)
![Ecosystems](https://img.shields.io/badge/lockfiles-npm%20%7C%20pnpm%20%7C%20Cargo%20%7C%20uv-10b981.svg)

> Zero-backend lockfile blast-radius explorer & CLI analyzer visualizing transitive footprint gravity wells, license tiers, duplicate versions, and supply-chain capability flags.

## Quickstart

```bash
npm install
npm run dev                  # Open interactive gravity-well visualizer
npm run build                # Build static Pages bundle + CLI analyzer
npx dep-radar --cargo        # Inspect built-in Cargo.lock risk report via CLI
```

## Features

- **4 Real Lockfile Parsers:** Drop or paste `package-lock.json`, `pnpm-lock.yaml`, `Cargo.lock`, or `uv.lock` (plus 3 built-in workspace samples).
- **Gravity-Well Force Graph:** Node size scales with transitive subtree weight; color encodes license/capability risk (`install-script`, `network`, `filesystem`, `child-process`, `native-code`).
- **Why Is This Here? & Removal Impact:** Click any package to trace shortest upstream chains from direct dependencies and simulate how many exclusive subtrees vanish if removed.

## Verify

```bash
npm test
npm run build
```
