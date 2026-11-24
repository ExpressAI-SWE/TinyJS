import { useState } from 'preact/hooks';
import { Detail, Metrics, Search, Table, bytes, display, list, matches, ms, number, string } from './inspector-view.js';
import type { Data, InspectorProps } from './inspector-view.js';

interface ModuleCell {
  item: Data;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Split the longest axis by the rendered-byte ratio. A cell's area represents its share.
function moduleTreemap(items: Data[], x = 0, y = 0, width = 100, height = 100): ModuleCell[] {
  if (!items.length) return [];
  if (items.length === 1) return [{ item: items[0], x, y, width, height }];
  const weight = (item: Data) => number(item.raw) ?? 0;
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  let split = 1;
  let first = weight(items[0]);
  while (split + 1 < items.length && first + weight(items[split]) <= total / 2) first += weight(items[split++]);
  const ratio = first / total;
  if (width >= height) {
    const left = width * ratio;
    return [...moduleTreemap(items.slice(0, split), x, y, left, height),
      ...moduleTreemap(items.slice(split), x + left, y, width - left, height)];
  }
  const top = height * ratio;
  return [...moduleTreemap(items.slice(0, split), x, y, width, top),
    ...moduleTreemap(items.slice(split), x, y + top, width, height - top)];
}

export function Build({ model }: InspectorProps) {
  const [query, setQuery] = useState('');
  const [selected, select] = useState('');
  const build = model.snapshot?.build;
  if (!build) return <p class="dt-muted">Run tinyjs build to generate bundle statistics for this application.</p>;
  const assets = list(build.assets);
  const modules = list(build.modules);
  const dependencies = list(build.dependencies);
  const duplicates = list(build.duplicates);
  const byFile = (item: Data) => string(item.file ?? item.name);
  const assetFilter = (suffix?: string) => assets.filter((item) => !suffix || byFile(item).endsWith(suffix));
  const size = (items: Data[], key: string) => items.reduce((sum, item) => sum + (number(item[key]) ?? 0), 0);
  const entries = assets.filter((item) => matches(query, byFile(item)));
  const analysis = modules.filter((item) => (number(item.raw) ?? 0) > 0 && matches(query, byFile(item)))
    .sort((a, b) => (number(b.raw) ?? 0) - (number(a.raw) ?? 0)).slice(0, 45);
  const cells = moduleTreemap(analysis);
  const module = modules.find((item) => byFile(item) === selected);
  const routeChunks = list(build.chunks).filter((chunk) => typeof chunk.facade === 'string' && /\/page\.[jt]sx?$/.test(chunk.facade));
  return <>
    <Metrics entries={[
      ['Client assets', assets.length], ['Total raw', bytes(size(assets, 'raw'))], ['Total gzip', bytes(size(assets, 'gzip'))],
      ['JavaScript', bytes(size(assetFilter('.js'), 'raw'))], ['CSS', bytes(size(assetFilter('.css'), 'raw'))],
      ['Shared runtime (gzip)', bytes(build.sharedGzip)], ['Duration', ms(build.durationMs)], ['Entry', build.entry],
    ]} />
    {Array.isArray(build.warnings) && build.warnings.length > 0 && <>
      <h3>Warnings</h3><ul>{build.warnings.map((warning) => <li key={String(warning)}>{display(warning)}</li>)}</ul>
    </>}
    <div class="dt-filters"><Search label="Search build assets and modules" value={query} setValue={setQuery} /></div>
    <Table columns={['Asset', 'Raw', 'Gzip']} rows={entries.map((item) => ({
      key: byFile(item), cells: [byFile(item), bytes(item.raw), bytes(item.gzip)],
    }))} />
    {routeChunks.length > 0 && <><h3>Route bundles</h3><Table columns={['Source', 'Chunk', 'Gzip']} rows={routeChunks.map((item) => ({
      key: byFile(item), cells: [display(item.facade), byFile(item), bytes(item.gzip)],
    }))} /></>}
    <h3>Module size map</h3>
    {!modules.length ? <p class="dt-muted">Run tinyjs build --analyze to include module sizes and dependency details.</p> :
      !cells.length ? <p class="dt-muted">No matching modules with rendered bytes.</p> :
      <div class="dt-treemap" aria-label="Largest matching modules by rendered bytes">{cells.map(({ item, x, y, width, height }) =>
        <button class="dt-button" type="button" key={byFile(item)} aria-pressed={selected === byFile(item)}
          title={byFile(item) + ' ' + bytes(item.raw)} onClick={() => select(byFile(item))}
          style={{ left: x + '%', top: y + '%', width: width + '%', height: height + '%' }}>
          {byFile(item).split('/').at(-1)} {bytes(item.raw)}
        </button>)}</div>}
    {module && <Detail value={module} />}
    {dependencies.length > 0 && <><h3>Dependencies</h3><Table columns={['Dependency', 'Rendered size', 'Modules']} rows={dependencies
      .filter((item) => matches(query, byFile(item))).map((item) => ({
        key: byFile(item), cells: [byFile(item), bytes(item.raw), display(item.modules)],
      }))} /></>}
    {duplicates.length > 0 && <><h3>Duplicate modules</h3><Table columns={['Module', 'Chunks']} rows={duplicates.map((item) => ({
      key: byFile(item), cells: [byFile(item), display(item.chunks)],
    }))} /></>}
  </>;
}
