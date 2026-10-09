# Kimi Code adapter

This adapter targets the Markdown Agent format documented under `kimi-code`. Older `kimi-cli` releases with YAML `agent`/`subagents` definitions use a different format. Confirm installed capabilities before installation; do not feed Markdown profiles to a legacy loader or invent compatibility flags.

| Scope | Agent directory |
| --- | --- |
| Project | `<project>/.kimi-code/agents/` |
| User | `$KIMI_CODE_HOME/agents/`, default `~/.kimi-code/agents/` |

The generator emits Markdown with YAML frontmatter: `name`, `description`, `tools`, and `subagents: []`. Kimi ignores Claude-style model fields in Agent frontmatter, so model choices remain in `.crew-runtime.json` for the main agent to apply at dispatch.

Read that runtime file from the applicable scope (project before user, no merging), confirm `crew-*` profiles are discoverable, and select one using the live Agent tool's `subagent_type`.

- With `model: "inherit"` or no model option, omit the spawn model parameter and accept the host's native subagent default. A secondary default may differ from the main model.
- With an explicit model alias, confirm it is in the host's secondary model pool and that the live tool exposes selection; pass the alias through the spawn `model` parameter. Kimi also supports reserved `primary` where model selection is enabled.
- A forced secondary model may reject explicit selection. Report the mismatch; never silently omit an explicit Agent Orchestration model choice.
- Per-role `effort` is unsupported by this adapter. Configure effort variants as model-pool aliases in the host, then select an alias in Agent Orchestration. Agent Orchestration does not modify the pool.
- Resumed agents retain their model. Start a new agent when the requested role, model, or permissions change.

Use native background completion/resume behavior with at most Agent Orchestration's configured active-child count. The generated child allowlist disables descendant delegation; effective permissions remain inherited from the host. Web tools require a host search/fetch implementation; verify availability before research tasks. Browser tools require separate configuration.

## Native configuration fields

Read `$KIMI_CODE_HOME/config.toml`, default `~/.kimi-code/config.toml`, before choosing aliases. Agent Orchestration's `roles.<id>.model` and the spawn tool's `model` select a host model-pool alias. For example, `kimi-code/k3-256k` is an alias, `k3-256k` is its API model ID, and `K3-256k` is its display name.

| Native field | How Agent Orchestration setup uses it |
| --- | --- |
| Top-level `default_model` | Main-session default alias; keep it separate from the child pool default |
| `[models."<alias>"]` | Registered alias referenced by Agent Orchestration and the child pool |
| `provider` / `model` | Existing provider key / API model ID; variants reuse these routing fields |
| `max_context_size` / `capabilities` | Copy the underlying model's effective metadata into each independent variant |
| `display_name` | UI label; not the value to pass at dispatch |
| `support_efforts` | Supported Thinking levels; every requested default must be in this list |
| `default_effort` / `[models."<alias>".overrides].default_effort` | Model default / persistent variant override |
| `[secondary_model].default_model` | Child default; required when a pool table exists and must be one of its keys |
| `[secondary_model.models]` | Alias-to-description table; each key must reference a registered model |

Provider credentials and service configuration stay in the host. Agent Orchestration generates neither login state nor provider definitions.

### Inspected host configuration

The following non-secret fields were read from the author's `~/.kimi-code/config.toml` on 2026-10-09. They are a local snapshot, not universal defaults or proof of live model access. All four entries reference `managed:kimi-code`.

| Registered alias | API model ID | Context tokens | `default_effort` |
| --- | --- | --- | --- |
| `kimi-code/kimi-for-coding` | `kimi-for-coding` | 1048576 | `max` |
| `kimi-code/kimi-for-coding-highspeed` | `kimi-for-coding-highspeed` | 262144 | Not declared |
| `kimi-code/k3` | `k3` | 1048576 | `high` |
| `kimi-code/k3-256k` | `k3-256k` | 262144 | `high` |

