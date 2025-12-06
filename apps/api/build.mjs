import * as esbuild from 'esbuild';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

// Recursively get all TypeScript files
async function getFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return getFiles(path);
    } else if (entry.name.endsWith('.ts')) {
      return path;
    }
    return [];
  }));
  return files.flat();
}

const entryPoints = await getFiles('src');

await esbuild.build({
  entryPoints,
  outdir: 'dist',
  bundle: false,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  packages: 'external',
});

console.log('Build completed successfully');
