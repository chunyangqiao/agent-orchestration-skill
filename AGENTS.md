# Repository Guidelines

## Project Structure & Module Organization

Agent Orchestration coordinates subagents and generates profiles for Codex, Claude Code, and Kimi Code.

- `SKILL.md` defines the coordination workflow.
- `scripts/configure.mjs` is the CLI; `scripts/lib/` contains configuration, installation, and setup logic.
- `assets/roles.json` catalogs roles; `assets/roles/*.md` contains role instructions and shared `common.md` content. Presets and Kimi model variants are separate JSON assets.
- `references/hosts/` documents host adapters; other references cover configuration, evaluation, and interactive testing.
- `tests/*.test.mjs` exercises CLI, installation, and interactive setup. Legacy fixtures preserve Python v1 compatibility evidence.
- `agents/openai.yaml` supplies skill UI metadata, not an executable agent profile.

## Build, Test, and Development Commands

Runtime scripts require Node.js 22+ with no third-party packages or build step. Development tooling requires Node.js 22.22.1+ (24 LTS recommended). Install development dependencies with the package manager declared in `package.json`, then run commands from the repository root:

```bash
pnpm format
pnpm format:check
pnpm test
node scripts/configure.mjs --help
node scripts/configure.mjs setup
node scripts/configure.mjs init --host codex --config /tmp/crew-dev.json
node scripts/configure.mjs render --config /tmp/crew-dev.json
node scripts/configure.mjs install --config /tmp/crew-dev.json --scope project --root /tmp/crew-sandbox
```

`setup` is for a user's interactive terminal; agents collect choices in conversation and use the non-interactive commands. Choose an unused config filename: `init` refuses overwrites. `install` writes require `--apply`; afterward, use `check` with the same configuration, scope, and root. The wizard previews changes and asks for confirmation before writing.

## Coding Style & Naming Conventions

Use JavaScript ESM (`.mjs`), two-space indentation, `camelCase` functions, `PascalCase` classes, and `UPPER_CASE` constants. Keep runtime imports limited to Node.js built-ins and local modules. JSON uses two-space indentation and a trailing newline. Oxfmt formats scripts and tests using `.oxfmtrc.json`; no linter is configured.

Use lowercase kebab-case role IDs, matching `assets/roles/<role>.md`; generated profile names start with `crew-`. Keep catalog entries, role instructions, host references, and generator behavior consistent.

## Testing Guidelines

Use `node:test` and `*.test.mjs` files. Keep filesystem tests in temporary directories. `smol-toml` and `yaml` are development-only independent output parsers. Cover changed validation, rendering, conflicts, idempotency, rollback, and wizard cancellation across affected hosts. Preserve legacy installation fixtures and verify runtime commands without `node_modules`. No numeric coverage threshold is configured.

Read `references/evaluation.md` for adapter or routing changes. Distinguish passing static tests from verified host loading, model selection, and permissions.

## Commit & Pull Request Guidelines

This checkout has no Git metadata, so historical commit conventions cannot be verified. Recommended messages use short, imperative summaries, optionally prefixed with `feat:`, `fix:`, or `docs:`.

In a Git checkout, `pnpm prepare` enables the Husky pre-commit hook, which formats staged scripts with lint-staged and runs `pnpm test`.

PRs should explain the behavior change, affected hosts, linked issues when applicable, test results, and runtime verification gaps. Include generated-output examples for profile changes.

## Configuration Safety

Keep credentials in host configuration and personal choices outside the skill directory. Preview changes before applying them. Preserve unrelated profiles and locally edited managed files; resolve reported conflicts explicitly. Read `references/configuration.md` before changing installation behavior.
