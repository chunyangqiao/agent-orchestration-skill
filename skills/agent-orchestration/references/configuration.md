# Configure Agent Orchestration

Agent Orchestration has one portable workflow, seven shared role definitions, and host-specific profile generation. Installation and configuration require Node.js 22+ (24 LTS recommended), with no third-party runtime packages or build step. The helper configures profiles; the host performs actual agent execution.

In the source repository, the complete skill is `skills/agent-orchestration/`. Deploy that directory as `agent-orchestration`, including `SKILL.md`, scripts, assets, references, skill metadata, and the license. Repository tests and development tooling stay outside the installed skill.

CLI examples in this document run from the installed skill directory, using `node scripts/configure.mjs`. From the source repository root, use `node skills/agent-orchestration/scripts/configure.mjs` or the repository's `pnpm run configure:*` shortcuts. The installed skill has no `package.json` and does not need pnpm.

## AI-driven installation

Use this workflow when the user asks an agent to install or set up Agent Orchestration. A complete installation request includes skill deployment and profile configuration unless the user explicitly limits the request to copying the skill. During an ordinary work request, report missing installation requirements without making unrequested setup changes.

1. **Inspect.** Identify the host from its runtime and tools, read its adapter, and run `node --version`. Node.js 22+ is required; if unavailable, report the prerequisite and [installation source](https://nodejs.org/). Inspect the requested scope's existing source configuration, `.crew-runtime.json`, and profiles before choosing defaults. Project installation takes precedence over user installation as one complete configuration.
2. **Collect choices together.** Reuse choices already supplied by the user. Ask once for unresolved installation scope (user or project) and model strategy (inherit, a supported recommended preset, or custom choices). Include all seven roles and three active children as the proposed defaults; collect any role/concurrency adjustments in the same exchange. Derive the host and actual project root from available evidence. Suggest a source path outside the skill and managed Agent directories: `~/.config/crew/<host>.json` for user scope or `<project>/.crew/<host>.json` for project scope. Preserve existing choices instead of replacing them with defaults. If only an applied runtime configuration remains, use it to recover the user's source configuration rather than selecting a new preset.
3. **Deploy the skill.** Make the complete skill folder discoverable as `agent-orchestration` through the host's skill mechanism. When installing from the source repository, deploy `skills/agent-orchestration/`. Inspect an existing skill installation before updating it; preserve local modifications and respect the requested scope. Copying this folder is only the deployment stage.
4. **Configure and install.** Use the installed skill's absolute CLI path. For preset-based setup, `bootstrap` can create the external source config. For custom choices, prepare a source JSON using the contract below, preserving an existing file unless its changes were requested. Run `bootstrap` without `--apply` and inspect the resolved configuration and file changes, then rerun with `--apply` within the user's installation authorization. Do not ask again for already-authorized routine steps. Inspect the exit code and `static_check`; resolve conflicts explicitly without overwriting local edits. The interactive `setup` wizard is for a human terminal, not this workflow.
5. **Verify and report.** When the live host exposes the installed role selector, run one bounded read-only probe with an enabled role and verify its result and available host metadata using [live host acceptance](evaluation.md#live-host-acceptance). If profiles need a fresh session, the tool cannot select `crew-*`, or model/tool access is unavailable, state the exact blocker and next step. Do not substitute a generic child and claim the configured role was verified. Report **skill deployment**, **static profile checks**, and **live subagent verification** separately; copying alone is partial installation, and static success with a blocked probe means installed files with runtime verification pending.

Model authentication and Kimi model-pool setup remain host tasks. Do not silently change a selected model to make verification pass. A completed setup does not force delegation for every task; invoking the skill alone provides no work to delegate.

## Bootstrap command

Run from the deployed skill directory, or use its absolute CLI path:

```bash
node scripts/configure.mjs bootstrap --host codex --scope user --config ~/.config/crew/codex.json --preset inherit
node scripts/configure.mjs bootstrap --host codex --scope user --config ~/.config/crew/codex.json --preset inherit --apply
```

`--host`, `--scope`, and `--config` are required. Project scope also requires `--root /path/to/project`; user scope rejects `--root`. Without `--apply`, bootstrap renders and plans in memory without creating files or directories. It does not download or deploy the skill.

For new configs, `--preset` defaults to `inherit`; `recommended` is available for Codex and Kimi. Existing configs are validated and reused byte-for-byte, even when a preset is supplied; the report explicitly says the preset was not applied. Host mismatches and invalid configurations fail without writes. Custom roles, models, and concurrency use the source JSON contract, not additional CLI overrides. Source configs must be regular files outside both the skill folder and managed Agent directory, including paths reached through symlinks.

On apply, conflicts prevent saving a new config. Bootstrap uses the existing installer's rollback on write failure and removes only a source config created by that invocation. Incomplete rollback or cleanup names the remaining files. After installation it rereads the source and installed state; a mismatch or read error leaves the artifacts available for diagnosis and returns nonzero. Repeat applications preserve unchanged files and timestamps. Installation remains single-writer and is not crash-atomic.

The JSON output retains the installation report (`target`, `status`, `changes`, `runtime_verified`, and optional `host_setup`) and adds:

| Field | Meaning |
| --- | --- |
| `source_config` | Absolute `path`, `action` (`create` in a preview, `created` after saving, or `reuse`), creation `preset` or `null` for reuse, and an explanatory `note` |
| `configuration` | Resolved host, roles/models, and maximum active children |
| `static_check` | `status`: `not_run`, `passed`, or `failed`; completed comparisons include `source_matches` and post-install `changes`; read/validation failures include `error` |

`runtime_verified` is always `false`: the CLI cannot establish host loading or real execution. Exit codes are `0` for a conflict-free preview or an application with passing static checks, `1` for conflicts or a post-install mismatch, and `2` for invalid input or filesystem errors. A successful apply has `status: applied`; failed verification reports `pending`, `conflict`, or `error` with the static diagnostics. Preview/reuse does not imply a completed post-install check.

## Terminal wizard

For direct terminal use, run the numbered wizard:

```bash
node scripts/configure.mjs setup
```

It asks for host, scope, configuration path, enabled roles, maximum active children, and model choices. All seven roles and three children are the defaults. Codex/Kimi offer accepting the recommendation, adjusting selected roles, customizing every enabled role, or inheriting host defaults. Claude offers inherit/customize. Model IDs can be entered directly; Kimi uses model-pool aliases that also determine effort. The final step previews role choices and file changes before saving and installing. Type `cancel`, press Ctrl-C, send EOF, or decline the final confirmation to exit without writes. Existing config files can be used unchanged or a new path selected; the wizard never overwrites them.

`setup` requires a terminal and fails immediately when one is unavailable. The wizard also accepts `--host`, `--scope`, `--root`, and `--config` to skip established choices. A project setup needs the actual project root, not an arbitrary working subdirectory. Agents use the AI-driven workflow above.

## Step-by-step commands

Use the absolute path to this skill's `scripts/configure.mjs` when outside the skill directory. These examples assume the installed skill directory:

```bash
# Create an editable configuration outside the installed skill.
node scripts/configure.mjs init --host codex --config ~/.config/crew/codex.json

# Alternatively, start from author recommendations (Codex or Kimi only).
# Use a new path: init always refuses an existing file.
node scripts/configure.mjs init --host codex --preset recommended --config ~/.config/crew/codex-recommended.json

# Inspect generated contents without writing profiles.
node scripts/configure.mjs render --config ~/.config/crew/codex.json

# Preview personal installation.
node scripts/configure.mjs install --config ~/.config/crew/codex.json --scope user

# Apply when setup is authorized.
node scripts/configure.mjs install --config ~/.config/crew/codex.json --scope user --apply

# Compare installed contents against the current config and role definitions.
node scripts/configure.mjs check --config ~/.config/crew/codex.json --scope user
```

Use `claude-code` or `kimi-code` with their own configuration files for those hosts. Project setup uses a configuration such as `/path/to/project/.crew/codex.json`, with `--scope project --root /path/to/project` on `install` and `check`. Personal and project configurations are complete alternatives; they are not merged. Keep the configuration outside the skill folder so upgrades preserve user choices. In a source checkout, repository-root `.crew/` is outside `skills/agent-orchestration/` and is an allowed configuration location; files inside the skill or managed Agent directory remain rejected, including through symlink aliases.

`init` refuses an existing file and defaults to `--preset inherit`. `install` previews unless `--apply` is present. Exit codes: `0` successful command/current check or cancelled setup, `1` conflicts or a non-current check, `2` invalid input or filesystem failure. `render` and `check` do not create directories or profiles. A successful static check does not verify host loading, authentication, model availability, or actual execution.

## Author recommendations

[presets.json](../assets/presets.json) is the source of truth for recommended role assignments. Codex uses the author's Team Mode choices captured on 2026-10-09, with `gpt-6.1-sol` / `high` added for browser diagnosis. Agent Orchestration contains its own copy and does not read an installed Team Mode skill. Kimi recommendations use lower effort for bounded exploration/execution and higher effort for evidence analysis, UI work, complex implementation, and review. These are initial choices, not measured performance rankings; verify model access on the selected host.

Presets initialize new configurations only. Updating Agent Orchestration never replaces saved user choices or enables new roles automatically. Claude Code has no author preset: use host inheritance or explicit custom choices. `inherit` remains available on every host.

Kimi preset values such as `crew-kimi-coding-low` are custom host model aliases. [kimi-models.json](../assets/kimi-models.json) maps them to API model IDs and effort variants. For these aliases, `render` adds `host_setup` with `path`, `format`, `content`, and `instructions`. Installation reports and the wizard display the same manual setup information. This TOML snippet is never written into the host configuration. Follow the [Kimi adapter](hosts/kimi-code.md#recommended-model-pool) to register the variants, or [reuse existing host aliases](hosts/kimi-code.md#reuse-existing-host-aliases) when their default efforts meet the task's needs.

## Configuration contract

This is Agent Orchestration's own JSON format, not a native host configuration file. For example:

```json
{
  "schema_version": 1,
  "host": "claude-code",
  "max_parallel": 2,
  "roles": {
    "explorer": {"model": "inherit"},
    "implementer": {"model": "inherit"},
    "reviewer": {"model": "inherit"}
  }
}
```

| Field | Meaning |
| --- | --- |
| `schema_version` | Required integer `1` |
| `host` | `codex`, `claude-code`, or `kimi-code` |
| `max_parallel` | Positive safe integer (at most 9007199254740991); maximum active Agent Orchestration children, excluding the main agent |
| `roles` | Enabled roles keyed by the IDs in the routing table; omit a role to disable it; `{}` disables all |
| `roles.<id>.model` | Optional; `inherit` or omitted leaves native subagent defaults in effect; otherwise a host-recognized model ID or alias |
| `roles.<id>.effort` | Optional Codex/Claude host effort; omitted preserves host behavior; model-specific support needs runtime validation |
| `roles.<id>.tools` | Optional complete Claude/Kimi tool allowlist replacing adapter defaults; an empty list exposes no tools |

Unknown keys, duplicate JSON keys, unknown roles, and unsupported options fail explicitly. `inherit` does **not** promise the same model as the parent: hosts can have separate child defaults. Codex effort inputs are `minimal`, `low`, `medium`, `high`, `xhigh`, `max`; Claude accepts `low`, `medium`, `high`, `xhigh`, `max`. These are adapter inputs, not a promise that every model supports them. Other values require a verified adapter update.

Kimi model choices are dispatch instructions, not fields in Agent Markdown. Configure model-pool aliases in the host first. For effort differences, select a host-configured model variant; Agent Orchestration rejects Kimi's per-role `effort` instead of emitting an ignored field. See the [Kimi adapter](hosts/kimi-code.md).

Provider endpoints, API keys, login, and provider-to-model mappings stay in the host. Agent Orchestration has no credential fields or provider client. GPT, Claude, Kimi, and GLM can be chosen only where the selected host/backend actually supports them. Mixing providers inside one team is host-dependent, not a portable guarantee.

## Tools and permissions

The [role catalog](../assets/roles.json) defines read-only or workspace-write intent. Codex renders that as `sandbox_mode`; Claude/Kimi render narrow tool lists. Explorers/reviewers default to file reading/search; documentation researchers also request web tools; writers also request editing and shell tools. Browser/MCP access is not assumed: configure registered tool names before assigning interactive work.

`browser-debugger` keeps source files unchanged and defaults to read-only access. For Claude/Kimi, its default file tools do not provide a browser: add the host's registered browser/MCP tools to its complete `tools` list. For Codex, configure browser tools on the host. Confirm access to the assigned session and required diagnostics before dispatch. Read-only filesystem intent does not make browser operations read-only; the task must bound test data and permitted interactions.

## Role and file names

The skill was previously named Crew. The `crew-*` profile and model alias names, `.crew-*.json` state files, and default `.crew` / `~/.config/crew` configuration paths retain their existing names for installation compatibility.

Agent Orchestration uses lowercase kebab-case role IDs. The source file is `assets/roles/<role>.md`; generated profiles use the `crew-` prefix to avoid shadowing built-in roles:

| Role ID | Source file | Codex profile and `name` |
| --- | --- | --- |
| `docs-researcher` | `assets/roles/docs-researcher.md` | `crew-docs-researcher.toml`, `crew-docs-researcher` |
| `browser-debugger` | `assets/roles/browser-debugger.md` | `crew-browser-debugger.toml`, `crew-browser-debugger` |

Claude/Kimi use the same native names with `.md` files. The source role Markdown is input to the generator, not a native Codex profile. `common.md` supplies shared instructions and is not a role. Codex naming rules and required TOML fields are described in the [Codex adapter](hosts/codex.md).

Claude/Kimi accept exact tool names and `mcp__...` patterns. Read-only roles reject built-in shell/write tools; all roles reject delegation tools. MCP tools can still mutate external state, and shell access is not restricted to named files by these prompts. Check actual host permissions and task authority. Codex tool allowlists are outside this adapter; configure its host tools separately.

## Installed state and updates

Each install creates only `crew-*` profiles and two JSON files in the selected host's Agent directory:

- `.crew-runtime.json`: the applied configuration read by the main agent for roles, model selection, and concurrency.
- `.crew-install.json`: hashes of files managed by the installer.

Editing the source JSON has no immediate runtime effect. Preview and apply again, run `check`, and verify a fresh host session. Existing configurations keep their enabled role set when Agent Orchestration gains a role; to enable the browser debugger, add `"browser-debugger": {"model": "inherit"}` under `roles` and reapply. The host loads native profiles; the main agent following Agent Orchestration reads the runtime JSON. No host settings are rewritten; concurrency is an Agent Orchestration coordination rule.

Reapplying identical configuration preserves file contents and timestamps. Updates replace only unchanged files recorded in the manifest, and remove only unchanged managed roles that were disabled. Unrelated profiles are preserved. Unmanaged same-name files, modified managed files (including disabled roles), and symlinked targets cause a conflict before profile writes. There is no force-overwrite option. Preserve local edits, move intended choices into the source config or role source, and explicitly resolve the conflicting file before retrying.

Run one installer at a time and avoid concurrent manual profile edits. Ordinary write errors attempt to restore completed writes; installation is not crash-atomic. After interruption, inspect the installation and run `check`. Keep an external backup before updating a valuable existing setup.

## Migrating earlier profiles

The new `crew-*` names do not replace built-in `default`, `explorer`, or `worker`. Earlier installations may still contain `Explorer`, `DocsResearcher`, `Executor`, `UIStyler`, `Implementer`, `Reviewer`, or a custom `default` guard. The helper does not delete those files or other installed skills. After verifying the new profiles, remove only old profiles the user explicitly selects for retirement. A remaining old `default` guard may still affect dispatches outside this skill.

The optional `agents/openai.yaml` describes the skill in OpenAI UI; it is not a working Agent definition. Other hosts use `SKILL.md` and their own profile adapter.
