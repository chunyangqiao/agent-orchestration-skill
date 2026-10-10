# Evaluate Agent Orchestration

Use this reference for installation acceptance, routing changes, and meaningful model comparisons. Separate static configuration checks, simulated behavior, and live host execution.

## Static and installation checks

From the source repository root (which contains the development `package.json` and `tests/`):

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm test
```

The installed skill contains no development package or test suite. Run its CLI with `node scripts/configure.mjs` from the skill directory, or use the CLI's absolute path from another working directory. Repository shortcuts run from the repository root and target `skills/agent-orchestration/scripts/configure.mjs`.

Exercise each host in a temporary project: initialize a config, render profiles, preview installation, apply it, and run `check`. Verify inherited and explicit models, role subsets, repeat installs, changed local files, removal of disabled managed roles, and preservation of unrelated profiles. Invalid or unsupported configuration must fail explicitly. Run the skill format validator available in the author's environment and check local document links.

Also exercise `bootstrap` for each host without a TTY: preview a missing source config without writes, apply, and independently run `check`. Cover existing custom configs, creation-only presets, invalid source locations, conflicts before config creation, installation rollback, and post-install verification failure. Repeat application must preserve unchanged contents and timestamps. Copy the complete skill into a temporary directory without repository files, `package.json`, or `node_modules`, then exercise all three hosts from a different working directory. Verify the CLI through a symlinked skill directory, allow a source config in the temporary checkout's root `.crew/`, and reject configs inside the skill or managed Agent directory, including symlink aliases. Redirect user-scope host directories into temporary paths. A passing `static_check` and `runtime_verified: false` must remain distinct from live acceptance.

For the AI installation workflow, inspect the completion evidence: a discoverable complete skill folder, source configuration and target paths, static check results, and a live probe result or exact blocker/next step. Copying the skill alone must be reported as partial. Reuse established choices and collect remaining choices together; do not require the user to run the terminal wizard after asking an agent to install.

The test suite uses Node's built-in runner and the development-only `smol-toml` and `yaml` parsers to validate generated syntax independently. It includes Python v1 output/installation fixtures, upgrades and rollback, duplicate-key detection, numbered setup input/cancellation, recommended presets and Kimi model-pool snippets. An isolated skill copy tests runtime commands without installed dependencies. Keep the captured legacy fixtures as migration evidence; they are not generated from the implementation under test.

These checks prove generation and installation behavior only. Also exercise `setup` in a real terminal, including final confirmation and cancellation. Verify that EOF or cancellation before confirmation leaves configuration and profiles untouched, existing choices remain unchanged, and recommended Kimi setup only displays a manual merge snippet.

Check that every catalog role has one matching source Markdown file (excluding `common.md`) and that each generated filename stem matches its native `name`. For `browser-debugger`, verify read-only defaults and explicit browser tool selection; rendering a profile does not establish browser access.

## Invocation acceptance

Exercise these cases when changing invocation or routing rules. Inspect actual child creation and returned evidence; a routing explanation or role-play is only simulated evidence.

| Request or condition | Expected behavior |
| --- | --- |
| Explicit invocation with a one-file edit or focused lookup | At least one real enabled `crew-*` child performs bounded work; the main agent uses its result before completion |
| Explicit invocation with tightly coupled implementation | One writer owns the coupled change; at least one real child contributes without artificial parallel edits |
| Implicit adoption for a trivial task | Main-agent execution is allowed |
| Skill invocation without a concrete task in the request or conversation context, or a question about the skill | No child is started solely because the skill was named |
| Explicit invocation carried through related follow-ups | Suitable children or their existing results are reused; each turn need not start a new child |
| Later user instruction to stop delegation | The coordinator follows the updated instruction |
| Explicitly invoked installation with missing profiles | Authorized setup establishes profiles before a real verification child; unavailable live execution is reported as an unmet requirement |
| Unavailable host tools, enabled profiles, or required model; unresolved child execution failure | Exact limitation and unmet delegation requirement are reported; main-agent fallback is not claimed as successful multi-agent execution |
| `max_parallel: 1` or one available child slot | Main agent plus one child satisfies the requirement; multiple concurrent children are not required |

## Live host acceptance

For each claimed host/version, record host version, scope, source config, applied runtime configuration, and actual model/backend. Use an isolated temporary project and bounded tasks:

1. **Discovery:** the host loads the skill and exposes enabled `crew-*` profiles. Disabled roles are not selected by Agent Orchestration.
2. **Read-only probe:** ask an explorer to identify a known fixture value and cite its path. Verify actual model and effective tools/permissions from host evidence; child self-report alone is insufficient.
3. **Independent slices:** assign two disjoint fixtures with a shared acceptance check. Verify ownership and the active-child cap; do not require concurrency when `max_parallel` is one or host capacity is lower.
4. **Review:** give a fresh reviewer one stable artifact and a bounded question. Verify evidence is returned without edits or descendants.
5. **Mismatch:** use an unavailable model or tool in an isolated configuration. Verify the coordinator reports it without switching models, relaxing permissions, or claiming success.
6. **Recovery:** interrupt or fail one bounded child. Check partial artifacts before retry; avoid duplicating completed work.

When accepting `browser-debugger`, use an isolated UI fixture with a known failure and verify actual reproduction steps and browser evidence, unchanged application files, and a clear limitation when browser tools are absent. A profile-discovery probe alone does not establish this behavior.

When a host, account, model, or runtime metadata is unavailable, mark that case unverified with the precise limitation. Successful rendering or simulated routing is not live compatibility evidence.

## Recorded acceptance: Codex, 2026-10-10

Both probes passed in fresh **Codex CLI 0.162.1** sessions against Agent Orchestration **2.1.0**, source commit `c8fef79a279258435fed8340b0c2fab57f970407`. The user-scope installation at `~/.codex/skills/agent-orchestration/` matched all 25 source-bundle files before testing. Static profile checks passed against `~/.config/crew/codex.json` and the applied `~/.codex/agents/.crew-runtime.json`; the configuration enabled seven roles with `max_parallel: 7`.

The sessions used the trusted Crew checkout as their working directory and isolated fixtures in temporary directories. Each dispatched child used `fork_turns: none`, ran one level below the coordinator, and had an observed `read-only` sandbox. Role and model checks used the spawn calls, host `SubAgentActivity` events, and each child's session metadata and `turn_context`; final-answer claims alone were not treated as execution evidence.

| Probe | Request and observed result | Configured and observed role / model / effort |
| --- | --- | --- |
| Single task | Explicitly invoke `$agent-orchestration` to read two random string fields from one JSON fixture, without separately requesting a child. The coordinator dispatched a real child, waited for completion, and included both exact values in its final answer. | `crew-explorer` / `gpt-6-luna` / `high` |
| Parallel task A | Trace three JSON files through relative references to identify the active handler's service and verification token. The child returned the correct values and reference chain; the coordinator incorporated them. | `crew-explorer` / `gpt-6-luna` / `high` |
| Parallel task B | Independently review a stable discount function against an inclusive 6000-cent threshold and an 800-cent discount. The child identified `>` instead of `>=` at line 2 and executed boundary cases: input `6000` returned `6000`, versus the required `5200`. The coordinator included the finding. | `crew-reviewer` / `gpt-6-astra` / `high` |

The parallel prompt explicitly invoked the skill and requested parallel handling of two independent, read-only tasks. It did not prescribe role or model selections. Host lifecycle events recorded the following intervals on 2026-10-10, in **Asia/Shanghai (UTC+08:00)**:

| Child | Started | Completed |
| --- | --- | --- |
| `crew-explorer` (`routing_trace`) | 16:56:43.798 | 16:57:12.001 |
| `crew-reviewer` (`pricing_review`) | 16:56:51.598 | 16:57:05.831 |

The intervals overlapped by **14.233 seconds**, with **two active children**. This establishes concurrent child lifetimes in this run, within the configured limit of seven. Both results were checked against their fixtures; fixture hashes, role configuration, and the clean repository state were unchanged afterward.

### Evidence locators

Persisted JSONL rollouts were inspected under `$CODEX_HOME/sessions/2026/10/10/` on the verification host. Locate each file by its session-ID suffix; these are local evidence references, not repository fixtures.

| Evidence | Session ID | Relevant JSONL lines |
| --- | --- | --- |
| Single-task coordinator | `01a12502-c469-7461-896a-60db0b377f5b` | Spawn: 23; child start/completion: 24, 33 |
| Single-task explorer | `01a12503-07cb-74e3-8035-ff89e3011a6d` | Role: 1; model/effort/sandbox: 8; fixture read: 13; result: 24 |
| Parallel coordinator | `01a12507-05d2-7c50-9d4f-8fd779606b3a` | Spawns: 35, 41; child starts: 37, 43; completions: 57, 67 |
| Parallel explorer | `01a12507-63a8-7831-b3cf-4f9822114e1b` | Role: 1; model/effort/sandbox: 8; result: 52 |
| Parallel reviewer | `01a12507-8219-7fe0-8fae-3f953043e67c` | Role: 1; model/effort/sandbox: 8; boundary execution: 18; result: 27 |

These probes verify successful read-only explicit invocation, result integration, and the observed Explorer/Reviewer model mappings on this CLI version. They do not establish automatic parallel fan-out without a parallel request, concurrency-limit enforcement, other invocation/failure cases, writing tasks, other roles, or live Claude Code/Kimi Code behavior. Raw rollouts and temporary fixtures remain local; this record preserves the observed results without bundling full session logs into the skill.

## Compare useful outcomes

Hold task, baseline artifacts, scope, and acceptance checks constant when changing assignments. Evaluate correctness, evidence quality, useful context isolated, time to a usable result, integration work, rework, and missed risks. Improve boundaries and briefs before attributing failure to a model. A model choice remains a starting configuration until comparable evidence supports it.

Stop after required evidence is collected. Report verified host/version and cases, findings, fixes, and remaining gaps. Avoid duplicating broad checks that already passed.