The main default was `kimi-code/k3`, with `[thinking] enabled = true` and `effort = "high"`. No `secondary_model` section or `crew-*` model entries were present, so this snapshot did not enable Agent Orchestration's explicit model selection.

The coding and K3 entries declared `support_efforts = ["low", "high", "max"]` and included `dynamically_loaded_tools`. K3-256k omitted `video_in`. The Highspeed entry declared neither effort field; verify host support before creating effort variants for it. Preserve these model-specific differences when copying metadata.

### Thinking precedence

For a child bound to a pool alias, `[secondary_model].default_effort` wins when set. Otherwise, `[thinking].enabled = false` keeps Thinking off; when enabled, the model's effective `default_effort` wins over global `[thinking].effort`, followed by the middle supported effort. Thus binding the inspected `kimi-code/kimi-for-coding` alias would select `max` despite global `high`, unless a pool-wide or model override changes it.

For the main agent, global `[thinking].effort` takes precedence over the model default. Reserved `primary` inherits the caller's running model and effort. Agent Orchestration's `inherit` omits model selection and accepts native child defaults.

## Reuse existing host aliases

When the existing model defaults meet the task's needs, set Agent Orchestration role models to those aliases and register them in the child pool. For the inspected configuration, this pool fragment reuses two existing entries:

```toml
[secondary_model]
default_model = "kimi-code/kimi-for-coding"

[secondary_model.models]
"kimi-code/kimi-for-coding" = "Routine coding using the model's default effort"
"kimi-code/k3-256k" = "Complex implementation and review within 256K context"
```

Merge into existing tables if present, preserving unrelated pool entries and a valid pool default. For example, `"explorer": {"model": "kimi-code/kimi-for-coding"}` in Agent Orchestration selects the registered alias. It uses the effort precedence above; use the recommended variants below to select low/high per role. Agent Orchestration accepts custom aliases but generates `host_setup` only for aliases defined in its own model catalog.

## Recommended model pool

`init --host kimi-code --preset recommended` uses [presets.json](../../assets/presets.json). Its `crew-*` values are custom aliases defined in [kimi-models.json](../../assets/kimi-models.json): `crew-kimi-coding-low` and `crew-kimi-coding-high` select `kimi-for-coding` at low/high effort; `crew-kimi-k3-high` selects **`k3-256k`**, not the 1M `k3` model. These initial recommendations are not benchmark results.

1. Run `node scripts/configure.mjs render --config <file>` and read `host_setup`. The wizard and installation reports show the same TOML. Agent Orchestration supplies model metadata, `[models."<alias>".overrides].default_effort`, and pool entries; it never writes the host's `config.toml`.
2. Compare each generated entry against the installed model's effective metadata and account limits. Variants are independent entries: retain `support_efforts` and all applicable `capabilities`, including `dynamically_loaded_tools` in the inspected coding/K3 entries. The K3-256k variant must retain its smaller context and omit video support. Keep credentials in the existing `managed:kimi-code` provider.
3. Merge the model entries and pool keys into existing TOML tables. Preserve unrelated models, credentials, pool entries and any valid pool default. Keep Thinking enabled, leave `secondary_model.force` false or absent, and omit `secondary_model.default_effort` so each variant's effort wins. A registered model must also be in the pool before Agent Orchestration can select it.

Complete setup with a fresh-session probe of profile discovery, selected model/effort, tool access and a read-only result. The inspected configuration and generated TOML establish static consistency only. Report missing aliases, unsupported metadata or forced pool selection before dispatch. If the installed version uses the older YAML format, report unsupported version and keep work in the main conversation until the user chooses an upgrade or a separate legacy adapter.

Sources checked 2026-10-09: [Models](https://www.kimi.com/code/docs/kimi-code/models.html), [Agents](https://www.kimi.com/code/docs/kimi-code-cli/customization/agents.html), [secondary model configuration](https://www.kimi.com/code/docs/kimi-code-cli/configuration/config-files.html#secondary_model), [tool interface](https://www.kimi.com/code/docs/kimi-code-cli/reference/tools.html).
