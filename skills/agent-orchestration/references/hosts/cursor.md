# Cursor adapter

Use this adapter for Cursor in the editor, CLI, and Cloud Agents. The generator emits Markdown with YAML frontmatter: `name`, `description`, an optional `model`, and `readonly: true` for read-only roles. The body contains the shared role instructions. Omitted fields keep Cursor defaults: the model is inherited, writing is allowed, and the child runs in the foreground.

| Scope | Agent directory | Skill directory |
| --- | --- | --- |
| Project | `<project>/.cursor/agents/` | `<project>/.cursor/skills/agent-orchestration/` |
| User | `~/.cursor/agents/` | `~/.cursor/skills/agent-orchestration/` |

Install the skill as `agent-orchestration` in the skill directory above. Cursor reserves `~/.cursor/skills-cursor/` for built-in skills.

Cursor also loads `.claude/agents/` and `.codex/agents/`. Agent Orchestration writes only `.cursor/agents/`. On a name conflict, `.cursor/` wins. Leave Claude and Codex profiles in their own directories.

Read `.crew-runtime.json` from the applicable agents directory and verify the named `crew-*` profiles through the live Task tool. Project installation takes precedence over user installation; use one complete configuration, without merging scopes. Cursor does not document a config-home variable. User scope is `~/.cursor`.

## Model strings

Cursor has no separate effort field and no tool allowlist. Put speed and reasoning in the `model` string. `inherit`, or an omitted model, keeps Cursor's subagent default. Bracket parameters are `id=value` pairs separated by commas.

Parameter names differ by model. Grok 4.7 uses `reasoning_effort`. Grok 4.5 and Grok 4.6 use `effort`. Composer 2.5 uses `fast`. A Grok 4.7 string written with `effort` does not pin Grok 4.7.

`init --host cursor --preset recommended` stores the author pins in [presets.json](../../assets/presets.json). Those pins are a starting assignment, not a measured ranking. To raise `implementer` for a multi-hour slice, set its model to `grok-4.7[reasoning_effort=xhigh]` in the source configuration and install again. Leave the Task `model` argument unset so the profile pin is used. Inline slugs do not accept brackets and can change the speed tier.

Plus and the legacy Start plan (India only) fix Grok at medium effort and standard speed, with Grok 4.7 on the 256k window. Compare the task card's model with the profile. When they differ, report the mismatch and keep the affected work in the main conversation.

## Dispatch

Select Task `subagent_type` `crew-<role>` and omit `model`. Keep the child in the foreground and wait for its result. Start a fresh invocation for a reviewer of changed work. Resume only the same workstream when its role, model, and context remain appropriate.

Cursor can let a direct subagent launch one further level. The child instructions require a direct return to the parent. Cursor exposes no tool denylist, so that instruction is the boundary. A grandchild is outside Agent Orchestration.

Read-only roles set `readonly: true`, which withholds file edits and state-changing shell commands. Writers omit it. Subagents inherit the parent's tools, including browser and MCP tools. When `readonly` blocks a browser action the role was assigned, report that gap and leave the role read-only.

After setup, start a fresh session if the `crew-*` profiles are not visible. Probe one installed read-only profile and compare the selected role, task-card model, and returned evidence with the configuration. Valid YAML does not establish loading or the effective model.

Sources checked 2026-10-17: [Cursor subagents](https://cursor.com/docs/subagents), [Grok 4.7](https://cursor.com/docs/models/grok-4-7), [Grok 4.6](https://cursor.com/docs/models/grok-4-6), [Grok 4.5](https://cursor.com/docs/models/grok-4-5), [Composer 2.5](https://cursor.com/docs/models/cursor-composer-2-5). Cursor staff confirmed on 2026-10-01 that Grok 4.7's parameter name is `reasoning_effort`. The public Claude example uses `effort`, which is the Grok 4.5 and Grok 4.6 key. Public schemas can evolve; adapt to the installed host instead of inventing flags.
