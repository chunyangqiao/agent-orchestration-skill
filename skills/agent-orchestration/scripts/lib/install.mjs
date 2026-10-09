import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  catalog,
  ConfigError,
  expandPath,
  fields,
  HOSTS,
  hostSetup,
  jsonText,
  MANIFEST,
  readJson,
  RUNTIME,
} from './config.mjs';

export const digest = (data) => createHash('sha256').update(data).digest('hex');
export function stat(file) {
  try {
    return fs.lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

export function targetDirectory(host, scope, root) {
  if (!HOSTS.includes(host)) throw new ConfigError('Unknown host');
  if (!['user', 'project'].includes(scope)) throw new ConfigError('scope must be user or project');
  const folders = { codex: '.codex', 'claude-code': '.claude', 'kimi-code': '.kimi-code' };
  let base;
  if (scope === 'project') {
    if (!root)
      throw new ConfigError('--root is required for project scope; select the actual project root');
    base = path.join(expandPath(root), folders[host]);
  } else {
    if (root !== undefined) throw new ConfigError('--root is only valid for project scope');
    const env = {
      codex: 'CODEX_HOME',
      'claude-code': 'CLAUDE_CONFIG_DIR',
      'kimi-code': 'KIMI_CODE_HOME',
    }[host];
    base = expandPath(process.env[env] || `~/${folders[host]}`);
  }
  const target = path.join(base, 'agents');
  if (stat(base)?.isSymbolicLink() || stat(target)?.isSymbolicLink())
    throw new ConfigError(`Refusing symlinked host/agents directory: ${target}`);
  if (stat(target) && !stat(target).isDirectory())
    throw new ConfigError(`Agent target is not a directory: ${target}`);
  return target;
}

export function installationPlan(target, config, files) {
  const manifestPath = path.join(target, MANIFEST);
  if (stat(manifestPath)?.isSymbolicLink())
    throw new ConfigError('Refusing symlinked Agent Orchestration installation manifest');
  let prior = {};
  if (stat(manifestPath)) {
    const manifest = readJson(manifestPath);
    fields(manifest, ['schema_version', 'host', 'files'], 'installation manifest');
    if (manifest.schema_version !== 1 || manifest.host !== config.host)
      throw new ConfigError('Installation manifest version/host mismatch');
    prior = manifest.files;
    const suffix = config.host === 'codex' ? '.toml' : '.md';
    fields(
      prior,
      [...Object.keys(catalog()).map((role) => `crew-${role}${suffix}`), RUNTIME],
      'managed files',
    );
    if (
      Object.values(prior).some(
        (hash) => typeof hash !== 'string' || hash.length !== 64 || !/^[0-9a-f]{64}$/.test(hash),
      )
    )
      throw new ConfigError('Invalid installation file digest');
  }
  const changes = [];
  for (const name of [...new Set([...Object.keys(prior), ...Object.keys(files)])].sort()) {
    const file = path.join(target, name);
    const info = stat(file);
    if (info && !info.isFile()) {
      changes.push({ file: name, action: 'conflict', reason: 'not a regular file' });
      continue;
    }
    const current = info ? fs.readFileSync(file) : undefined;
    const desired = Object.hasOwn(files, name) ? Buffer.from(files[name]) : undefined;
    if (current && (!Object.hasOwn(prior, name) || digest(current) !== prior[name])) {
      changes.push({ file: name, action: 'conflict', reason: 'unmanaged file or local edits' });
    } else if (desired === undefined) {
      if (current !== undefined) changes.push({ file: name, action: 'remove' });
    } else
      changes.push({
        file: name,
        action: current?.equals(desired) ? 'keep' : current === undefined ? 'create' : 'update',
      });
  }
  return changes;
}

export function atomicWrite(file, data) {
  const temporary = path.join(path.dirname(file), `.crew-stage-${randomUUID()}`);
  try {
    fs.writeFileSync(temporary, data, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    if (stat(temporary)) fs.unlinkSync(temporary);
  }
}

export function writeNewConfig(file, config) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, jsonText(config));
  } catch (error) {
    fs.closeSync(fd);
    fs.unlinkSync(file);
    throw error;
  }
  fs.closeSync(fd);
}

export function install(target, config, files, changes, write = atomicWrite) {
  if (changes.some((item) => item.action === 'conflict'))
    throw new ConfigError(
      'Conflicts found; no files were changed. Preserve local edits and resolve the listed files first.',
    );
  fs.mkdirSync(target, { recursive: true });
  const manifest = jsonText({
    schema_version: 1,
    host: config.host,
    files: Object.fromEntries(Object.entries(files).map(([name, body]) => [name, digest(body)])),
  });
  const operations = changes
    .filter((item) => item.action !== 'keep')
    .map((item) => [item.file, files[item.file]]);
  const manifestPath = path.join(target, MANIFEST);
  if (!stat(manifestPath) || !fs.readFileSync(manifestPath).equals(Buffer.from(manifest)))
    operations.push([MANIFEST, manifest]);
  const originals = new Map(
    operations.map(([name]) => [
      name,
      stat(path.join(target, name)) ? fs.readFileSync(path.join(target, name)) : undefined,
    ]),
  );
  const completed = [];
  try {
    for (const [name, body] of operations) {
      const file = path.join(target, name);
      if (body === undefined) fs.unlinkSync(file);
      else write(file, body);
      completed.push(name);
    }
  } catch (error) {
    const failures = [];
    for (const name of completed.reverse()) {
      try {
        const file = path.join(target, name);
        if (originals.get(name) === undefined) fs.unlinkSync(file);
        else write(file, originals.get(name));
      } catch (restoreError) {
        failures.push(`${name}: ${restoreError.message}`);
      }
    }
    if (failures.length)
      throw new ConfigError(
        `${error.message}; rollback incomplete: ${failures.join('; ')}. Inspect the installation and run check.`,
      );
    throw error;
  }
}

export function report(target, config, changes, applied = false) {
  const conflict = changes.some((item) => item.action === 'conflict');
  const current = !conflict && changes.every((item) => item.action === 'keep');
  const host = hostSetup(config);
  return {
    target,
    status: conflict ? 'conflict' : applied ? 'applied' : current ? 'current' : 'pending',
    changes,
    runtime_verified: false,
    note: 'Static profile/config check only. Verify host loading, actual model, tools, and results in a fresh session.',
    ...(host ? { host_setup: host } : {}),
  };
}
