# Testing

Run `tinyjs test` from the project root. The only native CLI commands are `dev`,
`build`, `serve`, and `test`. No separate unit, browser, or watch commands exist.

Discovery recursively includes `*.test.*`, `*_test.*`, `*.spec.*`, and `*_spec.*`
with extensions `js`, `jsx`, `ts`, `tsx`, `mjs`, `cjs`, `mts`, and `cts`.
Hidden entries and directories named `node_modules`, `dist`, `build`, and
`coverage` are excluded. Symbolic links are not followed. Put tests anywhere
else in the project, such as `tests/` or beside the source. An empty project
reports an error and exits nonzero.

The CLI uses its current runtime's runner: Node's built-in test runner on Node,
and Bun's existing test runner on Bun. Use `node:test` and `node:assert/strict`
for portable tests. Node TypeScript/JSX tests require a project development
dependency: `npm install --save-dev tsx`. JavaScript-only Node tests need no
additional dependency. Bun loads TypeScript directly. Bun-specific tests using
`bun:test`, `Bun`, or `import.meta.dir` must run with Bun, for example
`bun node_modules/tinyjs/bin/tinyjs.js test`. There is no automatic fallback to
another runtime or installation of dependencies.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('addition', () => assert.equal(1 + 1, 2));
test.skip('explicitly deferred', () => {});
```

All discovered tests run in the same invocation, including browser integration
tests. Runner diagnostics and passed, failed, and skipped counts are displayed.
Failures, import errors, unavailable dependencies, and missing browsers return
a nonzero exit status. Only explicit test skips are treated as skips. Tests run
with `NODE_ENV=test`; they do not trigger an application build automatically.
Runner-specific configuration can affect execution; do not configure exclusions
or conditional skips to conceal missing prerequisites.

Install browser tooling as a **devDependency** and install its browser before
running browser tests. TinyJS does not download browsers during testing. This
workspace uses `playwright-core`: run `bun run browser:install` or set
`TINYJS_CHROMIUM_PATH` to an installed Chromium executable.

In this repository, `bun run test` compiles the CLI, type-checks all examples,
then invokes `tinyjs test` with Bun to preserve the Stage 2 suite. Its browser
tests remain mandatory. Testing code is loaded only by the CLI's `test` branch;
`tsx` and browser tooling are development dependencies and are not imported by
the production client runtime.
