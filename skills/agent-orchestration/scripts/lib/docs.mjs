import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export class ConfigError extends Error {}

const ROLE_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const WORD = /^[a-z][a-z0-9]*$/;
const KEY = /^[a-z][a-z0-9_]*$/;
const BARE_MODEL = /^[^\s[\]]+$/;

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

export function fields(value, allowed, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConfigError(`${label} must be an object`);
  }
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    throw new ConfigError(`Unknown ${label} fields: ${unknown.sort().join(', ')}`);
  }
}

function stringList(value, label) {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || !item) ||
    new Set(value).size !== value.length
  ) {
    throw new ConfigError(`${label} must be unique non-empty strings`);
  }
}

/**
 * One legality check for a role object against a loaded host.
 * validate() and loadHost() both call this. The kind switch lives here only.
 * @param {object} host
 * @param {{ model?: string, strength?: string }} intent
 */
export function intentError(host, intent) {
  const model = intent.model === undefined ? 'inherit' : intent.model;
  if (typeof model !== 'string' || !model.trim()) {
    throw new ConfigError('model must be a non-empty string');
  }
  if (model === 'inherit') {
    if (intent.strength !== undefined) throw new ConfigError('inherit cannot set strength');
    return;
  }
  if (!BARE_MODEL.test(model) || /[\p{C}\p{Z}]/u.test(model)) {
    throw new ConfigError('model must be a bare id without brackets or whitespace');
  }
  const encode = host.encode;
  if (encode.kind === 'effort_field') {
    if (!encode.strengths.includes(intent.strength)) {
      throw new ConfigError(`strength must be one of ${encode.strengths.join(', ')}`);
    }
    return;
  }
  if (encode.kind === 'model_suffix') {
    const family = encode.families[model];
    if (!family) {
      if (intent.strength !== undefined) {
        throw new ConfigError(`${model} has no thinking parameter in docs/hosts/${host.id}.json`);
      }
      return;
    }
    if (family.wire) {
      if (!family.strengths.includes(intent.strength)) {
        throw new ConfigError(`${model} strength must be one of ${family.strengths.join(', ')}`);
      }
      return;
    }
    if (intent.strength !== undefined) {
      throw new ConfigError(`${model} does not take a thinking strength`);
    }
    return;
  }
  const pool = encode.models[model];
  if (!pool || !Object.hasOwn(pool.aliases, intent.strength ?? '')) {
    throw new ConfigError(
      `${model} with strength ${intent.strength ?? '(omitted)'} has no alias in docs/hosts/${host.id}.json`,
    );
  }
}

/** @returns {Record<string, { id: string, description: string, access: string, needs: string[], delegate_when: string, duty: string }>} */
export function loadRoles(root = SKILL_ROOT) {
  const dir = path.join(root, 'docs/roles');
  const roles = {};
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.md')) continue;
    const id = name.slice(0, -3);
    if (!ROLE_ID.test(id)) throw new ConfigError(`Illegal role id: ${id}`);
    const text = readText(path.join(dir, name));
    if (!text.startsWith('```json\n')) throw new ConfigError(`${id} must start with a json fence`);
    const end = text.indexOf('\n```', 8);
    if (end < 0 || text.slice(end + 4).includes('```')) {
      throw new ConfigError(`${id} must contain exactly one json fence`);
    }
    const header = parseJson(text.slice('```json\n'.length, end));
    fields(header, ['description', 'access', 'needs', 'delegate_when'], id);
    if (
      typeof header.description !== 'string' ||
      !header.description ||
      header.description.includes('\n')
    ) {
      throw new ConfigError(`${id}.description must be a non-empty single line`);
    }
    if (!['read-only', 'workspace-write'].includes(header.access)) {
      throw new ConfigError(`${id}.access must be read-only or workspace-write`);
    }
    if (
      typeof header.delegate_when !== 'string' ||
      !header.delegate_when ||
      header.delegate_when.includes('\n')
    ) {
      throw new ConfigError(`${id}.delegate_when must be a non-empty single line`);
    }
    const needs = header.needs ?? [];
    stringList(needs, `${id}.needs`);
    if (needs.some((token) => !WORD.test(token))) {
      throw new ConfigError(`${id}.needs tokens must be lowercase words`);
    }
    const duty = text.slice(end + 4).trim();
    for (const line of duty.split('\n')) {
      if (
        [
          header.description,
          'Operate read-only.',
          'Access: read-only.',
          'Access: workspace-write.',
        ].includes(line)
      ) {
        throw new ConfigError(`${id} duty repeats a catalog fact`);
      }
    }
    roles[id] = {
      id,
      description: header.description,
      access: header.access,
      needs,
      delegate_when: header.delegate_when,
      duty,
    };
  }
  return roles;
}

