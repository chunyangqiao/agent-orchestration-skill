import os from 'node:os';
import path from 'node:path';
import {
  ConfigError,
  fields,
  intentError,
  jsonText,
  loadCommon,
  loadHost,
  loadRoles,
} from './docs.mjs';

export {
  ConfigError,
  fields,
  jsonText,
  parseJson,
  readJson,
  readText,
  SKILL_ROOT,
} from './docs.mjs';

export const MANIFEST = '.crew-install.json';
export const RUNTIME = '.crew-runtime.json';

const BASE_READ = ['Read', 'Glob', 'Grep'];
const BASE_WRITE = ['Write', 'Edit', 'Bash'];
const DENY_ALWAYS = ['Agent', 'AgentSwarm', 'Task'];
const DENY_READ_ONLY = [
  'Write',
  'Edit',
  'Bash',
  'Shell',
  'PowerShell',
  'WriteFile',
  'StrReplaceFile',
];
const TOOL_NAME = /^(?:[A-Za-z0-9_-]+|mcp__[A-Za-z0-9_*?-]+)$/;

export const expandPath = (value) =>
  path.resolve(
    value === '~'
      ? os.homedir()
      : value.startsWith('~/')
        ? path.join(os.homedir(), value.slice(2))
        : value,
  );

function checkTools(role, access, items) {
  if (!Array.isArray(items) || items.some((item) => typeof item !== 'string' || !item)) {
    throw new ConfigError(`${role}.tools must be an array of non-empty strings`);
  }
  if (new Set(items).size !== items.length) throw new ConfigError(`Duplicate tools in ${role}`);
  const forbidden = [...DENY_ALWAYS];
  if (access === 'read-only') forbidden.push(...DENY_READ_ONLY);
  for (const tool of items) {
    if (forbidden.includes(tool) || tool.trim() !== tool || !TOOL_NAME.test(tool)) {
      throw new ConfigError(`Unsupported tool for ${role}: ${tool}`);
    }
  }
}

export function validate(config) {
  fields(config, ['schema_version', 'host', 'max_parallel', 'roles'], 'configuration');
  if (config.schema_version !== 2) throw new ConfigError('schema_version must be 2');
  const host = loadHost(config.host);
  const roles = loadRoles();
  const { max_parallel: limit } = config;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new ConfigError('max_parallel must be a positive safe integer');
  }
  fields(config.roles, Object.keys(roles), 'roles');
  for (const [id, options] of Object.entries(config.roles)) {
    fields(options, ['model', 'strength', 'tools'], id);
    if (Object.hasOwn(options, 'tools')) {
      if (!host.tools.allowlist) {
        throw new ConfigError(
          `${host.title} has no tool allowlist; read-only roles use readonly. See docs/hosts/${host.id}.json`,
        );
      }
      checkTools(id, roles[id].access, options.tools);
    }
    if (!Object.hasOwn(options, 'model')) throw new ConfigError(`${id}.model is required`);
    intentError(host, options);
  }
  return config;
}

export function defaultConfig(host, preset = 'inherit') {
  if (!['inherit', 'recommended'].includes(preset)) {
    throw new ConfigError(`Unknown preset: ${preset}`);
  }
  const loaded = loadHost(host);
  const roles = Object.fromEntries(
    Object.keys(loadRoles()).map((id) => [id, { model: 'inherit' }]),
  );
  if (preset === 'recommended') {
    if (!loaded.recommended) {
      throw new ConfigError(`No recommended preset for ${host}; use inherit or customize roles`);
    }
    for (const [id, intent] of Object.entries(loaded.recommended)) roles[id] = { ...intent };
  }
  return validate({ schema_version: 2, host, max_parallel: 3, roles });
}

function defaultTools(host, role) {
  const tools = [...BASE_READ];
  if (role.access === 'workspace-write') tools.push(...BASE_WRITE);
  for (const token of role.needs) tools.push(...host.tools.needs[token]);
  return tools;
}

// Match the legacy JSON flow-array spacing to keep generated arrays stable.
const flow = (value) =>
  Array.isArray(value) ? `[${value.map(flow).join(', ')}]` : JSON.stringify(value);

function bracket(model, pairs) {
  if (!pairs.length) return model;
  const body = pairs
    .map(([key, value]) => `${key}=${value === true ? 'true' : value === false ? 'false' : value}`)
    .join(',');
  return `${model}[${body}]`;
}

