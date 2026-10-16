import fs from 'node:fs';
import path from 'node:path';
import {
  catalog,
  ConfigError,
  defaultConfig,
  EFFORTS,
  expandPath,
  HOSTS,
  hostSetup,
  jsonText,
  kimiModels,
  presets,
  readJson,
  validate,
} from './config.mjs';
import { atomicWrite, stat, targetDirectory } from './install.mjs';
import { runBootstrap, sourceConfigPath } from './bootstrap.mjs';
import { SetupCancelled } from './prompts.mjs';

export function roleSummary(config) {
  const models = kimiModels();
  return (
    Object.entries(config.roles)
      .map(([role, options]) => {
        const model = options.model ?? 'inherit';
        if (config.host === 'cursor') return `${role}: ${model}`;
        const variant =
          config.host === 'kimi-code' && Object.hasOwn(models, model) ? models[model] : undefined;
        return `${role}: ${model} / ${variant ? `${variant.model} / ${variant.effort}` : (options.effort ?? 'host effort')}`;
      })
      .join('\n') || '(all roles disabled)'
  );
}

async function customize(config, selected, q, io) {
  for (const role of selected) {
    for (;;) {
      let options;
      if (config.host === 'kimi-code') {
        const models = kimiModels();
        const aliases = Object.keys(models);
        const selectedModel = await q.choice(
          `${role}: model and effort`,
          [
            ...aliases.map(
              (alias) => `${alias} (${models[alias].model} / ${models[alias].effort})`,
            ),
            'Inherit host model and effort',
            'Enter an existing host model-pool alias',
          ],
          aliases.indexOf(config.roles[role].model) + 1 || aliases.length + 1,
        );
        if (selectedModel < aliases.length) options = { model: aliases[selectedModel] };
        else if (selectedModel === aliases.length) options = { model: 'inherit' };
        else options = { model: await q.ask(`${role} model-pool alias`, config.roles[role].model) };
      } else if (config.host === 'cursor') {
        options = {
          model: await q.ask(
            `${role} model string (or inherit)`,
            config.roles[role].model ?? 'inherit',
          ),
        };
      } else {
        options = {
          model: await q.ask(
            `${role} model ID (or inherit)`,
            config.roles[role].model ?? 'inherit',
          ),
        };
        const efforts = ['inherit', ...EFFORTS[config.host]];
        const index = await q.choice(
          `${role}: effort (model support must be verified)`,
          efforts,
          Math.max(0, efforts.indexOf(config.roles[role].effort ?? 'inherit')) + 1,
        );
        if (index) options.effort = efforts[index];
      }
      try {
        validate({ ...config, roles: { [role]: options } });
        config.roles[role] = options;
        break;
      } catch (error) {
        if (!(error instanceof ConfigError)) throw error;
        io.write(error.message);
      }
    }
  }
}

export async function runSetup(options, io, write = atomicWrite) {
  const q = io;
  io.write(
    'Agent Orchestration setup. Use arrow keys, Space to select roles, and Enter to continue.\nPress Esc, Ctrl-C or Ctrl-D to cancel before saving.',
  );
  const host = options.host ?? HOSTS[await q.choice('Host', HOSTS)];
  const scope =
    options.scope ??
    ['user', 'project'][await q.choice('Installation scope', ['Current user', 'Current project'])];
  const root =
    scope === 'project'
      ? (options.root ?? (await q.ask('Actual project root', process.cwd())))
      : options.root;
  const target = targetDirectory(host, scope, root);
  const suggested =
    scope === 'project'
      ? path.join(expandPath(root), '.crew', `${host}.json`)
      : expandPath(`~/.config/crew/${host}.json`);
  let configPath = expandPath(options.config ?? (await q.ask('Configuration path', suggested)));
  let config;
  let original;
  for (;;) {
    sourceConfigPath(configPath, target);
    if (!stat(configPath)) break;
    if (
      (await q.choice(`Configuration already exists: ${configPath}`, [
        'Use existing configuration unchanged',
        'Choose a new path',
      ])) === 1
    ) {
      configPath = expandPath(await q.ask('New configuration path', configPath));
      continue;
    }
    original = fs.readFileSync(configPath);
    config = validate(readJson(configPath));
    if (config.host !== host)
      throw new ConfigError(
        `Existing config is for ${config.host}, but setup selected ${host}. Select the matching host or a new config path.`,
      );
    break;
  }
  if (!config) {
    const enabled = await q.roles('Enabled roles', Object.keys(catalog()));
    const limit = Number(
      await q.ask(
        'Maximum active children',
        '3',
        (value) =>
          (/^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))) ||
          'Enter a positive safe integer.',
      ),
    );
    const hasRecommended = Object.hasOwn(presets(), host);
    const modes = hasRecommended
      ? [
          'Accept recommended configuration',
          'Adjust recommended configuration',
          'Customize every enabled role',
          'Inherit host defaults',
        ]
      : ['Inherit host defaults', 'Customize every enabled role'];
    const mode = await q.choice('Model configuration', modes);
    config = defaultConfig(host, hasRecommended && mode < 2 ? 'recommended' : 'inherit');
    config.roles = Object.fromEntries(enabled.map((role) => [role, config.roles[role]]));
    config.max_parallel = limit;
    if (hasRecommended && mode === 1) {
      io.write(roleSummary(config));
      const selected = enabled.length ? await q.roles('Roles to adjust', enabled, 'none') : [];
      await customize(config, selected, q, io);
    } else if (hasRecommended ? mode === 2 : mode === 1) await customize(config, enabled, q, io);
  }
  const bootstrapOptions = { host, scope, root, config: configPath };
  const unsaved = original ? undefined : config;
  const preview = runBootstrap(bootstrapOptions, write, unsaved);
  const changes = preview.result.changes;
  io.write(
    `\nConfiguration: ${configPath}\nTarget: ${target}\nMaximum active children: ${config.max_parallel}\n${roleSummary(config)}`,
  );
  const hostInstructions = hostSetup(config);
  if (hostInstructions)
    io.write(
      `\nManual host setup: ${hostInstructions.path}\n${hostInstructions.content}\n${hostInstructions.instructions.join('\n')}`,
    );
  io.write(
    `\nFile changes:\n${changes.map((item) => `${item.action}: ${item.file}${item.reason ? ` (${item.reason})` : ''}`).join('\n')}`,
  );
  if (changes.some((item) => item.action === 'conflict')) {
    io.write('Conflicts found. No configuration or profile files were written.');
    return 1;
  }
  if (!(await q.confirm('Save configuration, install profiles and verify?')))
    throw new SetupCancelled();
  // Recheck the preview after waiting for user input, before writing anything.
  if (original && !fs.readFileSync(configPath).equals(original))
    throw new ConfigError('Source configuration changed since preview. Run setup again.');
  const refreshed = runBootstrap(bootstrapOptions, write, unsaved);
  if (JSON.stringify(changes) !== JSON.stringify(refreshed.result.changes))
    throw new ConfigError('Installation changed since preview. Run setup again.');
  const { result, exitCode } = runBootstrap({ ...bootstrapOptions, apply: true }, write, unsaved);
  io.write(jsonText(result));
  if (exitCode === 0)
    io.write(
      Object.keys(config.roles).length
        ? 'Static checks passed. Live host verification is pending: ask your agent to load the installed crew-* profile and run a bounded read-only probe; start a fresh session if needed.'
        : 'Static checks passed. All roles are disabled; no live role probe can run with this configuration.',
    );
  return exitCode;
}