export function loadCommon(root = SKILL_ROOT) {
  return readText(path.join(root, 'docs/common.md')).trim();
}

export function hostIds(root = SKILL_ROOT) {
  return fs
    .readdirSync(path.join(root, 'docs/hosts'))
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .sort();
}

function checkEncode(host, encode) {
  if (encode.kind === 'effort_field') {
    fields(encode, ['kind', 'strengths'], `${host} encode`);
    stringList(encode.strengths, `${host} strengths`);
    if (!encode.strengths.length || encode.strengths.some((item) => !WORD.test(item))) {
      throw new ConfigError(`${host} strengths must be lowercase words`);
    }
    return;
  }
  if (encode.kind === 'model_suffix') {
    fields(encode, ['kind', 'families'], `${host} encode`);
    if (
      encode.families === null ||
      typeof encode.families !== 'object' ||
      Array.isArray(encode.families)
    ) {
      throw new ConfigError(`${host} families must be an object`);
    }
    for (const [model, family] of Object.entries(encode.families)) {
      fields(family, ['wire', 'strengths', 'fixed', 'confirmed'], `${host} ${model}`);
      if (family.wire) {
        if (typeof family.wire !== 'string' || !KEY.test(family.wire)) {
          throw new ConfigError(`${host} ${model} wire must be a lowercase word`);
        }
        stringList(family.strengths, `${host} ${model} strengths`);
        if (family.strengths.some((item) => !WORD.test(item))) {
          throw new ConfigError(`${host} ${model} strengths must be lowercase words`);
        }
      } else if (family.strengths !== undefined) {
        throw new ConfigError(`${host} ${model} cannot list strengths without a wire key`);
      }
      if (!family.wire && !family.fixed) {
        throw new ConfigError(`${host} ${model} needs a wire key or fixed parameters`);
      }
      if (family.fixed !== undefined) {
        fields(family.fixed, Object.keys(family.fixed), `${model} fixed`);
        for (const [key, value] of Object.entries(family.fixed)) {
          if (!KEY.test(key) || (typeof value !== 'string' && typeof value !== 'boolean')) {
            throw new ConfigError(
              `${model} fixed entries must be words mapped to strings or booleans`,
            );
          }
        }
      }
    }
    return;
  }
  if (encode.kind === 'pool_alias') {
    fields(encode, ['kind', 'models'], `${host} encode`);
    const aliases = [];
    for (const [model, pool] of Object.entries(encode.models)) {
      fields(
        pool,
        ['api_model', 'max_context_size', 'capabilities', 'support_efforts', 'aliases'],
        `${host} ${model}`,
      );
      if (typeof pool.api_model !== 'string' || !pool.api_model) {
        throw new ConfigError(`${model} api_model must be a non-empty string`);
      }
      if (!Number.isSafeInteger(pool.max_context_size) || pool.max_context_size < 1) {
        throw new ConfigError(`${model} max_context_size must be a positive safe integer`);
      }
      stringList(pool.support_efforts, `${model} support_efforts`);
      stringList(pool.capabilities, `${model} capabilities`);
      fields(pool.aliases, Object.keys(pool.aliases), `${model} aliases`);
      for (const [strength, alias] of Object.entries(pool.aliases)) {
        if (!pool.support_efforts.includes(strength)) {
          throw new ConfigError(`${model} alias ${strength} is not in support_efforts`);
        }
        if (typeof alias !== 'string' || !alias) {
          throw new ConfigError(`${model} alias ${strength} must be a non-empty string`);
        }
        aliases.push(alias);
      }
    }
    if (new Set(aliases).size !== aliases.length)
      throw new ConfigError(`${host} aliases must be unique`);
    return;
  }
  throw new ConfigError(`Unknown encode kind for ${host}`);
}

