# Agent Orchestration

[English](README.md) | **简体中文**

**版本：2.1.0**

面向 Codex、Claude Code 和 Kimi Code 的可移植多智能体编排技能，支持自定义角色和模型。

使用职责明确的子智能体完成代码探索、资料研究、实现、浏览器操作和独立审查。主智能体负责控制任务范围、架构设计、结果集成和最终验收。显式调用并提供具体任务时，必须派发至少一个真实子智能体；隐式采用时，仍按委派收益决定是否派发。

## 功能

- 七种共享角色，为不同宿主生成原生配置。
- 可配置启用的角色、模型、宿主支持的推理强度，以及并发指导参数。
- 支持由 AI 智能体完成安装、非交互式引导命令和交互式终端向导。
- 支持安装预览、冲突检测和可重复更新，保留无关配置及本地修改过的托管文件。

智能体由宿主运行，权限也由宿主管理。本技能提供协调指令和角色配置生成能力；模型认证和工具访问需在宿主中配置。

## 支持的宿主

| 宿主 | 生成的配置格式 | 模型选择方式 |
| --- | --- | --- |
| [Codex](skills/agent-orchestration/references/hosts/codex.md) | TOML | 原生模型和推理强度字段 |
| [Claude Code](skills/agent-orchestration/references/hosts/claude-code.md) | 带 YAML frontmatter 的 Markdown | 原生模型和思考强度字段 |
| [Kimi Code](skills/agent-orchestration/references/hosts/kimi-code.md) | 带 YAML frontmatter 的 Markdown | 派发任务时选择宿主模型池中的别名 |

Kimi 支持以其适配文档描述的 Markdown Agent 格式为目标。模型可用性、浏览器工具、权限及配置发现机制取决于已安装的宿主和后端；完成配置后，请在实际会话中验证。

## 快速开始

### 让 AI 智能体安装

将仓库 URL 或本地检出路径提供给智能体，并发送以下请求：

```text
请从这个仓库为我当前使用的智能体宿主安装 Agent Orchestration。
阅读 skills/agent-orchestration/SKILL.md，并按照
skills/agent-orchestration/references/configuration.md 中的 AI 驱动安装指南操作。
检查已有配置，展示默认角色和并发数，并一次性询问尚未确定的安装范围和模型选择。
然后部署完整技能，预览并应用角色配置，验证安装结果。
分别报告技能部署、配置静态检查和子智能体实际运行验证的结果；
如果实际运行验证受阻，请给出明确的下一步操作。
```

