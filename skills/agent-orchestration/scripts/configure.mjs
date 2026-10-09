#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';

export function assertNodeVersion(version = process.versions.node) {
  if (!/^\d+\.\d+\.\d+/.test(version) || Number(version.split('.')[0]) < 22) {
    throw new Error(
      `Agent Orchestration requires Node.js 22 or newer (found ${version}). Install Node.js 24 LTS from https://nodejs.org/ and retry.`,
    );
  }
}

const HELP = `Agent Orchestration profile configuration — Node.js 22+, no runtime dependencies.

Examples below run from the installed skill directory.
From the repository root, use pnpm run configure <command> or
node skills/agent-orchestration/scripts/configure.mjs <command>.
From another directory, use the absolute path to scripts/configure.mjs.

  node scripts/configure.mjs setup [--host HOST] [--scope user|project] [--root PATH] [--config FILE]
  node scripts/configure.mjs bootstrap --host HOST --scope user|project --config FILE [--root PATH] [--preset inherit|recommended] [--apply]
  node scripts/configure.mjs init --host HOST --config FILE [--preset inherit|recommended]
  node scripts/configure.mjs render --config FILE
  node scripts/configure.mjs install --config FILE --scope user|project [--root PATH] [--apply]
  node scripts/configure.mjs check --config FILE --scope user|project [--root PATH]

Hosts: codex, claude-code, kimi-code. Project scope requires --root.
init refuses existing files; inherit is the default preset. No Claude recommended preset.
setup uses a numbered terminal wizard; agents should collect choices in conversation.
install previews by default; --apply writes profiles. Kimi model-pool setup stays manual.
bootstrap previews without writes; --apply saves new config, installs and checks profiles.
Existing bootstrap configs are reused unchanged; preset applies only to new configs.
Static checks do not verify live host loading or subagent execution.
Exit codes: 0 success/cancel, 1 conflict or non-current check, 2 invalid input/filesystem error.
`;

export async function main(argv = process.argv.slice(2)) {
  let io;
  try {
    assertNodeVersion();
    const {
      ConfigError,
      defaultConfig,
      expandPath,
      HOSTS,
      hostSetup,
      jsonText,
      readJson,
      render,
      validate,
    } = await import('./lib/config.mjs');
    const { install, installationPlan, report, targetDirectory, writeNewConfig } =
      await import('./lib/install.mjs');
    const parsed = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: true,
      options: {
        host: { type: 'string' },
        config: { type: 'string' },
        scope: { type: 'string' },
        root: { type: 'string' },
        preset: { type: 'string' },
        apply: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
    const options = parsed.values;
    if (options.help) {
      process.stdout.write(HELP);
      return 0;
    }
    const [command] = parsed.positionals;
    const allowed = {
      bootstrap: ['host', 'config', 'scope', 'root', 'preset', 'apply'],
      init: ['host', 'config', 'preset'],
      render: ['config'],
      install: ['config', 'scope', 'root', 'apply'],
      check: ['config', 'scope', 'root'],
      setup: ['host', 'config', 'scope', 'root'],
    };
    if (!Object.hasOwn(allowed, command ?? '') || parsed.positionals.length !== 1)
      throw new ConfigError(
        'Expected one command: init, render, install, check, setup or bootstrap. Use --help.',
      );
    for (const key of Object.keys(options)) {
      if (!allowed[command].includes(key))
        throw new ConfigError(`--${key} is not valid for ${command}`);
    }
    if (options.host !== undefined && !HOSTS.includes(options.host))
      throw new ConfigError(`--host must be one of ${HOSTS.join(', ')}`);
    if (options.scope !== undefined && !['user', 'project'].includes(options.scope))
      throw new ConfigError('--scope must be user or project');
    if (command === 'setup') {
      const { runSetup, terminalPrompter } = await import('./lib/setup.mjs');
      io = terminalPrompter();
      return await runSetup(options, io);
    }
    if (!options.config) throw new ConfigError('--config is required');
    if (command === 'bootstrap') {
      const { runBootstrap } = await import('./lib/bootstrap.mjs');
      const { result, exitCode } = runBootstrap(options);
      process.stdout.write(jsonText(result));
      return exitCode;
    }
    const configPath = expandPath(options.config);
    if (command === 'init') {
      if (!options.host) throw new ConfigError('--host is required');
      writeNewConfig(configPath, defaultConfig(options.host, options.preset));
      process.stdout.write(
        `Created ${configPath}. Edit it, then preview with install (without --apply).\n`,
      );
      return 0;
    }
    const config = validate(readJson(configPath));
    const files = render(config);
    if (command === 'render') {
      const host = hostSetup(config);
      process.stdout.write(
        jsonText({ host: config.host, files, ...(host ? { host_setup: host } : {}) }),
      );
      return 0;
    }
    const target = targetDirectory(config.host, options.scope, options.root);
    const changes = installationPlan(target, config, files);
    const conflict = changes.some((item) => item.action === 'conflict');
    const applied = command === 'install' && options.apply && !conflict;
    if (applied) install(target, config, files, changes);
    const result = report(target, config, changes, applied);
    process.stdout.write(jsonText(result));
    return conflict || (command === 'check' && result.status !== 'current') ? 1 : 0;
  } catch (error) {
    if (error.name === 'SetupCancelled') {
      process.stdout.write('Cancelled. No files were written.\n');
      return 0;
    }
    process.stderr.write(`agent-orchestration: ${error.message}\n`);
    return 2;
  } finally {
    io?.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href)
  process.exitCode = await main();
