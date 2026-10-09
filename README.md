# Agent Orchestration

A portable multi-agent orchestration skill for Codex, Claude Code, and Kimi Code, with configurable roles and models.

Use focused subagents for exploration, research, implementation, browser work, and independent review. The main agent keeps responsibility for task scope, architecture, integration, and final acceptance, delegating work when independent execution or a fresh context adds value.

## Features

- Seven shared roles with host-specific native profiles.
- Configurable role selection, models, supported reasoning levels, and concurrency guidance.
- Interactive setup and a dependency-free configuration CLI.
- Installation previews, conflict detection, and repeatable updates that preserve unrelated profiles and locally edited managed files.

The host runs the agents and controls their permissions. This skill provides coordination instructions and profile generation; model authentication and tool access are configured in the host.

## Hosts

| Host | Generated profiles | Model selection |
| --- | --- | --- |
| [Codex](references/hosts/codex.md) | TOML | Native model and reasoning-effort fields |
| [Claude Code](references/hosts/claude-code.md) | Markdown with YAML frontmatter | Native model and effort fields |
| [Kimi Code](references/hosts/kimi-code.md) | Markdown with YAML frontmatter | Host model-pool aliases selected at dispatch |

Kimi support targets the Markdown Agent format described in its adapter. Model availability, browser tools, permissions, and profile discovery depend on the installed host and backend; verify them in a live session after setup.

## Quick start

### 1. Add the skill

Clone or download this repository into a folder named `agent-orchestration`, then make that folder discoverable through your host's skill installation mechanism. Keep the whole folder: `SKILL.md` references the bundled scripts, role definitions, and host adapters.

The configuration CLI requires **Node.js 22+**; Node.js 24 LTS is recommended. Runtime commands need no package installation or build step.

### 2. Configure agent profiles

From the skill directory, run this in your terminal:

```bash
node --version
node scripts/configure.mjs setup
```

The wizard collects the host, installation scope, configuration path, roles, concurrency limit, and model choices. It previews changes and asks for confirmation before writing. Cancel with `cancel`, Ctrl-C, or EOF. Saved configurations remain outside the skill directory so updates preserve your choices.

For agent-driven setup, use the non-interactive commands below. Installing profiles and making the skill discoverable are separate steps.

### 3. Use the skill

After the host discovers the skill and installed profiles, invoke it with a bounded task, for example:

```text
Use $agent-orchestration to implement this feature. Delegate independent work
where useful, preserve existing behavior, and verify the result before finishing.
```

Start a fresh session if the host has not loaded the profiles yet. Confirm the selected models and available tools with a small task before relying on a new setup.

## Non-interactive setup

This example creates a Codex configuration using inherited host model defaults, previews the generated profiles, and installs them for the current user. Run it from the skill directory and choose an unused configuration filename:

```bash
node scripts/configure.mjs init --host codex --config ~/.config/crew/codex.json
node scripts/configure.mjs render --config ~/.config/crew/codex.json
node scripts/configure.mjs install --config ~/.config/crew/codex.json --scope user
node scripts/configure.mjs install --config ~/.config/crew/codex.json --scope user --apply
node scripts/configure.mjs check --config ~/.config/crew/codex.json --scope user
```

- Use `claude-code` or `kimi-code` with a separate configuration for those hosts.
- For a project installation, use `--scope project --root /path/to/project` on both `install` and `check`.
- Add `--preset recommended` to `init` for the bundled Codex or Kimi starting choices. Check model access before using them. Recommended Kimi aliases require manual model-pool setup described in the [Kimi adapter](references/hosts/kimi-code.md#recommended-model-pool).
- `init` refuses to overwrite a configuration. `install` previews changes unless `--apply` is present. `check` compares installed files; it does not verify live host execution.

Agent Orchestration was previously named Crew. Existing `crew-*` profile and model alias names, state files, and configuration paths are retained for installation compatibility. See [configuration](references/configuration.md) for the JSON schema, scopes, conflict handling, and updates.

## Roles and coordination

The available roles are `explorer`, `docs-researcher`, `browser-debugger`, `executor`, `ui-styler`, `implementer`, and `reviewer`. Enable only the roles you need and configure their models independently.

The coordinator assigns bounded work with explicit ownership and acceptance checks, integrates returned results, and keeps unresolved decisions in the main conversation. Small or tightly coupled tasks can stay with the main agent. See [SKILL.md](SKILL.md) for role selection and the full workflow.

## Development

Development tooling requires **Node.js 22.22.1+** and the pnpm version declared in `package.json`.

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm test
```

Use `pnpm format` to format scripts and tests. In a Git checkout, the Husky pre-commit hook formats staged scripts and runs the test suite.

Tests cover configuration validation, profile generation, installation conflicts, idempotency, rollback, wizard cancellation, and compatibility with captured legacy fixtures. Runtime commands are also exercised without development dependencies. See [evaluation](references/evaluation.md) for live host acceptance checks and [AGENTS.md](AGENTS.md) for contribution guidelines.

## Reference

- [Configuration and installation](references/configuration.md)
- [Coordination workflow](SKILL.md)
- [Host acceptance and evaluation](references/evaluation.md)
- [Interactive testing](references/interactive-testing.md)
- [Role catalog](assets/roles.json)

