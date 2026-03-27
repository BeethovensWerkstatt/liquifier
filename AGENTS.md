# AGENTS.md

This file defines repository-wide coding and review rules for humans and AI agents.

## Scope

These rules apply to the whole repository unless a deeper AGENTS.md overrides them.

## Project Intent

- Keep the codebase modern JavaScript (ES2022+, ESM).
- Keep dependency footprint small and intentional.
- Preserve existing required external tooling:
  - `verovio`
  - `thulemeier`

## Runtime And Language

- Node.js environment.
- Use ESM modules (`import` / `export`), not CommonJS.
- Prefer clear, explicit code over clever abstractions.

## Dependency Policy

- Default: no new dependency unless clearly justified.
- Prefer Node built-ins and existing project utilities first.
- Add a dependency only if it significantly reduces complexity or risk.
- For each new dependency, document in PR description:
  - why it is needed
  - why built-ins/existing code are insufficient
  - package size and maintenance status considerations
- Avoid overlapping libraries that solve the same problem.

## Linting And Style (Mandatory)

- StandardJS is the canonical style and lint baseline.
- All changed JavaScript files must pass lint with zero warnings/errors.
- Do not disable lint rules inline unless absolutely necessary and justified.
- Keep diffs focused; avoid unrelated reformatting.

### Required Commands

- `npm run lint`
- `npm run lint:fix` (when appropriate, before finalizing)

## Testing Policy (Mandatory)

- Every behavior change requires tests.
- Every bug fix requires a regression test.
- Favor black-box tests that verify input/output behavior.
- Include edge cases and failure-path assertions for parsers/transformers.

### Coverage Target

- Minimum coverage target: 80% overall (lines/statements/functions/branches where practical).
- New/changed code should not reduce total coverage.
- If a justified exception is needed, explain it in the PR.

## Test Design Priorities

- Prioritize tests around I/O boundaries:
  - input files and CLI arguments
  - generated output files/artifacts (SVG, MIDI, HTML)
  - path and naming logic
  - date/filter selection behavior
- Prefer deterministic fixtures and stable snapshots (if used).
- Keep tests fast and isolated.

## Suggested Minimal Test Stack

Use minimal tooling unless there is a strong reason otherwise:

- Test runner: Node built-in `node:test`
- Assertions: Node built-in `assert/strict`
- Coverage: `c8`

## Change Checklist

Before merging any change, ensure:

1. Lint passes (`npm run lint`).
2. Tests pass.
3. Coverage is at least 80%.
4. Outputs remain deterministic for the same inputs.
5. No unnecessary new dependencies were introduced.

## Review Focus

Reviews should prioritize:

- behavioral correctness
- regressions in output generation
- missing or weak I/O-focused tests
- standards compliance and maintainability
