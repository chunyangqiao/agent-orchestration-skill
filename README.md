# Agent Orchestration

A portable multi-agent orchestration skill for Codex, Claude Code, and Kimi Code, with configurable roles and models.

Use focused subagents for exploration, research, implementation, browser work, and independent review. The main agent keeps responsibility for task scope, architecture, integration, and final acceptance, delegating work when independent execution or a fresh context adds value.

## Features

- Seven shared roles with host-specific native profiles.
- Configurable role selection, models, supported reasoning levels, and concurrency guidance.
- AI-driven installation, a non-interactive bootstrap command, and an interactive terminal wizard.
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

### Install with an AI agent

Give your agent the repository URL or local checkout path and this request:

```text
Install Agent Orchestration from this repository for my current agent host.
Read SKILL.md and follow the AI-driven installation guide in references/configuration.md.
Inspect existing choices and ask once for unresolved scope and model choices,
showing the default roles and concurrency. Then deploy the complete skill,
preview and apply the profiles, and verify the installation.
Report skill deployment, static profile checks, and live subagent verification
separately; if live verification is blocked, give the exact next step.
```

The agent completes the authorized installation using the non-interactive CLI. It should not stop after copying the skill folder or hand you the terminal wizard to finish the remaining setup. See [AI-driven installation](references/configuration.md#ai-driven-installation) for the complete workflow.

The configuration CLI requires **Node.js 22+**; Node.js 24 LTS is recommended. Runtime commands need no package installation or build step.

### Manual installation

Clone or download this repository into a folder named `agent-orchestration`, then make the complete folder discoverable through your host's skill installation mechanism. From that folder, run the terminal wizard:

```bash
node --version
node scripts/configure.mjs setup
```

The wizard collects the host, installation scope, configuration path, roles, concurrency limit, and model choices. It previews changes and asks for confirmation before writing. Cancel with `cancel`, Ctrl-C, or EOF. Saved configurations remain outside the skill directory so updates preserve your choices.

Alternatively, use the bootstrap command below. Making the skill discoverable and installing its agent profiles are both required.

### Use the skill

After the host discovers the skill and installed profiles, invoke it with a bounded task, for example:

```text
Use $agent-orchestration to implement this feature. Delegate independent work
where useful, preserve existing behavior, and verify the result before finishing.
```

Start a fresh session if the host has not loaded the profiles yet. Confirm the selected models and available tools with a small task before relying on a new setup.
Invoking the skill alone does not start subagents: provide a concrete task. Small or tightly coupled tasks can stay in the main conversation.

## Bootstrap profiles

Run from the skill directory. This example previews a Codex user installation, then saves a new configuration if needed, installs profiles, and checks the installed files:

```bash
node scripts/configure.mjs bootstrap --host codex --scope user --config ~/.config/crew/codex.json --preset inherit
node scripts/configure.mjs bootstrap --host codex --scope user --config ~/.config/crew/codex.json --preset inherit --apply

# Optional independent recheck later:
node scripts/configure.mjs check --config ~/.config/crew/codex.json --scope user
```

- Use `claude-code` or `kimi-code` with a separate configuration for those hosts.
- For a project installation, use `--scope project --root /path/to/project` on both `bootstrap` and `check`.
- New configurations default to all seven roles, three active children, and inherited host models. Use `--preset recommended` for the bundled Codex or Kimi choices after checking model access. Kimi aliases require [manual model-pool setup](references/hosts/kimi-code.md#recommended-model-pool).
- Existing configurations are reused unchanged; `--preset` only affects creation. For custom models, role subsets, or concurrency, prepare a source JSON using the [configuration contract](references/configuration.md#configuration-contract), then bootstrap it.
- Preview creates no files or directories. `--apply` writes only the source configuration and managed profiles. Keep the source outside the skill and managed Agent directories. Bootstrap does not copy the skill itself.
- The JSON result identifies configuration creation/reuse and static check status. `runtime_verified: false` means live host loading and execution still need verification, even after static checks pass.

The individual `init`, `render`, `install`, and `check` commands remain available for [step-by-step configuration](references/configuration.md#step-by-step-commands). The `setup` wizard remains available for interactive terminal use.

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

Tests cover configuration validation, profile generation, bootstrap previews and post-install checks, installation conflicts, idempotency, rollback, wizard cancellation, and compatibility with captured legacy fixtures. Runtime commands are also exercised without development dependencies. See [evaluation](references/evaluation.md) for live host acceptance checks and [AGENTS.md](AGENTS.md) for contribution guidelines.

## Reference

- [Configuration and installation](references/configuration.md)
- [Coordination workflow](SKILL.md)
- [Host acceptance and evaluation](references/evaluation.md)
- [Interactive testing](references/interactive-testing.md)
- [Role catalog](assets/roles.json)
