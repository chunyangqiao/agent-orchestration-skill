# Claude Code adapter

Use this adapter for Claude Code with Claude or another backend supported by that host, including GLM configured through Z.ai. The generator emits Markdown with YAML frontmatter: `name`, `description`, `tools`, `disallowedTools: ["Agent"]`, and optional `model` / `effort` overrides. The body contains the shared role instructions.

| Scope | Agent directory |
| --- | --- |
| Project | `<project>/.claude/agents/` |
| User | `$CLAUDE_CONFIG_DIR/agents/`, default `~/.claude/agents/` |

Read the applicable `.crew-runtime.json` (project before user, no merging) and confirm named profiles through the live host. Select the `crew-*` profile with the host's Agent tool. Keep reviewers in new independent contexts; use native resume only for the same workstream and unchanged settings.

Omitted model/effort fields preserve native selection rules. An explicit model is interpreted by Claude Code and its backend. Configure GLM endpoints, authentication, and model aliases in Claude Code itself; Agent Orchestration neither chooses a GLM version nor changes credentials. Web and browser/MCP tools also depend on the backend and installed tools.

Tool lists constrain exposed operations, not OS isolation. Agent Orchestration does not set `bypassPermissions`, install hooks, or change host permission modes. For browser checks, configure registered tool names in the role's `tools` list, retaining the file tools it needs.

After setup, verify native loading in a fresh session if necessary, then run a small read-only probe. Check actual model selection, available tools, and a concrete result. Valid YAML alone does not establish these.

Sources checked 2026-10-08: [Claude Code subagents](https://code.claude.com/docs/en/sub-agents), [settings](https://code.claude.com/docs/en/settings), [Z.ai Claude Code integration](https://docs.z.ai/devpack/tool/claude).
