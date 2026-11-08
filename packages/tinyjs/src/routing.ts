// Turn an app file path into a URL path and normalize incoming paths the same way.
export function routePath(file: string, suffix: '/page.tsx' | '/route.ts') {
  return file.slice('/app'.length, -suffix.length).split('/').map(encodeURIComponent).join('/') || '/';
}

export function requestPath(pathname: string) {
  const path = pathname.endsWith('//') ? pathname : pathname.replace(/\/$/, '');
  return path.split('/').map((segment) => encodeURIComponent(decodeURIComponent(segment))).join('/') || '/';
}

export interface RouteMatch { file: string; params: Record<string, string | string[]> }

// Check route names and detect ambiguous URL patterns before serving or building.
export function validateRoutes(files: string[], suffix: '/page.tsx' | '/route.ts') {
  const shapes = new Map<string, string>();
  for (const file of files) {
    const parts = file.slice(5, -suffix.length).split('/').filter(Boolean);
    const names = new Set<string>();
    for (const [index, part] of parts.entries()) {
      if (!part.includes('[') && !part.includes(']')) continue;
      const parameter = /^\[(\.\.\.)?(\w+)\]$/.exec(part);
      if (!parameter || (parameter[1] && index !== parts.length - 1) || names.has(parameter[2])) throw new Error(`Invalid route ${file}: use unique [name] parameters and terminal [...name] catch-alls.`);
      names.add(parameter[2]);
    }
    const shape = parts.map(part => part.startsWith('[...') ? '*' : part.startsWith('[') ? ':' : part).join('/');
    if (shapes.has(shape)) throw new Error(`Conflicting routes: ${shapes.get(shape)} and ${file}`);
    if (parts[0] === '_tinyjs') throw new Error(`Reserved route prefix /_tinyjs in ${file}`);
    shapes.set(shape, file);
  }
}

/** Static segments outrank parameters, which outrank terminal catch-alls. */
export function matchRoute(files: string[], path: string, suffix: '/page.tsx' | '/route.ts'): RouteMatch | undefined {
  const segments = path === '/' ? [] : path.slice(1).split('/');
  const candidates = files.map((file) => ({ file, parts: file.slice(5, -suffix.length).split('/').filter(Boolean) }));
  candidates.sort((a, b) => {
    const weight = (s = '') => s.startsWith('[...') ? 1 : s.startsWith('[') ? 2 : s ? 3 : 0;
    for (let i = 0; i < Math.max(a.parts.length, b.parts.length); i++) {
      const diff = weight(b.parts[i]) - weight(a.parts[i]);
      if (diff) return diff;
    }
    return a.file.localeCompare(b.file);
  });
  // Try routes in priority order and collect decoded dynamic segments for the page or API.
  for (const { file, parts } of candidates) {
    const params: RouteMatch['params'] = Object.create(null) as RouteMatch['params'];
    let index = 0;
    let valid = true;
    for (const part of parts) {
      const catchAll = /^\[\.\.\.(\w+)\]$/.exec(part);
      const dynamic = /^\[(\w+)\]$/.exec(part);
      if (catchAll) {
        if (index >= segments.length || part !== parts.at(-1)) { valid = false; break; }
        params[catchAll[1]] = segments.slice(index).map(decodeURIComponent);
        index = segments.length;
      } else if (dynamic && index < segments.length) {
        params[dynamic[1]] = decodeURIComponent(segments[index++]);
      } else if (segments[index++] !== encodeURIComponent(part)) { valid = false; break; }
    }
    if (valid && index === segments.length) return { file, params };
  }
}
