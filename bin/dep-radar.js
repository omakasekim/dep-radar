#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'dist-cli', 'analyze.mjs');

if (!existsSync(entry)) {
  console.error('dep-radar CLI build not found. Run `npm run build` first.');
  process.exit(1);
}

const { runCli } = await import(pathToFileURL(entry).href);
await runCli(process.argv.slice(2));
