// These tests check that route validation reports ambiguous or invalid route names.
import { expect, test } from 'bun:test';
import { validateRoutes } from '../packages/tinyjs/src/routing.js';
test('route diagnostics reject ambiguity, malformed catch-alls and duplicate params', () => {
 expect(() => validateRoutes(['/app/a/[id]/page.tsx','/app/a/[name]/page.tsx'],'/page.tsx')).toThrow('Conflicting');
 expect(() => validateRoutes(['/app/[...all]/more/page.tsx'],'/page.tsx')).toThrow('Invalid');
 expect(() => validateRoutes(['/app/[id]/[id]/page.tsx'],'/page.tsx')).toThrow('Invalid');
 expect(() => validateRoutes(['/app/_tinyjs/page.tsx'],'/page.tsx')).toThrow('Reserved');
});
