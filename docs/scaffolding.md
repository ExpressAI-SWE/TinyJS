# Create a TinyJS project

**TinyJS currently scaffolds Web applications only. Desktop and Mobile support are planned but not implemented.**

TinyJS requires Node.js 20.19+ on the Node 20 line, or Node.js 22.12 or newer. Install Bun if you select Bun as your package manager or test runner. npm and pnpm can also install and run a generated application.

## From this checkout

Use the local framework package to try the Stage 3.1 initializer before the matching packages are released. Run these commands from the repository root.

```sh
bun install --frozen-lockfile
bun run compile
npm pack ./packages/tinyjs
bun packages/create-tinyjs-fullstack/src/cli.ts my-tinyjs-app --framework ./tinyjs-0.1.0.tgz
cd my-tinyjs-app
bun run dev
```

After the matching framework and initializer are published, use `bun create tinyjs-fullstack@latest`, `bunx create-tinyjs-fullstack@latest`, or `npm create tinyjs-fullstack@latest`. These initializer names resolve to `create-tinyjs-fullstack`. Generated applications depend on `tinyjs-fullstack` and invoke its `tinyjs` executable.

## Setup options

Choose **Use recommended defaults** for a minimal TypeScript starter under `src/app/` with Tailwind CSS, Oxlint, Oxfmt, strict types, an example TinyJS unit test, and the `@/*` import alias. Setup initializes Git and installs with Bun. Git hooks, GitHub Actions, Playwright, and automatic dev startup are opt-in.

Choose **Customize settings** to select the full-stack starter, use JavaScript, put `app/` at the project root, change the alias to another prefix such as `@site/*` or `~/*`, or use CSS Modules or plain CSS. Both starters use file-based routing, SSR, and client hydration. The full-stack starter includes an API example by default. Client-only builds, static pre-rendering, and manual routing are outside the current scaffolding workflow.

Choose Oxlint, ESLint, Biome, or no linter, and Oxfmt, Prettier, Biome, or no formatter. The wizard also offers TinyJS, Vitest, or Bun unit tests, optional Playwright browser tests, and a choice of Bun, npm, or pnpm. The starter uses the same alias configuration for JavaScript and TypeScript.

## Automation

Pass `--yes` to skip prompts and override individual settings as needed. Use `--help` for all flags and accepted values. Boolean flags also accept their `--no-<flag>` form.

```sh
bun packages/create-tinyjs-fullstack/src/cli.ts my-app --yes --no-install
bun packages/create-tinyjs-fullstack/src/cli.ts my-api --yes --template fullstack --no-typescript --no-src --styling modules --unit vitest --package-manager npm --framework ./tinyjs-0.1.0.tgz
```

The initializer creates a new project directory and rejects existing destinations. If dependency installation fails, enter the generated directory and retry with the selected manager's `install` command. Use `pnpm install --ignore-workspace` if a parent pnpm workspace intercepts the install. Local framework archives work for local setup and require a registry dependency before using the generated GitHub Actions workflow. If Playwright reports a missing browser, run the browser installation command in the generated README.

## Generated project

| Path | Purpose |
| --- | --- |
| `src/app/page.tsx` | Home page and client hydration example |
| `src/app/api/hello/route.ts` | Optional API route |
| `tsconfig.json` | JSX and import alias settings |
| `tinyjs.config.json` | App layout and bundler alias |
| `tinyjs.test.json` | Enabled validation checks |
| `package.json` | Dependencies and `dev`, `build`, and `test` scripts |

JavaScript starters use `.jsx` for pages and `.js` for API routes. Root-level starters use `app/` in place of `src/app/`.

Run `bun run test`, `npm test`, or `pnpm test` to validate the app. Each runs `tinyjs test`. Run the same package manager's `run build` command for the production build. See [Testing](testing.md) for check selection, watch mode, and fixes.
