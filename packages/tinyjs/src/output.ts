import { join } from 'node:path';

export const assetBase = '/_tinyjs/';

export interface BuildAssets {
  entry: string;
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
