import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const HOSTS = ['codex', 'claude-code', 'kimi-code'];
export const MANIFEST = '.crew-install.json';
export const RUNTIME = '.crew-runtime.json';
export const EFFORTS = {
  codex: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
  'claude-code': ['low', 'medium', 'high', 'xhigh', 'max'],
};
export class ConfigError extends Error {}

// JSON.parse establishes syntax validity; this scan retains the Python reader's
// duplicate-key and integer-token checks, including escaped property names.
export function parseJson(text) {
  const value = JSON.parse(text);
  const objects = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') objects.push(new Set());
    else if (text[i] === '}') objects.pop();
    else if (text[i] === '"') {
      const start = i++;
      while (text[i] !== '"') {
        if (text[i] === '\\') i++;
        i++;
      }
      const key = JSON.parse(text.slice(start, i + 1));
      let next = i + 1;
      while (/\s/.test(text[next] ?? 'x')) next++;
      if (text[next] !== ':') continue;
      const keys = objects.at(-1);
      if (keys.has(key)) throw new ConfigError(`Duplicate JSON key: ${key}`);
      keys.add(key);
      if (objects.length === 1 && ['schema_version', 'max_parallel'].includes(key)) {
        const token = text.slice(next + 1).match(/^\s*([^\s,}\]]+)/)?.[1];
        if (!/^-?(0|[1-9]\d*)$/.test(token ?? '') || !Number.isSafeInteger(Number(token))) {
          throw new ConfigError(`${key} must be a safe integer`);
        }
      }
    }
  }
  return value;
}

export function readText(file) {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(fs.readFileSync(file));
}
export const readJson = (file) => parseJson(readText(file));
export const jsonText = (value) => JSON.stringify(value, null, 2) + '\n';
export const catalog = () => readJson(path.join(ROOT, 'assets/roles.json'));
export const presets = () => readJson(path.join(ROOT, 'assets/presets.json'));
export const kimiModels = () => readJson(path.join(ROOT, 'assets/kimi-models.json'));
export const expandPath = (value) =>
  path.resolve(
    value === '~'
      ? os.homedir()
      : value.startsWith('~/')
        ? path.join(os.homedir(), value.slice(2))
        : value,
  );

export function fields(value, allowed, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConfigError(`${label} must be an object`);
  }
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length)
    throw new ConfigError(`Unknown ${label} fields: ${unknown.sort().join(', ')}`);
}

export function validate(config) {
  fields(config, ['schema_version', 'host', 'max_parallel', 'roles'], 'configuration');
  if (config.schema_version !== 1) throw new ConfigError('schema_version must be 1');
  const { host, max_parallel: limit, roles } = config;
  if (!HOSTS.includes(host)) throw new ConfigError(`host must be one of ${HOSTS.join(', ')}`);
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new ConfigError('max_parallel must be a positive safe integer');
  const known = catalog();
  fields(roles, Object.keys(known), 'roles');
  for (const [role, options] of Object.entries(roles)) {
    fields(options, ['model', 'effort', 'tools'], role);
    const model = Object.hasOwn(options, 'model') ? options.model : 'inherit';
    if (
      typeof model !== 'string' ||
      !model.trim() ||
      /[\p{C}\p{Z}]/u.test(model.replaceAll(' ', ''))
    ) {
      throw new ConfigError(`${role}.model must be a non-empty single-line printable string`);
    }
    if (Object.hasOwn(options, 'effort')) {
      if (host === 'kimi-code')
        throw new ConfigError(
          'Kimi effort is selected through host model-pool variants; configure a model alias instead',
        );
      if (!EFFORTS[host].includes(options.effort))
        throw new ConfigError(`Unsupported ${host} effort for ${role}`);
    }
    if (Object.hasOwn(options, 'tools')) {
      if (host === 'codex')
        throw new ConfigError(
          'Codex tools allowlists are not supported by this adapter; use host configuration',
        );
      const items = options.tools;
      if (!Array.isArray(items) || items.some((item) => typeof item !== 'string' || !item)) {
        throw new ConfigError(`${role}.tools must be an array of non-empty strings`);
      }
      if (new Set(items).size !== items.length) throw new ConfigError(`Duplicate tools in ${role}`);
      const forbidden = ['Agent', 'AgentSwarm', 'Task'];
      if (known[role].access === 'read-only')
        forbidden.push(
          'Write',
          'Edit',
          'Bash',
          'Shell',
          'PowerShell',
          'WriteFile',
          'StrReplaceFile',
        );
      for (const tool of items) {
        if (
          forbidden.includes(tool) ||
          tool.trim() !== tool ||
          !/^(?:[A-Za-z0-9_-]+|mcp__[A-Za-z0-9_*?-]+)$/.test(tool)
        ) {
          throw new ConfigError(`Unsupported tool for ${role}: ${tool}`);
        }
      }
    }
  }
  return config;
}

