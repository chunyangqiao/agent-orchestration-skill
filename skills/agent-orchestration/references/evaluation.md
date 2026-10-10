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

## Compare useful outcomes

Hold task, baseline artifacts, scope, and acceptance checks constant when changing assignments. Evaluate correctness, evidence quality, useful context isolated, time to a usable result, integration work, rework, and missed risks. Improve boundaries and briefs before attributing failure to a model. A model choice remains a starting configuration until comparable evidence supports it.

Stop after required evidence is collected. Report verified host/version and cases, findings, fixes, and remaining gaps. Avoid duplicating broad checks that already passed.
