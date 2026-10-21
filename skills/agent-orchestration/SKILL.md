---
name: agent-orchestration
description: Install or configure Agent Orchestration, or coordinate tasks with focused subagents across supported agent hosts. Explicit invocation with a concrete task requires delegation; implicit use is appropriate when independent work, context isolation, or fresh review materially helps.
---

# Agent Orchestration

Keep the main agent responsible for user intent, architecture, scope, integration, and final acceptance.

## Invocation and required delegation

- **Explicit invocation:** when the user asks to use `$agent-orchestration` or names Agent Orchestration as the workflow for a concrete task, dispatch at least one real subagent through an enabled `crew-*` profile. The main agent plus one child satisfies this requirement. Task size, tight coupling, or low expected delegation benefit does not waive it.
- Give the child a bounded part of the requested work with a usable result. For a small task, delegate one focused lookup, implementation, or verification step; keep coupled implementation with one writer. Parallelize additional children only when their work is independent. A launch announcement, plan, or placeholder assignment does not satisfy the requirement.
- **Implicit use:** delegate when independent execution or a fresh context repays briefing, waiting, and review. Small or tightly coupled tasks may stay in the main conversation.
- **No concrete task:** if neither the request nor established conversation context supplies a task, ask for one without starting children. A question about the skill or a request to edit its files is not itself an instruction to use it as the workflow.

Apply explicit invocation to the task and its follow-ups; reuse suitable children without spawning again merely because a new turn began. A later user instruction to stop delegation takes precedence.

Before reporting completion of an explicitly invoked task, collect the child's result and incorporate its usable work or evidence. If delegation or child execution is blocked, follow the failure rules and explicitly report the unmet delegation requirement and exact limitation; main-agent work alone does not fulfill it.

## Installation requests

For an installation or setup request, deploy the skill and write profiles from the conversation. A complete request includes both, unless the user only asked to copy the skill. During ordinary work, report a missing installation and do not change it.

1. Identify the host from its runtime and tools. Read `docs/hosts/<host>.json` for `official`, `limits`, and `recommended`. Read `encode` only to learn which models take a `strength` and which tokens are legal. Read `docs/roles/<id>.md` for `delegate_when`, `description`, and `access`. Read a role's duty when dispatching, not while choosing models. Require Node.js 22 or newer.
2. Ask once for anything still unresolved: scope, source path, enabled roles, `max_parallel`, and each enabled role's model and thinking strength. Offer all seven roles, three active children, and `inherit` as the default. Offer `recommended` when that host file has it. Reuse choices the user already made.
3. Write a schema 2 source file outside the skill directory and outside the managed agents directory. Use `~/.config/crew/<host>.json` for user scope and `<project>/.crew/<host>.json` for project scope. Each role is `{ "model": "<bare id or inherit>", "strength": "<token>" }`. `inherit` has no `strength`. Do not write brackets, wire keys, alias names, or an `effort` field. On a pool host, `model` is the API id and `strength` selects the alias.
4. Deploy this directory as `agent-orchestration`, including `docs/`, scripts, references, metadata, and the license. From another directory, run the installed `scripts/configure.mjs`.
5. Run `bootstrap` with `--host`, `--scope`, `--config`, and `--root` when the scope is project. Preview without `--apply`, then run it again with `--apply`. Require exit code 0, status `applied`, and `static_check.status` `passed`. One conflict writes nothing. When the result includes `host_setup`, show it and leave the host config file for the person to merge.
6. Run `check` with the same config, scope, and root. Require exit code 0 and status `current`. Then run one live read-only probe with an enabled `crew-*` profile, as described in [evaluation](references/evaluation.md). `runtime_verified` stays false until that probe returns. Report skill deployment, the static check, and the live probe as separate results.

Project scope wins over user scope. Do not merge the two.

## Select the environment