function encode(host, intent) {
  const model = intent.model === undefined ? 'inherit' : intent.model;
  if (model === 'inherit') return { pinned_model: null, pinned_effort: null, spawn: null };
  if (host.encode.kind === 'effort_field') {
    return { pinned_model: model, pinned_effort: intent.strength, spawn: null };
  }
  if (host.encode.kind === 'model_suffix') {
    const family = host.encode.families[model];
    const pairs = [];
    if (family?.wire) pairs.push([family.wire, intent.strength]);
    if (family?.fixed) {
      for (const [key, value] of Object.entries(family.fixed)) pairs.push([key, value]);
    }
    return { pinned_model: bracket(model, pairs), pinned_effort: null, spawn: null };
  }
  return {
    pinned_model: null,
    pinned_effort: null,
    spawn: host.encode.models[model].aliases[intent.strength],
  };
}

function writeProfile(host, role, prompt, emit, tools) {
  const profile = host.profile;
  const values = { name: `crew-${role.id}`, description: role.description };
  if (profile.access_key) values[profile.access_key] = role.access;
  if (profile.tools_key) values[profile.tools_key] = tools;
  // Claude reads disallowedTools. The host file stores the denied names.
  if (profile.disallowed_tools) values.disallowedTools = profile.disallowed_tools;
  if (Object.hasOwn(profile, 'subagents')) values.subagents = profile.subagents;
  if (profile.model_key && emit.pinned_model !== null)
    values[profile.model_key] = emit.pinned_model;
  if (profile.effort_key && emit.pinned_effort !== null) {
    values[profile.effort_key] = emit.pinned_effort;
  }
  if (profile.readonly_key && role.access === 'read-only') values[profile.readonly_key] = true;
  if (profile.format === 'toml') {
    if (profile.body_key) values[profile.body_key] = prompt;
    return Object.entries(values)
      .map(([key, value]) => `${key} = ${flow(value)}\n`)
      .join('');
  }
  const header = Object.entries(values)
    .map(([key, value]) => `${key}: ${flow(value)}\n`)
    .join('');
  return `---\n${header}---\n\n${prompt}`;
}

export function render(config) {
  validate(config);
  const host = loadHost(config.host);
  const roles = loadRoles();
  const common = loadCommon();
  const files = {};
  const card = {
    document: 'dispatch',
    schema_version: 2,
    host: config.host,
    max_parallel: config.max_parallel,
    roles: {},
  };
  const extension = host.profile.format === 'toml' ? '.toml' : '.md';
  for (const [id, intent] of Object.entries(config.roles)) {
    const role = roles[id];
    const emit = encode(host, intent);
    card.roles[id] = emit;
    const prompt = `${role.duty.trim()}\n\nAccess: ${role.access}.\n\n${common.trim()}\n`;
    const tools = host.profile.tools_key ? (intent.tools ?? defaultTools(host, role)) : null;
    files[`crew-${id}${extension}`] = writeProfile(host, role, prompt, emit, tools);
  }
  files[RUNTIME] = jsonText(card);
  return files;
}

export function hostSetup(config) {
  const host = loadHost(config.host);
  if (host.encode.kind !== 'pool_alias') return undefined;
  const seen = new Map();
  for (const intent of Object.values(config.roles)) {
    const emit = encode(host, intent);
    if (!emit.spawn || seen.has(emit.spawn)) continue;
    seen.set(emit.spawn, { pool: host.encode.models[intent.model], strength: intent.strength });
  }
  if (!seen.size) return undefined;
  const aliases = [...seen.keys()];
  const blocks = aliases.map((alias) => {
    const { pool, strength } = seen.get(alias);
    return `[models.${flow(alias)}]\nprovider = "managed:kimi-code"\nmodel = ${flow(pool.api_model)}\nmax_context_size = ${pool.max_context_size}\ncapabilities = ${flow(pool.capabilities)}\nsupport_efforts = ${flow(pool.support_efforts)}\n\n[models.${flow(alias)}.overrides]\ndefault_effort = ${flow(strength)}\n`;
  });
  blocks.push(
    `[secondary_model]\ndefault_model = ${flow(aliases[0])}\n\n[secondary_model.models]\n` +
      aliases
        .map((alias) => {
          const { pool, strength } = seen.get(alias);
          return `${flow(alias)} = ${flow(`${pool.api_model} / ${strength}`)}\n`;
        })
        .join(''),
  );
  const home =
    (host.paths.env_home && process.env[host.paths.env_home]) || `~/${host.paths.user_dir}`;
  return {
    path: path.join(expandPath(home), 'config.toml'),
    format: 'toml',
    content: blocks.join('\n'),
    instructions: host.setup_instructions,
  };
}
