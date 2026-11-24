export const devtoolsPositions = ['bottom-left', 'bottom-right', 'top-left', 'top-right'] as const;
export interface DevToolsConfig {
  enabled?: boolean;
  position?: typeof devtoolsPositions[number];
  profiling?: boolean;
  maxEvents?: number;
}

// Build and development settings accepted by TinyJS.
export interface TinyConfig {
  rootApiRoutes?: boolean;
  appDir?: 'app' | 'src/app';
  importAlias?: string;
  sourcemap?: boolean | 'hidden';
  compress?: boolean;
  budgets?: { sharedGzip?: number; chunkGzip?: number; fail?: boolean };
  devtools?: DevToolsConfig;
}
export function defineConfig(value: TinyConfig): TinyConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('TinyJS config must be an object.');
  // Reject unknown settings and invalid values early, including nested budget settings.
  for (const key of Object.keys(value)) if (!['rootApiRoutes', 'appDir', 'importAlias', 'sourcemap', 'compress', 'budgets', 'devtools'].includes(key)) throw new TypeError(`Unknown TinyJS option: ${key}`);
  if (value.rootApiRoutes !== undefined && typeof value.rootApiRoutes !== 'boolean') throw new TypeError('rootApiRoutes must be boolean.');
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
  if (value.devtools !== undefined) {
    if (!value.devtools || typeof value.devtools !== 'object' || Array.isArray(value.devtools)) throw new TypeError('devtools must be an object.');
    for (const key of Object.keys(value.devtools)) {
      if (!['enabled', 'position', 'profiling', 'maxEvents'].includes(key)) throw new TypeError(`Unknown DevTools option: ${key}`);
    }
    const { enabled, position, profiling, maxEvents } = value.devtools;
    if (enabled !== undefined && typeof enabled !== 'boolean') throw new TypeError('devtools.enabled must be boolean.');
    if (position !== undefined && !devtoolsPositions.includes(position)) throw new TypeError(`devtools.position must be ${devtoolsPositions.join(', ')}.`);
    if (profiling !== undefined && typeof profiling !== 'boolean') throw new TypeError('devtools.profiling must be boolean.');
    if (maxEvents !== undefined && (!Number.isSafeInteger(maxEvents) || maxEvents < 1 || maxEvents > 5000)) throw new TypeError('devtools.maxEvents must be an integer from 1 to 5000.');
  }
  return value;
}
