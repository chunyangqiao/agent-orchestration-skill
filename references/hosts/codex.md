# Codex adapter

Use this adapter for Codex independently of its provider. The generator emits standalone TOML profiles with `name`, `description`, `developer_instructions`, and the role's `sandbox_mode`. Explicit model/effort choices become `model` / `model_reasoning_effort`; inherited values are omitted.

Codex identifies custom agents by `name`; matching the filename stem is a convention, not a requirement. The official examples pair `pr-explorer.toml` with `name = "pr_explorer"`, so they do not mandate underscores or hyphens. Agent Orchestration consistently uses `crew-<role>.toml` with `name = "crew-<role>"`. Each file represents one agent; `name`, `description`, and `developer_instructions` are required.

| Scope | Agent directory |
| --- | --- |
| Project | `<project>/.codex/agents/` |
| User | `$CODEX_HOME/agents/`, default `~/.codex/agents/` |

Read `.crew-runtime.json` from the applicable directory and verify the named `crew-*` profiles in the active agent tool surface. If project and user installations coexist, use the project configuration as a whole. A project profile can shadow a user profile; verify the effective role rather than relying on filenames.

Select the explicit profile through the host's agent-type selector. Use fresh context for reviewers; where the exposed spawn tool supports `fork_turns`, choose `none`. Use exposed wait/resume/interrupt operations rather than assuming all clients have identical tool names. Model/effort in a custom profile takes precedence over spawn overrides, so a different model requires an updated profile or separate verified session.

The helper leaves `config.toml`, authentication, provider configuration, MCP tools, and native concurrency settings unchanged. Enforce Agent Orchestration's `max_parallel` while respecting lower live host limits. Configured sandbox intent is not proof of the effective child boundary; check runtime evidence if isolation matters.

After setup, start a fresh task if profiles are not visible. Confirm the project is trusted before a project-scope probe: a fresh temporary directory can have its entire project configuration layer disabled, even when its profiles parse correctly. Inspect the effective configuration layer's disabled reason before treating an unavailable role as a filename or TOML error. Probe an installed profile on a small read-only assignment and verify selected role, actual model, effective tools/permissions, and returned evidence. If the profile or model is unavailable, keep work in the main conversation and report the mismatch.

Source checked 2026-10-08: [OpenAI Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents#custom-agents). Public schemas can evolve; adapt to the installed host instead of inventing flags.
