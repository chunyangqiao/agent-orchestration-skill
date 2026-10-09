import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  ConfigError,
  defaultConfig,
  expandPath,
  readJson,
  render,
  SKILL_ROOT,
  validate,
} from './config.mjs';
import {
  atomicWrite,
  install,
  installationPlan,
  report,
  stat,
  targetDirectory,
  writeNewConfig,
} from './install.mjs';

// Resolve existing ancestors too, so an absent file beneath a symlink cannot
// bypass the source-config location boundary.
function resolvedPath(file) {
  if (stat(file)) return fs.realpathSync(file);
  return path.join(resolvedPath(path.dirname(file)), path.basename(file));
}

function contains(directory, file) {
  const relative = path.relative(directory, file);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

export function runBootstrap(options, write = atomicWrite) {
  for (const key of ['host', 'scope', 'config']) {
    if (!options[key]) throw new ConfigError(`--${key} is required`);
  }
  if (options.preset !== undefined && !['inherit', 'recommended'].includes(options.preset))
    throw new ConfigError(`Unknown preset: ${options.preset}`);
  const target = targetDirectory(options.host, options.scope, options.root);
  const configPath = expandPath(options.config);
  for (const directory of [SKILL_ROOT, target]) {
    if (
      contains(directory, configPath) ||
      contains(resolvedPath(directory), resolvedPath(configPath))
    )
      throw new ConfigError(
        'Keep the source config outside the skill and managed Agent directories.',
      );
  }
  const info = stat(configPath);
  if (info && !info.isFile()) throw new ConfigError('Source config must be a regular file.');
  const config = info
    ? validate(readJson(configPath))
    : defaultConfig(options.host, options.preset);
  if (config.host !== options.host)
    throw new ConfigError(
      `Existing config is for ${config.host}, but bootstrap selected ${options.host}.`,
    );
  const files = render(config);
  const changes = installationPlan(target, config, files);
  const result = {
    ...report(target, config, changes),
    source_config: {
      path: configPath,
      action: info ? 'reuse' : 'create',
      preset: info ? null : (options.preset ?? 'inherit'),
      note: info
        ? 'Existing configuration reused unchanged; --preset is not applied.'
        : 'New configuration is saved only with --apply.',
    },
    configuration: config,
    static_check: { status: 'not_run' },
  };
  if (result.status === 'conflict') return { result, exitCode: 1 };
  if (!options.apply) return { result, exitCode: 0 };

  let created = false;
  try {
    if (!info) {
      writeNewConfig(configPath, config);
      created = true;
    }
    install(target, config, files, changes, write);
  } catch (error) {
    if (created) {
      try {
        fs.unlinkSync(configPath);
      } catch (cleanupError) {
        throw new ConfigError(
          `${error.message}; source config cleanup failed: ${configPath}: ${cleanupError.message}`,
        );
      }
    }
    throw error;
  }
  result.source_config.action = created ? 'created' : 'reuse';
  result.source_config.note = created ? 'New configuration saved.' : result.source_config.note;
  result.status = 'applied';

  // Check disk state after installation, not the plan that preceded the writes.
  // Verification failures retain the artifacts for diagnosis and recovery.
  try {
    const saved = validate(readJson(configPath));
    const checkedTarget = targetDirectory(config.host, options.scope, options.root);
    const checked = installationPlan(checkedTarget, config, files);
    const current = report(checkedTarget, config, checked);
    const sourceMatches = isDeepStrictEqual(saved, config);
    const passed = sourceMatches && current.status === 'current';
    result.static_check = {
      status: passed ? 'passed' : 'failed',
      source_matches: sourceMatches,
      changes: checked,
    };
    if (!passed) result.status = current.status === 'conflict' ? 'conflict' : 'pending';
    return { result, exitCode: passed ? 0 : 1 };
  } catch (error) {
    result.status = 'error';
    result.static_check = { status: 'failed', error: error.message };
    return { result, exitCode: 2 };
  }
}
