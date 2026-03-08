# AGENTS.md

## Purpose

- Define non-negotiable engineering standards for AI agents working on `Bobbin-Threads-Filter`.
- Keep the project reliable, testable, and easy to evolve.
- Treat every rule in this file as imperative.

## Command Environment (Windows 11)

- Use PowerShell syntax and Windows paths.
- Avoid Linux/WSL-specific commands and assumptions.
- Ensure local scripts and examples run in Windows terminals.

## Project Context

- Project type: userscript built from `src/` into one distributable `.user.js` artifact.
- Primary target site: Threads.
- Core filtering capabilities include:
  - Username-based filtering.
  - Verified/blue-check filtering with configurable whitelist behavior.
  - Phrase and regex-based filtering.

## Non-Negotiable Engineering Principles

1. Build in a strict object-oriented style that is easy to expand, reason about, and fix.
2. Enforce strong separation of concerns across `src/` modules.
3. Apply DRY by default, except where abstraction would hide intent.
4. Maintain strong observability so issues are traceable even without obvious breakage.
5. Use self-documenting, expressive, concise names.
6. Keep inline comments to a minimum; use them only for non-obvious behavior or constraints.
7. Require docstrings with complexity-matched depth and imperative tone that explains intent.
8. Back all behavior with tests.
9. Enforce linted, professional JavaScript standards at all times.

## Architecture and Separation of Concerns (Mandatory)

- Keep layers clean and explicit.
- Recommended module boundaries:
  - `src/entry/` for metadata wiring and bootstrap.
  - `src/core/` for orchestration and domain-level coordination.
  - `src/filters/` for rule evaluators and filter policies.
  - `src/dom/` for host-page DOM querying, extraction, and mutation.
  - `src/routes/` for view/route-specific behavior.
  - `src/storage/` for persistence, schema, normalization, and migrations.
  - `src/ui/` for settings and user controls.
  - `src/observability/` for logging, diagnostics, and error reporting helpers.
  - `tests/` for unit and DOM integration tests.
  - `tools/` for build, lint, test, and release utilities.
- Use classes for stateful behavior and collaborating services.
- Keep pure logic isolated from DOM and storage side effects.
- Remove compatibility shims inside internal code during refactors; keep internals native and coherent.

## DRY, Naming, Comments, and Docstrings

- Keep one source of truth for each rule, transform, and policy.
- Avoid copy-paste logic across modules when shared behavior can be centralized clearly.
- Prefer clarity over over-abstraction when DRY and readability conflict.
- Name functions, classes, methods, variables, and files so intent is obvious from usage.
- Inline comments are allowed only when behavior is non-obvious and cannot be clarified through naming or structure.
- Docstrings are mandatory and must:
  - Use imperative tone.
  - Explain intent and rationale ("why"), not only mechanics ("what").
  - Scale by complexity:
    - Simple logic: concise one-liner.
    - Complex logic: full Google-style docstring with parameters, returns, and constraints.

## Observability and Diagnostics

- Treat observability as first-class architecture, not an afterthought.
- Centralize logging through shared observability utilities; avoid ad-hoc console noise.
- Support at least explicit log levels (for example: `debug`, `info`, `warn`, `error`).
- Include enough context in emitted diagnostics to trace subsystem, rule, and failure cause.
- Guard verbose diagnostics behind a debug flag so normal operation remains quiet.
- Catch boundary errors and report them through observability paths without breaking host-page execution.

## Userscript Safety and Runtime Reliability

- Never break host-page interaction.
- Keep DOM access null-safe and failure-tolerant.
- Make CSS injection idempotent.
- Scope mutation observers carefully; ensure they are throttle/debounce aware and disconnectable.
- Prefer stable/semantic selectors over brittle positional selectors.
- Fail soft when selectors drift or markup changes: skip safely and log diagnostics in debug mode.

## Public Contract and Compatibility

- Treat these as public contract:
  - Userscript metadata header.
  - User-visible filtering behavior and outcomes.
  - Settings UI options and semantics.
  - Stored settings shape and migration behavior.
  - Installation and usage steps documented in `README.md`.
- Do not change user-visible behavior unless explicitly requested.
- When migrating internals, update all callsites and remove obsolete paths in the same change.

## Build and Artifact Discipline

- `src/` is the only source of truth.
- Generated root `.user.js` artifact is build output only; never edit it manually.
- Build output must be deterministic for identical source input.
- Metadata version must be sourced from `package.json` at build time.

## Testing Requirements

- Add or update tests alongside every behavior change.
- Cover pure logic with unit tests.
- Cover DOM behavior with integration tests (for example, `jsdom`).
- Add regression tests for previously broken or fragile behavior.
- Verify idempotency for repeated initialization, repeated observer cycles, and repeated style injection.
- For filter logic, test positive/negative cases for:
  - Username filtering.
  - Verified/blue-check filtering with whitelist behavior.
  - Phrase filtering.
  - Regex filtering, including invalid regex input handling.

## Tooling and Quality Gates (Blocking)

- The following checks are required before work is considered complete:
  - `npm run lint`
  - `npm run format:check`
  - `npm run test`
  - `npm run build`
- If dependencies are missing, install with `npm ci`.
- Do not mark a task complete when any blocking gate fails.

## Refactor and Change Policy

- Refactors must be complete and production-ready.
- Update all callsites and remove dead code in the same change.
- Do not leave TODOs, temporary debug logs, commented-out code, or placeholder shims.
- Keep each change cohesive and native-looking in project style.

## Planning Expectations

- Implementation plans must contain no open questions when answers can be discovered from the codebase.
- Only leave open questions that require explicit product or external dependency decisions.

## Documentation Policy

- Keep documentation concise and practical.
- Use `README.md` as the user-facing documentation source.
- Update `README.md` whenever user-visible behavior, configuration, or installation flow changes.

## Definition of Done

- Architecture and separation of concerns remain strong.
- Code is self-documenting and naming is explicit.
- Inline comments and docstrings follow this policy.
- Observability is sufficient to debug failures quickly.
- Tests cover changed behavior and regressions.
- Lint, format, test, and build all pass.
- Generated userscript artifact is produced from source.

## Commit Messages

- When asked to draft a commit, use Conventional Commits format:
  - `type(scope): subject`
