export function routePath(file: string, suffix: '/page.tsx' | '/route.ts') {
  return file.slice('/app'.length, -suffix.length).split('/').map(encodeURIComponent).join('/') || '/';
}

export function requestPath(pathname: string) {
  const path = pathname.endsWith('//') ? pathname : pathname.replace(/\/$/, '');
  return path.split('/').map((segment) => encodeURIComponent(decodeURIComponent(segment))).join('/') || '/';
}
