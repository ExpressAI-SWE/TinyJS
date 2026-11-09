// Build settings accepted by TinyJS. defineConfig checks them before Vite uses them.
export interface TinyConfig {
  appDir?: 'app' | 'src/app';
  importAlias?: string;
  sourcemap?: boolean | 'hidden';
  compress?: boolean;
  budgets?: { sharedGzip?: number; chunkGzip?: number; fail?: boolean };
}
export function defineConfig(value: TinyConfig): TinyConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('TinyJS config must be an object.');
  // Reject unknown settings and invalid values early, including nested budget settings.
  for (const key of Object.keys(value)) if (!['appDir', 'importAlias', 'sourcemap', 'compress', 'budgets'].includes(key)) throw new TypeError(`Unknown TinyJS option: ${key}`);
  if (value.appDir !== undefined && value.appDir !== 'app' && value.appDir !== 'src/app') throw new TypeError('appDir must be app or src/app.');
  if (value.importAlias !== undefined && (typeof value.importAlias !== 'string' || !/^[@~#][a-zA-Z0-9_-]*\/\*$/.test(value.importAlias))) throw new TypeError('importAlias must be a wildcard alias such as @/*.');
  if (value.sourcemap !== undefined && typeof value.sourcemap !== 'boolean' && value.sourcemap !== 'hidden') throw new TypeError('sourcemap must be boolean or hidden.');
  if (value.compress !== undefined && typeof value.compress !== 'boolean') throw new TypeError('compress must be boolean.');
  if (value.budgets !== undefined) {
    if (!value.budgets || typeof value.budgets !== 'object' || Array.isArray(value.budgets)) throw new TypeError('budgets must be an object.');
    for (const [key, budget] of Object.entries(value.budgets)) {
      if (!['sharedGzip', 'chunkGzip', 'fail'].includes(key)) throw new TypeError(`Unknown budget: ${key}`);
      if (key === 'fail' ? typeof budget !== 'boolean' : !Number.isSafeInteger(budget) || Number(budget) < 1) throw new TypeError(`Invalid budget: ${key}`);
    }
  }
  return value;
}
