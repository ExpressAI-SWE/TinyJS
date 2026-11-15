import { join } from 'node:path';

// The server and Vite build agree on this URL prefix and output directory structure.
export const assetBase = '/_tinyjs/';

export interface BuildAssets {
  entry: string | null;
  styles: string[];
}

export function outputPaths(root: string) {
  const dir = join(root, '.tinyjs');
  return {
    dir,
    client: join(dir, 'client'),
    server: join(dir, 'server'),
    metadata: join(dir, 'build.json'),
  };
}