智能体使用非交互式 CLI 完成已授权的安装，不应只复制技能目录就结束，也不应把终端向导交给你完成剩余配置。完整流程见 [AI 驱动安装](skills/agent-orchestration/references/configuration.md#ai-driven-installation)。

配置 CLI 要求 **Node.js 22+**，推荐使用 Node.js 24 LTS。运行命令无需安装依赖或执行构建。

### 手动安装

克隆或下载仓库，然后通过宿主的技能安装机制部署完整的 `skills/agent-orchestration/` 目录。保留目录名 `agent-orchestration`，包含其中的脚本、资源、参考文档、元数据和许可证。然后在已安装的技能目录中运行终端向导：

```bash
node --version
node scripts/configure.mjs setup
```

已安装的技能只需要 Node.js，不包含 `package.json` 或开发依赖。如需从源码仓库配置角色，可在仓库根目录运行 `pnpm run setup` 或 `node skills/agent-orchestration/scripts/configure.mjs setup`。

向导会收集宿主、安装范围、配置路径、角色、并发上限和模型选择，在写入前预览变更并请求确认。输入 `cancel`、按 Ctrl-C 或发送 EOF 均可取消。保存的配置位于技能目录之外，以便更新技能时保留你的选择。

也可以使用下文的引导命令。让宿主发现技能和安装智能体角色配置，这两步都必须完成。

### 使用技能

宿主发现技能和已安装的角色配置后，可以用范围明确的任务调用它，例如：

```text
使用 $agent-orchestration 实现这个功能。将范围明确的工作委派给至少一个
真实子智能体，保留现有行为，并验证结果。
```

如果宿主尚未加载角色配置，请新建会话。在依赖新配置开展工作前，先用一个小任务确认所选模型和可用工具。
仅调用技能不会启动子智能体，还需要提供具体任务。显式调用并提供具体任务后，协调者必须派发至少一个真实子智能体并采用其结果，小型任务也不例外。主智能体加一个子智能体即可满足要求，不强制并行。如果宿主、角色配置或所需能力导致无法派发，协调者应明确报告限制和未满足的要求，同时完成可行且已获授权的工作。这是工作流程指令，并非宿主强制执行的调度器。

## 引导安装角色配置

在仓库根目录运行这些快捷命令。以下示例先预览 Codex 用户级安装，再按需保存新配置、安装角色配置并检查已安装文件：

```bash
pnpm run configure:bootstrap --host codex --scope user --config ~/.config/crew/codex.json --preset inherit
pnpm run configure:bootstrap --host codex --scope user --config ~/.config/crew/codex.json --preset inherit --apply

# 可选：稍后单独复查
pnpm run configure:check --config ~/.config/crew/codex.json --scope user
```

- 其他宿主使用 `claude-code` 或 `kimi-code`，并分别保存独立配置。
- 项目级安装需在 `bootstrap` 和 `check` 命令中同时使用 `--scope project --root /path/to/project`。
- 新配置默认启用全部七种角色，最多同时运行三个子智能体，并继承宿主模型。确认模型访问权限后，可使用 `--preset recommended` 选用内置的 Codex 或 Kimi 模型方案。Kimi 别名需要[手动配置模型池](skills/agent-orchestration/references/hosts/kimi-code.md#recommended-model-pool)。
- 已有配置会原样复用；`--preset` 仅在创建配置时生效。如需自定义模型、角色子集或并发数，请先按照[配置约定](skills/agent-orchestration/references/configuration.md#configuration-contract)准备源 JSON 配置，再执行引导安装。
- 预览不会创建文件或目录。`--apply` 只写入源配置和托管的角色配置。源配置应保存在技能目录及托管 Agent 目录之外。引导命令不会复制技能本身。
- JSON 结果会标明配置是新建还是复用，以及静态检查状态。`runtime_verified: false` 表示仍需验证宿主是否实际加载并执行配置，即使静态检查已经通过。

### 快捷命令

在仓库根目录运行以下脚本，使用 `package.json` 声明的 pnpm 版本；配置命令无需先执行 `pnpm install`。脚本名之后的参数会转发给 CLI；使用 `pnpm run` 时无需额外添加 `--` 分隔符。

在已安装的技能目录中，改用 `node scripts/configure.mjs <command>`：例如，将 `pnpm run configure:bootstrap` 换为 `node scripts/configure.mjs bootstrap`。在其他工作目录中执行时，使用已安装 CLI 的绝对路径。

| 命令 | 用途 |
| --- | --- |
| `pnpm run setup` | 交互式配置和安装向导 |
| `pnpm run configure --help` | 查看 CLI 命令和选项 |
| `pnpm run configure:bootstrap` | 预览配置和角色文件；添加 `--apply` 后保存、安装并检查 |
| `pnpm run configure:init` | 创建源配置；目标文件已存在时拒绝写入 |
| `pnpm run configure:render` | 展示生成的角色配置，不执行安装 |
| `pnpm run configure:install` | 预览角色配置变更；添加 `--apply` 后写入 |
| `pnpm run configure:check` | 对比已安装的角色配置与源配置 |

如需分步初始化和安装，请使用新的配置路径：

```bash
pnpm run configure:init --host codex --config ~/.config/crew/codex.json --preset inherit
pnpm run configure:render --config ~/.config/crew/codex.json
pnpm run configure:install --config ~/.config/crew/codex.json --scope user
pnpm run configure:install --config ~/.config/crew/codex.json --scope user --apply
pnpm run configure:check --config ~/.config/crew/codex.json --scope user
```

编辑已保存的配置后，重新执行生成、预览、应用和检查步骤。检查成功仅验证已安装文件，不代表宿主已实际加载或执行配置。安装范围和冲突规则见[分步配置](skills/agent-orchestration/references/configuration.md#step-by-step-commands)。

仓库中的直接 Node 入口现为 `node skills/agent-orchestration/scripts/configure.mjs <command>`。原根目录下的 `scripts/configure.mjs` 入口已迁移，仓库现有的 `pnpm` 快捷命令名称保持不变。

Agent Orchestration 的旧名称为 Crew。为保持安装兼容性，现有的 `crew-*` 角色配置名、模型别名、状态文件和配置路径继续保留。JSON 格式、安装范围、冲突处理和更新方式见[配置文档](skills/agent-orchestration/references/configuration.md)。

## 角色与协作

可用角色包括 `explorer`、`docs-researcher`、`browser-debugger`、`executor`、`ui-styler`、`implementer` 和 `reviewer`。按需启用角色，并为各角色独立配置模型。

协调者分配范围明确的工作，指定责任归属和验收检查，集成返回结果，并将尚未解决的决策保留在主会话中。紧密耦合的实现交给同一个执行者。调用规则、角色选择和完整工作流程见 [SKILL.md](skills/agent-orchestration/SKILL.md)。

## 开发

仓库将可安装技能与开发工具分开：

```text
skills/agent-orchestration/  # 完整的可安装技能
  SKILL.md                  # 协作工作流程
  scripts/                  # 配置 CLI 和运行时模块
  assets/                   # 角色定义、预设和模型数据
  references/               # 安装、宿主适配和验证文档
  agents/openai.yaml        # 技能 UI 元数据
  LICENSE                   # 随技能分发的许可证
tests/                      # 仓库测试和旧版夹具
package.json                # 开发工具和仓库快捷命令
```

README、贡献指南、根目录许可证和开发配置保留在仓库根目录。技能目录可脱离源码仓库独立运行，不包含开发包配置或测试套件。

开发工具要求 **Node.js 22.22.1+**，并使用 `package.json` 声明的 pnpm 版本。在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm test
```

使用 `pnpm format` 格式化脚本和测试。使用 `pnpm lint-staged` 通过 Oxfmt 格式化暂存的 `.mjs`、JSON 和 YAML 文件，排除锁文件和旧版测试夹具。在 Git 检出目录中，`pnpm prepare` 会启用 Husky 的 pre-commit 钩子，依次执行 `pnpm lint-staged` 和 `pnpm test`。

测试覆盖配置校验、角色配置生成、引导安装预览及安装后检查、安装冲突、幂等性、回滚、向导取消，以及与保存的旧版测试夹具的兼容性。测试也会验证不依赖开发依赖的运行命令。宿主实际运行验收见[评估文档](skills/agent-orchestration/references/evaluation.md)，贡献指南见 [AGENTS.md](AGENTS.md)。

## 参考文档

- [配置与安装](skills/agent-orchestration/references/configuration.md)
- [协作工作流程](skills/agent-orchestration/SKILL.md)
- [宿主验收与评估](skills/agent-orchestration/references/evaluation.md)
- [交互式测试](skills/agent-orchestration/references/interactive-testing.md)
- [角色目录](skills/agent-orchestration/assets/roles.json)
