import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
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
  render,
  validate,
} from './config.mjs';
import {
  install,
  installationPlan,
  report,
  stat,
  targetDirectory,
  writeNewConfig,
} from './install.mjs';

export class SetupCancelled extends Error {
  constructor() {
    super('Setup cancelled');
    this.name = 'SetupCancelled';
  }
}

export function terminalPrompter(input = process.stdin, output = process.stdout) {
  if (!input.isTTY || !output.isTTY)
    throw new ConfigError(
      'setup requires an interactive terminal. Ask choices in your agent conversation, then use init --preset, render, install and check with a config file.',
    );
  const rl = createInterface({ input, output });
  let closed = false;
  rl.on('close', () => {
    closed = true;
  });
  rl.on('SIGINT', () => rl.close());
  return {
    write: (text) => output.write(`${text}\n`),
    close: () => rl.close(),
    async ask(prompt) {
      if (closed) throw new SetupCancelled();
      const controller = new AbortController();
      const abort = () => controller.abort();
      rl.once('close', abort);
      try {
        return await rl.question(prompt, { signal: controller.signal });
      } catch (error) {
        if (controller.signal.aborted) throw new SetupCancelled();
        throw error;
      } finally {
        rl.off('close', abort);
      }
    },
  };
}

function questions(io) {
  async function ask(label, fallback) {
    const value = await io.ask(`${label}${fallback === undefined ? '' : ` [${fallback}]`}: `);
    if (value === undefined || value === null || value.trim().toLowerCase() === 'cancel')
      throw new SetupCancelled();
    return value.trim() || fallback || '';
  }
  async function choice(label, items, fallback = 1) {
    io.write(`\n${label}\n${items.map((item, index) => `  ${index + 1}. ${item}`).join('\n')}`);
    for (;;) {
      const answer = await ask('Choose a number', String(fallback));
      if (/^[1-9]\d*$/.test(answer) && Number(answer) <= items.length) return Number(answer) - 1;
      io.write(`Enter a number from 1 to ${items.length}.`);
    }
  }
  async function roles(label, names, fallback = 'all') {
    io.write(`\n${label}\n${names.map((name, index) => `  ${index + 1}. ${name}`).join('\n')}`);
    for (;;) {
      const value = await ask('Numbers separated by commas, all, or none', fallback);
      if (value === 'all') return [...names];
      if (value === 'none') return [];
      const tokens = value.split(',').map((token) => token.trim());
      if (
        tokens.every((token) => /^[1-9]\d*$/.test(token) && Number(token) <= names.length) &&
        new Set(tokens).size === tokens.length
      ) {
        const selected = new Set(tokens.map((token) => names[Number(token) - 1]));
        return names.filter((name) => selected.has(name));
      }
      io.write('Enter distinct valid role numbers, all, or none.');
    }
  }
  return { ask, choice, roles };
}

export function roleSummary(config) {
  const models = kimiModels();
  return (
    Object.entries(config.roles)
      .map(([role, options]) => {
        const model = options.model ?? 'inherit';
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
          aliases.indexOf(config.roles[role].model) + 1 || 4,
        );
        if (selectedModel < aliases.length) options = { model: aliases[selectedModel] };
        else if (selectedModel === aliases.length) options = { model: 'inherit' };
        else options = { model: await q.ask(`${role} model-pool alias`, config.roles[role].model) };
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

export async function runSetup(options, io) {
  const q = questions(io);
  io.write('Agent Orchestration setup. Type cancel or press Ctrl-C to exit without writing.');
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
  const relative = path.relative(target, configPath);
  if (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
    throw new ConfigError('Keep the source config outside the managed Agent directory.');
  if (!config) {
    const enabled = await q.roles('Enabled roles', Object.keys(catalog()));
    let limit;
    for (;;) {
      const answer = await q.ask('Maximum active children', '3');
      if (/^[1-9]\d*$/.test(answer) && Number.isSafeInteger(Number(answer))) {
        limit = Number(answer);
        break;
      }
      io.write('Enter a positive safe integer.');
    }
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
  const files = render(config);
  const changes = installationPlan(target, config, files);
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
  if (
    (await q.choice('Save configuration and install profiles?', [
      'Cancel without writing',
      'Save and install',
    ])) === 0
  )
    throw new SetupCancelled();
  // Recheck the preview after waiting for user input, before writing anything.
  targetDirectory(config.host, scope, root);
  if (JSON.stringify(changes) !== JSON.stringify(installationPlan(target, config, files)))
    throw new ConfigError('Installation changed since preview. Run setup again.');
  if (original && !fs.readFileSync(configPath).equals(original))
    throw new ConfigError('Source configuration changed since preview. Run setup again.');
  let created = false;
  try {
    if (!original) {
      writeNewConfig(configPath, config);
      created = true;
    }
    install(target, config, files, changes);
  } catch (error) {
    if (created) fs.unlinkSync(configPath);
    throw error;
  }
  io.write(jsonText(report(target, config, changes, true)));
  return 0;
}
