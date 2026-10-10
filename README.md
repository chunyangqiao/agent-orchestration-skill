# Agent Orchestration

**English** | [简体中文](README.zh-CN.md)

**Version: 2.1.0**

A portable multi-agent orchestration skill for Codex, Claude Code, and Kimi Code, with configurable roles and models.

Use focused subagents for exploration, research, implementation, browser work, and independent review. The main agent keeps responsibility for task scope, architecture, integration, and final acceptance. Explicit invocation with a concrete task requires at least one real subagent; implicit use remains conditional on the benefit of delegation.

## Features

- Seven shared roles with host-specific native profiles.
- Configurable role selection, models, supported reasoning levels, and concurrency guidance.
- AI-driven installation, a non-interactive bootstrap command, and an interactive terminal wizard.
- Installation previews, conflict detection, and repeatable updates that preserve unrelated profiles and locally edited managed files.

The host runs the agents and controls their permissions. This skill provides coordination instructions and profile generation; model authentication and tool access are configured in the host.

## Hosts

| Host | Generated profiles | Model selection |
| --- | --- | --- |
| [Codex](skills/agent-orchestration/references/hosts/codex.md) | TOML | Native model and reasoning-effort fields |
| [Claude Code](skills/agent-orchestration/references/hosts/claude-code.md) | Markdown with YAML frontmatter | Native model and effort fields |
| [Kimi Code](skills/agent-orchestration/references/hosts/kimi-code.md) | Markdown with YAML frontmatter | Host model-pool aliases selected at dispatch |

Kimi support targets the Markdown Agent format described in its adapter. Model availability, browser tools, permissions, and profile discovery depend on the installed host and backend; verify them in a live session after setup.

## Quick start

### Install with an AI agent

Give your agent the repository URL or local checkout path and this request:

```text
Install Agent Orchestration from this repository for my current agent host.
Read skills/agent-orchestration/SKILL.md and follow the AI-driven installation
guide in skills/agent-orchestration/references/configuration.md.
Inspect existing choices and ask once for unresolved scope and model choices,
showing the default roles and concurrency. Then deploy the complete skill,
preview and apply the profiles, and verify the installation.
Report skill deployment, static profile checks, and live subagent verification
separately; if live verification is blocked, give the exact next step.
```

