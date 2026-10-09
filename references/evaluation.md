# Evaluate Agent Orchestration

Use this reference for installation acceptance, routing changes, and meaningful model comparisons. Separate static configuration checks, simulated behavior, and live host execution.

## Static and installation checks

From the skill directory:

```bash
pnpm install --frozen-lockfile
pnpm test
```

Exercise each host in a temporary project: initialize a config, render profiles, preview installation, apply it, and run `check`. Verify inherited and explicit models, role subsets, repeat installs, changed local files, removal of disabled managed roles, and preservation of unrelated profiles. Invalid or unsupported configuration must fail explicitly. Run the skill format validator available in the author's environment and check local document links.

The test suite uses Node's built-in runner and the development-only `smol-toml` and `yaml` parsers to validate generated syntax independently. It includes Python v1 output/installation fixtures, upgrades and rollback, duplicate-key detection, numbered setup input/cancellation, recommended presets and Kimi model-pool snippets. An isolated skill copy tests runtime commands without installed dependencies. Keep the captured legacy fixtures as migration evidence; they are not generated from the implementation under test.

These checks prove generation and installation behavior only. Also exercise `setup` in a real terminal, including final confirmation and cancellation. Verify that EOF or cancellation before confirmation leaves configuration and profiles untouched, existing choices remain unchanged, and recommended Kimi setup only displays a manual merge snippet.

Check that every catalog role has one matching source Markdown file (excluding `common.md`) and that each generated filename stem matches its native `name`. For `browser-debugger`, verify read-only defaults and explicit browser tool selection; rendering a profile does not establish browser access.

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
