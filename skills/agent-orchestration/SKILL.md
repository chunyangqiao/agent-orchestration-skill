---
name: agent-orchestration
description: Install or configure Agent Orchestration, or coordinate substantial tasks with focused subagents across supported agent hosts. Use when parallel independent work, context isolation, or fresh review materially helps; keep small or tightly coupled tasks in the main conversation.
---

# Agent Orchestration

Keep the main agent responsible for user intent, architecture, scope, integration, and final acceptance. Delegate independently finishable work when the benefit repays briefing, waiting, and review.

## Installation requests

For an installation or setup request, follow [AI-driven installation](references/configuration.md#ai-driven-installation) through skill deployment, profile installation, and verification. Collect unresolved choices together, then complete authorized steps without asking again. Copying the skill folder alone is partial installation; report static checks and live host verification separately.

## Select the environment

1. Identify the **host** from its runtime and exposed tools, independently of the model provider. Claude Code running GLM still uses the Claude Code adapter. Model names alone do not identify a host.
2. Read only the matching adapter: [Codex](references/hosts/codex.md), [Claude Code](references/hosts/claude-code.md), or [Kimi Code](references/hosts/kimi-code.md). Use its installed `.crew-runtime.json` and verify the named profiles are available through the live host. Project installation takes precedence over user installation; use one complete Agent Orchestration configuration, without merging scopes.
3. For customization, configuration conflicts, or missing profiles, read [configuration](references/configuration.md). During ordinary task execution, report missing configuration and the next setup step; install only when the user has requested setup. Model authentication remains in the host.
4. If the host cannot create real subagents, a required profile is unavailable, or a model/tool choice cannot be honored, explain the limitation and keep the affected work in the main conversation. Do not describe sequential role-playing as parallel or independent review. A future host needs an explicit adapter and verification before being claimed as supported.

When actually delegating, briefly announce Agent Orchestration in the user's language and state the useful work split. For a simple task, work directly without a ceremonial team launch.
Invoking the skill without a concrete task does not itself start subagents.

## Route by responsibility

The enabled roles come from the user's configuration. Model choice is independent of role; `inherit` uses the host's normal subagent defaults. No model family or reasoning level is a universal role requirement.

| Role / native profile | Delegate when | Role instructions |
| --- | --- | --- |
| `explorer` / `crew-explorer` | Local code, interfaces, or runtime evidence need focused discovery | [Explorer](assets/roles/explorer.md) |
| `docs-researcher` / `crew-docs-researcher` | External or version-sensitive facts need primary sources | [Docs researcher](assets/roles/docs-researcher.md) |
| `browser-debugger` / `crew-browser-debugger` | A UI failure needs reproduction and browser evidence before a fix | [Browser debugger](assets/roles/browser-debugger.md) |
| `executor` / `crew-executor` | A localized change has settled decisions and concrete checks | [Executor](assets/roles/executor.md) |
| `ui-styler` / `crew-ui-styler` | A specified local visual change has a known route and browser checks | [UI styler](assets/roles/ui-styler.md) |
| `implementer` / `crew-implementer` | One cohesive multi-file change has resolved architecture and invariants | [Implementer](assets/roles/implementer.md) |
| `reviewer` / `crew-reviewer` | A concrete residual risk needs fresh independent judgment | [Reviewer](assets/roles/reviewer.md) |

Generated profiles combine the selected role with [shared child instructions](assets/roles/common.md). Disabled roles stay in the main conversation. Roles need not use different models. Resolve ambiguous product, editorial, architecture, permission, and acceptance decisions in the main conversation before delegating implementation.

## Dispatch and coordinate

1. State the intended result, allowed changes, protected behavior, and acceptance checks.
2. Split only independently verifiable work. Assign one writer to each file, shared artifact, browser session, or mutable-system boundary. Coupled changes belong to one writer.
3. Provide a self-contained brief with **Outcome**, **Benefit**, **Sources**, **Scope** (including ownership and external-action authority), **Checks**, **Stop when**, and **Return**. Include applicable workspace instructions the child may not inherit. Pass only the context needed for the assigned work.
4. Select the explicit `crew-*` profile and apply the adapter's model-selection rules. Keep at most `max_parallel` active Agent Orchestration children, excluding the main agent, and obey any lower host limit. This is a coordinator rule; a configuration file alone does not create a scheduler or enforce an OS limit.
5. Keep delegation one level deep: only the main agent dispatches. Prefer fresh context; use a new independent context for review. Reuse an agent for the same workstream only when its role, model, tools, and context remain appropriate.
6. Collect results using the host's completion or wait mechanism. Inspect returned sources, artifacts, changes, and verification evidence before accepting them. Integrate and run the checks required for final acceptance.

For a reviewer, also supply **Unresolved risk**, **Evidence**, **Checks already passed**, and **Do not repeat**. Ask for severity-ordered findings with concrete evidence and a minimal repair direction. Do not supply a desired verdict. Use a fresh reviewer for changed work; reuse the old reviewer only to clarify its report.

## Failures and permissions

- Effective host permissions control operations. A role's read-only intent, tool list, or configured sandbox does not by itself prove filesystem, network, or MCP isolation. Delegation never expands authorization.
- If an agent fails, times out, or is interrupted, inspect shared artifacts and partial results before retrying. Retry a transient failure at most once when no usable result exists; otherwise recover in the main conversation.
- When a review reaches its stopping condition without a verdict, request one usable partial report, then stop that work and recover in the main conversation.
- Never silently change an explicitly selected model or loosen permissions to make a task run. State the mismatch and retain the work in the main conversation until the choice is resolved.
- Stop when relevant acceptance checks support the requested outcome. Independent review is useful for a concrete remaining risk, not a mandatory ceremony after every edit.

## Conditional verification

- Read [evaluation](references/evaluation.md) when testing Agent Orchestration installation, changing role/model routing, or comparing delegation outcomes.
- Read [interactive testing](references/interactive-testing.md) when acceptance depends on a live UI, browser, device, or external interactive state.