/** @param {string} host stem, not a path */
export function loadHost(host, root = SKILL_ROOT) {
  if (typeof host !== 'string' || !ROLE_ID.test(host)) throw new ConfigError('Unknown host');
  const file = path.join(root, 'docs/hosts', `${host}.json`);
  if (!fs.existsSync(file)) throw new ConfigError('Unknown host');
  const value = readJson(file);
  fields(
    value,
    [
      'title',
      'checked',
      'official',
      'limits',
      'paths',
      'encode',
      'profile',
      'tools',
      'recommended',
      'setup_instructions',
    ],
    host,
  );
  if (typeof value.title !== 'string' || typeof value.checked !== 'string') {
    throw new ConfigError(`${host} title and checked must be strings`);
  }
  if (!Array.isArray(value.official) || !value.official.length) {
    throw new ConfigError(`${host} official must be a non-empty array`);
  }
  for (const link of value.official) {
    fields(link, ['title', 'url'], `${host} official`);
    if (typeof link.title !== 'string' || typeof link.url !== 'string' || !link.url) {
      throw new ConfigError(`${host} official entries must be strings`);
    }
  }
  stringList(value.limits, `${host} limits`);
  fields(value.paths, ['project_dir', 'user_dir', 'env_home', 'agents', 'skill'], `${host} paths`);
  for (const key of ['project_dir', 'user_dir', 'agents']) {
    if (typeof value.paths[key] !== 'string' || !value.paths[key]) {
      throw new ConfigError(`${host} paths.${key} must be a non-empty string`);
    }
  }
  for (const key of ['env_home', 'skill']) {
    if (typeof value.paths[key] !== 'string' && value.paths[key] !== null) {
      throw new ConfigError(`${host} paths.${key} must be a string or null`);
    }
  }
  fields(
    value.profile,
    [
      'format',
      'model_key',
      'effort_key',
      'body_key',
      'access_key',
      'readonly_key',
      'tools_key',
      'disallowed_tools',
      'subagents',
    ],
    `${host} profile`,
  );
  if (!['toml', 'markdown'].includes(value.profile.format)) {
    throw new ConfigError(`${host} profile format must be toml or markdown`);
  }
  fields(value.tools, ['allowlist', 'needs'], `${host} tools`);
  if (typeof value.tools.allowlist !== 'boolean') {
    throw new ConfigError(`${host} tools.allowlist must be a boolean`);
  }
  fields(value.tools.needs, Object.keys(value.tools.needs), `${host} needs`);
  for (const names of Object.values(value.tools.needs)) stringList(names, `${host} need tools`);
  checkEncode(host, value.encode);
  if (value.encode.kind === 'pool_alias' && value.setup_instructions === undefined) {
    throw new ConfigError(`${host} pool_alias requires setup_instructions`);
  }
  const loaded = { ...value, id: host };
  const roles = loadRoles(root);
  if (value.tools.allowlist) {
    const used = new Set(Object.values(roles).flatMap((role) => role.needs));
    for (const token of used) {
      if (!Object.hasOwn(value.tools.needs, token)) {
        throw new ConfigError(`${host} is missing tools for need ${token}`);
      }
    }
    for (const token of Object.keys(value.tools.needs)) {
      if (!used.has(token)) throw new ConfigError(`${host} lists unused need ${token}`);
    }
  }
  if (value.recommended !== undefined) {
    fields(value.recommended, Object.keys(roles), `${host} recommended`);
    for (const intent of Object.values(value.recommended)) {
      fields(intent, ['model', 'strength'], `${host} recommended role`);
      intentError(loaded, intent);
    }
  }
  if (value.setup_instructions !== undefined)
    stringList(value.setup_instructions, `${host} setup_instructions`);
  return loaded;
}