export function defaultConfig(host, preset = 'inherit') {
  if (!['inherit', 'recommended'].includes(preset))
    throw new ConfigError(`Unknown preset: ${preset}`);
  const recommended = presets()[host];
  if (preset === 'recommended' && !recommended)
    throw new ConfigError(`No recommended preset for ${host}; use inherit or customize roles`);
  return validate({
    schema_version: 1,
    host,
    max_parallel: 3,
    roles:
      preset === 'recommended'
        ? recommended
        : Object.fromEntries(Object.keys(catalog()).map((role) => [role, { model: 'inherit' }])),
  });
}

function defaultTools(host, role, access) {
  const tools = ['Read', 'Glob', 'Grep'];
  if (access === 'workspace-write') tools.push('Write', 'Edit', 'Bash');
  if (role === 'docs-researcher')
    tools.push('WebSearch', host === 'claude-code' ? 'WebFetch' : 'FetchURL');
  return tools;
}

// Match the legacy JSON flow-array spacing to keep old installations unchanged.
const flow = (value) =>
  Array.isArray(value) ? `[${value.map(flow).join(', ')}]` : JSON.stringify(value);

export function render(config) {
  validate(config);
  const { host } = config;
  const common = readText(path.join(ROOT, 'assets/roles/common.md')).trim();
  const files = {};
  for (const [role, definition] of Object.entries(catalog())) {
    if (!Object.hasOwn(config.roles, role)) continue;
    const options = config.roles[role];
    const name = `crew-${role}`;
    const body = readText(path.join(ROOT, `assets/roles/${role}.md`)).trim();
    const prompt = `${body}\n\n${common}\n`;
    const model = options.model ?? 'inherit';
    const values = { name, description: definition.description };
    if (host === 'codex') {
      values.sandbox_mode = definition.access;
      if (model !== 'inherit') values.model = model;
      if (options.effort !== undefined) values.model_reasoning_effort = options.effort;
      values.developer_instructions = prompt;
      files[`${name}.toml`] = Object.entries(values)
        .map(([key, value]) => `${key} = ${flow(value)}\n`)
        .join('');
    } else {
      values.tools = options.tools ?? defaultTools(host, role, definition.access);
      if (host === 'claude-code') {
        values.disallowedTools = ['Agent'];
        if (model !== 'inherit') values.model = model;
        if (options.effort !== undefined) values.effort = options.effort;
      } else values.subagents = [];
      const header = Object.entries(values)
        .map(([key, value]) => `${key}: ${flow(value)}\n`)
        .join('');
      files[`${name}.md`] = `---\n${header}---\n\n${prompt}`;
    }
  }
  files[RUNTIME] = jsonText(config);
  return files;
}

export function hostSetup(config) {
  if (config.host !== 'kimi-code') return undefined;
  const models = kimiModels();
  const used = new Set(Object.values(config.roles).map((role) => role.model));
  const aliases = Object.keys(models).filter((alias) => used.has(alias));
  if (!aliases.length) return undefined;
  const blocks = aliases.map((alias) => {
    const model = models[alias];
    return `[models.${flow(alias)}]\nprovider = "managed:kimi-code"\nmodel = ${flow(model.model)}\nmax_context_size = ${model.max_context_size}\ncapabilities = ${flow(model.capabilities)}\nsupport_efforts = ["low", "high", "max"]\n\n[models.${flow(alias)}.overrides]\ndefault_effort = ${flow(model.effort)}\n`;
  });
  blocks.push(
    `[secondary_model]\ndefault_model = ${flow(aliases[0])}\n\n[secondary_model.models]\n` +
      aliases
        .map(
          (alias) =>
            `${flow(alias)} = ${flow(`${models[alias].model} / ${models[alias].effort}`)}\n`,
        )
        .join(''),
  );
  return {
    path: path.join(expandPath(process.env.KIMI_CODE_HOME || '~/.kimi-code'), 'config.toml'),
    format: 'toml',
    content: blocks.join('\n'),
    instructions: [
      'Log in to Kimi Code first and confirm your account can use the selected models.',
      'Manually merge these model entries and pool keys into existing tables; do not append duplicate TOML tables or replace unrelated pool entries. Keep an existing valid default_model when merging.',
      'Keep Thinking enabled. secondary_model.force must be false or absent; omit secondary_model.default_effort so each model variant can select its own effort.',
      'Check complete model metadata, capabilities, support_efforts and effective default_effort in your installed Kimi version. Adjust context limits to account availability.',
      'Agent Orchestration does not edit this file or verify host readiness. In a fresh session verify aliases, actual model/effort, tools and results before dispatch.',
    ],
  };
}
