---
name: dep-radar
description: >
  Lockfile gravity-well explorer with org license compliance gate, package.json duplicate override generator, PR lockfile diff, telemetry charts, and SBOM export.
license: MIT
---

# dep-radar

Maps npm/pnpm lockfile dependency weight, flags copyleft licenses, resolves duplicate versions, and exports CycloneDX/SPDX SBOMs.

- **Live Interactive Workbench:** https://omakasekim.github.io/dep-radar/
- **Repository:** https://github.com/omakasekim/dep-radar
- **Category:** Supply Chain · **Deliverable:** Web Workbench
- **Ecosystems:** `npm`, `pnpm`, `sbom`, `license-audit`
- **Stack:** React, TypeScript, Canvas, SBOM

## When to Use This Skill
Invoke `dep-radar` whenever the user wants to analyze, debug, simulate, or visualize workflows related to **Supply Chain** (npm, pnpm, sbom, license-audit).

## Modes & Capabilities
- **Gravity Force Graph**
- **Supply-Chain Telemetry**
- **PR Diff & Policy**

## Operating Workflow
1. **Local CLI / Companion Execution:**
   ```bash
   npx dep-radar (or node bin/dep-radar.js after npm run build)
   ```
   Analyze local npm/pnpm lockfiles for dependency weight, duplicate overrides, license compliance, and CycloneDX/SPDX SBOM export.
2. **Interactive Visual Inspection:**
   Direct the user to the zero-backend browser workbench at https://omakasekim.github.io/dep-radar/ (supports URL-hash state sharing, built-in realistic presets, `Cmd/Ctrl + K` command palette, and JSON/Markdown/config exports).
3. **Structured Output:**
   Summarize concrete findings, diagnostics, and copy-pasteable remediation commands concisely so the user can act immediately without manual guesswork.