1. Identify the **host** from its runtime and exposed tools, independently of the model provider. Claude Code running GLM still uses the Claude Code host file. Model names alone do not identify a host.
2. Read `docs/hosts/<host>.json` and the installed `.crew-runtime.json`. Confirm the named `crew-*` profiles through the live host. Project installation takes precedence over user installation. Use one complete configuration.
3. For a missing profile, follow Installation requests when the user asked for setup. During ordinary task execution, report the next step and do not install. Model authentication remains in the host.
4. If the host cannot create real subagents, a required profile is unavailable, or a model or tool choice cannot be honored, explain the limitation and keep the affected work in the main conversation. Do not describe sequential role-playing as parallel or independent review. A future host needs a `docs/hosts/<host>.json` file and a live probe before being claimed as supported.

When delegating, briefly announce Agent Orchestration in the user's language and state the child's assignment and the main agent's responsibility.

## Choose a role

The enabled roles are the keys of the source configuration. Read `delegate_when` in `docs/roles/<id>.md` before choosing. Read that role's duty when writing the brief. A role whose `model` is `inherit` keeps the host's normal subagent default. Disabled roles stay in the main conversation. Roles may share a model. Resolve ambiguous product, editorial, architecture, permission, and acceptance decisions in the main conversation before delegating implementation.

## Dispatch and coordinate

1. State the intended result, allowed changes, protected behavior, and acceptance checks.
2. Split only independently verifiable work. Assign one writer to each file, shared artifact, browser session, or mutable-system boundary. Coupled changes belong to one writer.
3. Provide a self-contained brief with **Outcome**, **Benefit**, **Sources**, **Scope** (including ownership and external-action authority), **Checks**, **Stop when**, and **Return**. Include applicable workspace instructions the child may not inherit. Pass only the context needed for the assigned work.
4. Select the explicit `crew-*` profile. Read that role in the installed `.crew-runtime.json` dispatch card. Pass `spawn` as the host model argument when it is a string, and omit the model argument when `spawn` is null. `spawn` null means omit the host model argument. It does not mean the profile pin applies. When `spawn` is null, the task card should match `pinned_model` and `pinned_effort`. When `spawn` is a string, the task card should show that string. Keep at most `max_parallel` active Agent Orchestration children, excluding the main agent, and obey any lower host limit. This is a coordinator rule. A configuration file alone does not create a scheduler or enforce an OS limit.
5. Keep delegation one level deep: only the main agent dispatches. Prefer fresh context; use a new independent context for review. Reuse an agent for the same workstream only when its role, model, tools, and context remain appropriate.
6. Collect results using the host's completion or wait mechanism. Inspect returned sources, artifacts, changes, and verification evidence before accepting them. Integrate and run the checks required for final acceptance.

For a reviewer, also supply **Unresolved risk**, **Evidence**, **Checks already passed**, and **Do not repeat**. Ask for severity-ordered findings with concrete evidence and a minimal repair direction. Do not supply a desired verdict. Use a fresh reviewer for changed work; reuse the old reviewer only to clarify its report.

## Failures and permissions

- Effective host permissions control operations. A role's read-only intent, tool list, or configured sandbox does not by itself prove filesystem, network, or MCP isolation. Delegation never expands authorization.
- If an agent fails, times out, or is interrupted, inspect shared artifacts and partial results before retrying. Retry a transient failure at most once when no usable result exists; otherwise recover in the main conversation.
- When a review reaches its stopping condition without a verdict, request one usable partial report, then stop that work and recover in the main conversation.
- Never silently change an explicitly selected model or loosen permissions to make a task run. State the mismatch and retain the work in the main conversation until the choice is resolved. If the host rejects `spawn`, report that rejection and keep the work in the main conversation. Do not drop the model argument. Do not try a different slug.
- Stop when relevant acceptance checks support the requested outcome. Independent review is useful for a concrete remaining risk, not a mandatory ceremony after every edit.

## Conditional verification

- Read [evaluation](references/evaluation.md) when testing Agent Orchestration installation, changing role/model routing, or comparing delegation outcomes.
- Read [interactive testing](references/interactive-testing.md) when acceptance depends on a live UI, browser, device, or external interactive state.
