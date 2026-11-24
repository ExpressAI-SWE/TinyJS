import { isAbsolute, relative } from 'node:path';

interface Chunk {
  fileName: string;
  imports: string[];
  dynamicImports: string[];
  facadeModuleId: string | null;
  modules: Record<string, { renderedLength: number }>;
}

export function buildAnalysis(
  root: string,
  chunks: Chunk[],
  statistics: { file: string; raw: number; gzip: number }[],
  warnings: string[],
) {
  function moduleName(id: string) {
    const file = id.split('?')[0];
    const dependency = /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/g;
    const normalized = file.replaceAll('\\', '/');
    const packages = [...normalized.matchAll(dependency)];
    if (packages.length) return { file: normalized.slice(packages.at(-1)!.index! + '/node_modules/'.length), dependency: packages.at(-1)![1] };
    if (isAbsolute(file)) {
      const local = relative(root, file).replaceAll('\\', '/');
      return { file: local.startsWith('../') || isAbsolute(local) ? `[framework]/${normalized.split('/').at(-1)}` : local };
    }
    return { file: normalized.replace(/^\0/, '[virtual] ') };
  }

  const modules = new Map<string, { file: string; raw: number; chunks: string[]; dependency?: string }>();
  const assets = new Map(statistics.map(stat => [stat.file, stat]));
  const bundles = chunks.map(chunk => {
    for (const [id, module] of Object.entries(chunk.modules)) {
      if (!module.renderedLength) continue;
      const details = modules.get(id) ?? { ...moduleName(id), raw: 0, chunks: [] };
      details.raw += module.renderedLength;
      details.chunks.push(chunk.fileName);
      modules.set(id, details);
    }
    const asset = assets.get(chunk.fileName)!;
    return { file: asset.file, raw: asset.raw, gzip: asset.gzip, imports: chunk.imports, dynamicImports: chunk.dynamicImports, facade: chunk.facadeModuleId ? moduleName(chunk.facadeModuleId).file : null };
  });

  const dependencies = new Map<string, { name: string; raw: number; modules: number }>();
  const renderedModules = [...modules.values()].sort((a, b) => b.raw - a.raw);
  for (const module of renderedModules) {
    if (!module.dependency) continue;
    const entry = dependencies.get(module.dependency) ?? { name: module.dependency, raw: 0, modules: 0 };
    entry.raw += module.raw;
    entry.modules++;
    dependencies.set(entry.name, entry);
  }
  const dependencySizes = [...dependencies.values()].sort((a, b) => b.raw - a.raw);
  for (const item of dependencySizes) if (item.raw >= 100_000) warnings.push(`Large dependency: ${item.name} (${item.raw} rendered module characters)`);
  return {
    moduleSizeUnit: 'Rendered module characters reported by Rolldown',
    assets: statistics,
    modules: renderedModules,
    dependencies: dependencySizes,
    chunks: bundles,
    duplicates: renderedModules.filter(module => module.chunks.length > 1).map(({ file, chunks }) => ({ file, chunks })),
    warnings,
  };
}
