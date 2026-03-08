# Contributing to Bobbin - Threads Filter

Welcome! We're glad you're here.

This project is a userscript that runs on real pages for real people, so stability and correctness matter more than speed. Most changes are quick fixes when Threads changes the DOM, so this guide focuses on doing that safely.

## How We Work

### Stability First

- Prefer safe, readable changes over cleverness.
- Avoid TODOs, commented-out code, or temporary debug logs.
- Guard DOM access and handle errors at boundaries so the page never breaks.

### Separation of Concerns

We keep responsibilities separated by folder so filter fixes stay easy to reason about:

- `src/core/` for orchestration and domain-level coordination
- `src/filters/` for rule evaluators and filter policies
- `src/dom/` for Threads DOM querying, extraction, and mutation
- `src/signals/` for Threads network integration (account search, "Not Interested", etc.)
- `src/ui/` for settings dialog and user controls
- `src/storage/` for persistence, schema, normalization, and migrations
- `src/observability/` for logging, diagnostics, and error reporting helpers
- `src/entry/` for userscript wiring and bootstrap
- `tools/` for build, lint, test, and release utilities

If you're unsure where code belongs, ask before you merge.
Never edit `bobbin-threads-filter.user.js` by hand. Always change `src/` and rebuild.

## Build System

This repo ships a compiled userscript. Please do not edit `bobbin-threads-filter.user.js` directly.

Workflow:

1. Install dependencies: `npm ci`
2. Make changes in `src/`.
3. Run the quality gates:
   - `npm run lint`
   - `npm run format:check`
   - `npm run test`
   - `npm run build`
4. Commit both your source changes and the rebuilt `bobbin-threads-filter.user.js`.

The build step injects the version banner and bundles everything into the userscript, so skipping it will leave the artifact out of sync.

### Node Version

We target Node 22 (see `.nvmrc`). If you're using nvm on Windows, install and use `22.14.0`.

## Public-Facing Changes

PRs that fix filters or add features are welcome. Just keep these areas consistent and intentional:

- Userscript behavior and filtering outcomes
- Userscript metadata header
- Settings UI and options
- Stored settings shape and migration behavior
- README installation and usage guidance

If you change any of the above, mention it in your PR so we can double-check user impact.

## Naming & Style

- Use `camelCase` for variables, functions, and methods.
- Use `PascalCase` for classes and constructors.
- Prefer `kebab-case` for new files unless a pattern already exists.
- Keep inline comments rare; only explain non-obvious behavior.
- Write docstrings in an imperative tone and focus on intent. Keep them short when code is simple; use Google-style JSDoc when complexity warrants it.

## Verification

Before opening a PR, run:

```powershell
npm run lint
npm run format:check
npm run test
npm run build
```

If you only run one thing, run the tests (`npm run test`). Most regressions show up there first.

## Commit Messages & Versioning

We use Conventional Commits: `type(scope): subject`. Your commit messages drive versioning and changelog entries, so please follow the format.

Scopes help everyone understand where a change lives. Common ones here: `core`, `filters`, `dom`, `signals`, `ui`, `storage`, `observability`, `build`.

Examples:

- `feat(filters): add trending topic blocking`
- `fix(dom): handle missing verified badge`
- `chore(build): update tooling`

Breaking changes must include `!` after the type or scope: `feat(ui)!: remove legacy setting`.

## CI & Release Strategy

Releases are automated with semantic-release in GitHub Actions:

- The workflow runs on pushes to `main` and can be triggered manually.
- Release notes are based on Conventional Commits.
- The release job rebuilds `bobbin-threads-filter.user.js` so the userscript banner stays in sync.
- GitHub Releases are published automatically and include the built userscript as a release asset.
- Releases do not write a bot-generated release commit back to `main`.

## Review Process

We review PRs with the following in mind:

- Does the change respect folder boundaries?
- Is the behavior stable and predictable on real pages?
- Are tests updated when needed?
- Is the change clear to maintainers and users?