The agent completes the authorized installation using the non-interactive CLI. It should not stop after copying the skill folder or hand you the terminal wizard to finish the remaining setup. See [AI-driven installation](skills/agent-orchestration/references/configuration.md#ai-driven-installation) for the complete workflow.

The configuration CLI requires **Node.js 22+**; Node.js 24 LTS is recommended. Runtime commands need no package installation or build step.

### Manual installation

Clone or download this repository, then deploy the complete `skills/agent-orchestration/` directory through your host's skill installation mechanism. Keep its directory name as `agent-orchestration` and include its scripts, assets, references, metadata, and license. From the installed skill directory, run the terminal wizard:

```bash
node --version
node scripts/configure.mjs setup
```

The installed skill needs only Node.js; it has no `package.json` or development dependencies. To configure profiles from a source checkout instead, run `pnpm run setup` or `node skills/agent-orchestration/scripts/configure.mjs setup` from the repository root.

The wizard collects the host, installation scope, configuration path, roles, concurrency limit, and model choices. It previews changes and asks for confirmation before writing. Cancel with `cancel`, Ctrl-C, or EOF. Saved configurations remain outside the skill directory so updates preserve your choices.

Alternatively, use the bootstrap command below. Making the skill discoverable and installing its agent profiles are both required.

### Use the skill

After the host discovers the skill and installed profiles, invoke it with a bounded task, for example:

```text
Use $agent-orchestration to implement this feature. Delegate bounded work to
at least one real subagent, preserve existing behavior, and verify the result.
```

Start a fresh session if the host has not loaded the profiles yet. Confirm the selected models and available tools with a small task before relying on a new setup.
Invoking the skill alone does not start subagents: provide a concrete task. With an explicit invocation and a concrete task, the coordinator must dispatch at least one real child and use its result, even for a small task. The main agent plus one child is sufficient; concurrency is optional. If the host, profiles, or required capabilities prevent delegation, the coordinator reports the exact limitation and unmet requirement while completing feasible authorized work. These are workflow instructions, not a host-enforced scheduler.

## Bootstrap profiles

Run these shortcuts from the repository root. This example previews a Codex user installation, then saves a new configuration if needed, installs profiles, and checks the installed files:

```bash
pnpm run configure:bootstrap --host codex --scope user --config ~/.config/crew/codex.json --preset inherit
pnpm run configure:bootstrap --host codex --scope user --config ~/.config/crew/codex.json --preset inherit --apply

# Optional independent recheck later:
pnpm run configure:check --config ~/.config/crew/codex.json --scope user
```

- Use `claude-code` or `kimi-code` with a separate configuration for those hosts.
- For a project installation, use `--scope project --root /path/to/project` on both `bootstrap` and `check`.
- New configurations default to all seven roles, three active children, and inherited host models. Use `--preset recommended` for the bundled Codex or Kimi choices after checking model access. Kimi aliases require [manual model-pool setup](skills/agent-orchestration/references/hosts/kimi-code.md#recommended-model-pool).
- Existing configurations are reused unchanged; `--preset` only affects creation. For custom models, role subsets, or concurrency, prepare a source JSON using the [configuration contract](skills/agent-orchestration/references/configuration.md#configuration-contract), then bootstrap it.
- Preview creates no files or directories. `--apply` writes only the source configuration and managed profiles. Keep the source outside the skill and managed Agent directories. Bootstrap does not copy the skill itself.
- The JSON result identifies configuration creation/reuse and static check status. `runtime_verified: false` means live host loading and execution still need verification, even after static checks pass.

### Command shortcuts

Run these scripts from the repository root using the pnpm version declared in `package.json`; configuration commands do not require `pnpm install`. Arguments after the script name are forwarded to the CLI; no extra `--` separator is needed with `pnpm run`.

In an installed skill directory, use `node scripts/configure.mjs <command>` instead: for example, `pnpm run configure:bootstrap` becomes `node scripts/configure.mjs bootstrap`. From another working directory, use the absolute path to the installed CLI.

| Command | Purpose |
| --- | --- |
| `pnpm run setup` | Interactive configuration and installation wizard |
| `pnpm run configure --help` | Show CLI commands and options |
| `pnpm run configure:bootstrap` | Preview configuration and profiles; add `--apply` to save, install, and check |
| `pnpm run configure:init` | Create a source configuration; refuses an existing file |
| `pnpm run configure:render` | Display generated profiles without installing them |
| `pnpm run configure:install` | Preview profile changes; add `--apply` to write them |
| `pnpm run configure:check` | Compare installed profiles with the source configuration |

For separate initialization and installation steps, use a new configuration path:

```bash
pnpm run configure:init --host codex --config ~/.config/crew/codex.json --preset inherit
pnpm run configure:render --config ~/.config/crew/codex.json
pnpm run configure:install --config ~/.config/crew/codex.json --scope user
pnpm run configure:install --config ~/.config/crew/codex.json --scope user --apply
pnpm run configure:check --config ~/.config/crew/codex.json --scope user
```

After editing a saved configuration, repeat the render, preview, apply, and check steps. A successful check verifies installed files, not live host loading or execution. See [step-by-step configuration](skills/agent-orchestration/references/configuration.md#step-by-step-commands) for scope and conflict rules.

The repository's direct Node entrypoint is now `node skills/agent-orchestration/scripts/configure.mjs <command>`. The former root-level `scripts/configure.mjs` entrypoint has moved; existing repository `pnpm` shortcut names are unchanged.

Agent Orchestration was previously named Crew. Existing `crew-*` profile and model alias names, state files, and configuration paths are retained for installation compatibility. See [configuration](skills/agent-orchestration/references/configuration.md) for the JSON schema, scopes, conflict handling, and updates.

## Roles and coordination

The available roles are `explorer`, `docs-researcher`, `browser-debugger`, `executor`, `ui-styler`, `implementer`, and `reviewer`. Enable only the roles you need and configure their models independently.

The coordinator assigns bounded work with explicit ownership and acceptance checks, integrates returned results, and keeps unresolved decisions in the main conversation. Coupled implementation stays with one writer. See [SKILL.md](skills/agent-orchestration/SKILL.md) for invocation rules, role selection, and the full workflow.

## Development

The repository separates the installable skill from development tooling:

```text
skills/agent-orchestration/  # Complete installable skill
  SKILL.md                  # Coordination workflow
  scripts/                  # Configuration CLI and runtime modules
  assets/                   # Role definitions, presets, and model data
  references/               # Installation, host adapters, and verification
  agents/openai.yaml        # Skill UI metadata
  LICENSE                   # License included with the skill
tests/                      # Repository tests and legacy fixtures
package.json                # Development tools and repository shortcuts
```

README files, contribution guidelines, the root license, and development configuration stay at the repository root. The skill directory works independently of the checkout and contains no development package or test suite.

Development tooling requires **Node.js 22.22.1+** and the pnpm version declared in `package.json`. Run these commands from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm test
```

Use `pnpm format` to format scripts and tests. Use `pnpm lint-staged` to format staged `.mjs`, JSON, and YAML files with Oxfmt; the lockfile and legacy fixtures are excluded. In a Git checkout, `pnpm prepare` enables the Husky pre-commit hook, which runs `pnpm lint-staged` followed by `pnpm test`.

Tests cover configuration validation, profile generation, bootstrap previews and post-install checks, installation conflicts, idempotency, rollback, wizard cancellation, and compatibility with captured legacy fixtures. Runtime commands are also exercised without development dependencies. See [evaluation](skills/agent-orchestration/references/evaluation.md) for live host acceptance checks and [AGENTS.md](AGENTS.md) for contribution guidelines.

## Reference

- [Configuration and installation](skills/agent-orchestration/references/configuration.md)
- [Coordination workflow](skills/agent-orchestration/SKILL.md)
- [Host acceptance and evaluation](skills/agent-orchestration/references/evaluation.md)
- [Interactive testing](skills/agent-orchestration/references/interactive-testing.md)
- [Role catalog](skills/agent-orchestration/assets/roles.json)
