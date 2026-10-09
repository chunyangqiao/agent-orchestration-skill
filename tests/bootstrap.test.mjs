import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runBootstrap } from '../scripts/lib/bootstrap.mjs';
import {
  defaultConfig,
  HOSTS,
  jsonText,
  MANIFEST,
  readJson,
  ROOT,
} from '../scripts/lib/config.mjs';
import { atomicWrite, targetDirectory } from '../scripts/lib/install.mjs';
import { cli, snapshot, temporary } from './helpers.mjs';

function fixture(t, host = 'codex') {
  const root = temporary(t);
  const config = path.join(root, 'choices', 'config.json');
  const options = { host, scope: 'project', root, config };
  const args = ['--host', host, '--scope', 'project', '--root', root, '--config', config];
  return { root, config, options, args, target: targetDirectory(host, 'project', root) };
}

for (const host of HOSTS) {
  test(`${host}: bootstrap previews without writes, applies, checks and repeats without changes`, (t) => {
    const f = fixture(t, host);
    const preview = JSON.parse(cli(f.root, ['bootstrap', ...f.args]).stdout);
    assert.deepEqual(snapshot(f.root), {});
    assert.equal(preview.source_config.action, 'create');
    assert.deepEqual(preview.configuration, defaultConfig(host));
    assert.equal(preview.static_check.status, 'not_run');
    assert.equal(preview.runtime_verified, false);
    const applied = JSON.parse(cli(f.root, ['bootstrap', ...f.args, '--apply']).stdout);
    assert.equal(applied.source_config.action, 'created');
    assert.equal(applied.static_check.status, 'passed');
    assert.equal(applied.runtime_verified, false);
    cli(f.root, ['check', '--config', f.config, '--scope', 'project', '--root', f.root]);
    const before = snapshot(f.root, true);
    const reused = JSON.parse(
      cli(f.root, ['bootstrap', ...f.args, '--preset', 'recommended', '--apply']).stdout,
    );
    assert.equal(reused.source_config.action, 'reuse');
    assert.equal(reused.source_config.preset, null);
    assert.deepEqual(snapshot(f.root, true), before);
  });

  test(`${host}: user scope respects host config directory`, (t) => {
    const f = fixture(t, host);
    const variable = {
      codex: 'CODEX_HOME',
      'claude-code': 'CLAUDE_CONFIG_DIR',
      'kimi-code': 'KIMI_CODE_HOME',
    }[host];
    const home = path.join(f.root, 'host');
    const result = cli(
      f.root,
      ['bootstrap', '--host', host, '--scope', 'user', '--config', f.config, '--apply'],
      0,
      undefined,
      { env: { ...process.env, [variable]: home } },
    );
    assert.equal(JSON.parse(result.stdout).target, path.join(home, 'agents'));
  });
}

test('recommended presets and Kimi manual setup remain visible', (t) => {
  for (const host of ['codex', 'kimi-code']) {
    const f = fixture(t, host);
    const preview = JSON.parse(
      cli(f.root, ['bootstrap', ...f.args, '--preset', 'recommended']).stdout,
    );
    assert.deepEqual(preview.configuration, defaultConfig(host, 'recommended'));
    if (host === 'kimi-code') assert.ok(preview.host_setup.content.includes('[models.'));
    const applied = JSON.parse(
      cli(f.root, ['bootstrap', ...f.args, '--preset', 'recommended', '--apply']).stdout,
    );
    assert.deepEqual(readJson(f.config), defaultConfig(host, 'recommended'));
    assert.deepEqual(applied.host_setup, preview.host_setup);
  }
});

test('custom source, unrelated profiles and host settings survive bootstrap', (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.dirname(f.config), { recursive: true });
  const source = jsonText({
    ...defaultConfig('codex'),
    max_parallel: 1,
    roles: { reviewer: { model: 'custom', effort: 'high' } },
  });
  fs.writeFileSync(f.config, source);
  fs.mkdirSync(f.target, { recursive: true });
  fs.writeFileSync(path.join(f.target, 'other.toml'), 'unrelated');
  fs.writeFileSync(path.join(f.target, '..', 'config.toml'), 'host settings');
  cli(f.root, ['bootstrap', ...f.args, '--preset', 'recommended', '--apply']);
  assert.equal(fs.readFileSync(f.config, 'utf8'), source);
  assert.equal(fs.readFileSync(path.join(f.target, 'other.toml'), 'utf8'), 'unrelated');
  assert.equal(fs.readFileSync(path.join(f.target, '..', 'config.toml'), 'utf8'), 'host settings');
  assert.deepEqual(
    fs.readdirSync(f.target).filter((name) => name.startsWith('crew-')),
    ['crew-reviewer.toml'],
  );
});

test('required and invalid arguments fail without writing', (t) => {
  const f = fixture(t);
  for (const key of ['host', 'scope', 'config', 'root']) {
    const args = f.args.filter(
      (_, i, items) => items[i] !== `--${key}` && items[i - 1] !== `--${key}`,
    );
    cli(f.root, ['bootstrap', ...args, '--apply'], 2);
  }
  for (const extra of [
    ['--preset', 'unknown'],
    ['--host', 'unknown'],
    ['--scope', 'user'],
    ['--scope', 'unknown'],
    ['--host', 'claude-code', '--preset', 'recommended'],
  ]) {
    cli(f.root, ['bootstrap', ...f.args, ...extra, '--apply'], 2);
  }
  assert.deepEqual(snapshot(f.root), {});
});

test('invalid existing source and host mismatch leave all files untouched', (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.dirname(f.config), { recursive: true });
  for (const source of [
    '{',
    jsonText({ ...defaultConfig('codex'), max_parallel: 0 }),
    jsonText(defaultConfig('kimi-code')),
  ]) {
    fs.writeFileSync(f.config, source);
    const before = snapshot(f.root, true);
    cli(f.root, ['bootstrap', ...f.args, '--apply'], 2);
    assert.deepEqual(snapshot(f.root, true), before);
  }
});

test('source config cannot live in skill or managed directory, including symlink aliases', (t) => {
  const f = fixture(t);
  const alias = path.join(f.root, 'skill-link');
  fs.symlinkSync(ROOT, alias, 'dir');
  for (const config of [
    path.join(ROOT, 'bootstrap-test.json'),
    path.join(f.target, 'choices.json'),
    path.join(alias, 'nested', 'choices.json'),
  ]) {
    const before = snapshot(f.root);
    assert.throws(() => runBootstrap({ ...f.options, config, apply: true }), /outside the skill/);
    assert.deepEqual(snapshot(f.root), before);
  }
});

test('profile conflicts prevent saving a new source and preserve local edits', (t) => {
  const f = fixture(t);
  fs.mkdirSync(f.target, { recursive: true });
  fs.writeFileSync(path.join(f.target, 'crew-explorer.toml'), 'local edit');
  const before = snapshot(f.root, true);
  const result = JSON.parse(cli(f.root, ['bootstrap', ...f.args, '--apply'], 1).stdout);
  assert.equal(result.status, 'conflict');
  assert.equal(result.static_check.status, 'not_run');
  assert.deepEqual(snapshot(f.root, true), before);
});

test('write failure rolls back profiles and removes only a newly created source', (t) => {
  for (const existing of [false, true]) {
    const f = fixture(t);
    if (existing) {
      fs.mkdirSync(path.dirname(f.config), { recursive: true });
      fs.writeFileSync(f.config, jsonText(defaultConfig('codex')));
    }
    const before = snapshot(f.root);
    let calls = 0;
    assert.throws(
      () =>
        runBootstrap({ ...f.options, apply: true }, (file, data) => {
          if (++calls === 3) throw new Error('injected write failure');
          atomicWrite(file, data);
        }),
      /injected write failure/,
    );
    assert.deepEqual(snapshot(f.root), before);
  }
});

test('incomplete rollback identifies remaining profiles', (t) => {
  const f = fixture(t);
  runBootstrap({ ...f.options, apply: true });
  const changed = {
    ...defaultConfig('codex'),
    roles: { explorer: { model: 'changed' }, reviewer: { model: 'changed' } },
  };
  fs.writeFileSync(f.config, jsonText(changed));
  let calls = 0;
  assert.throws(
    () =>
      runBootstrap({ ...f.options, apply: true }, (file, data) => {
        if (++calls >= 2) throw new Error('injected persistent failure');
        atomicWrite(file, data);
      }),
    /rollback incomplete:.*\.crew-runtime.json/,
  );
  assert.deepEqual(readJson(f.config), changed);
});

test('post-install profile or source mismatch fails verification and retains artifacts', (t) => {
  for (const corruptSource of [false, true]) {
    const f = fixture(t);
    const { result, exitCode } = runBootstrap({ ...f.options, apply: true }, (file, data) => {
      atomicWrite(file, data);
      if (path.basename(file) === MANIFEST) {
        if (corruptSource)
          fs.writeFileSync(f.config, jsonText({ ...defaultConfig('codex'), max_parallel: 1 }));
        else fs.unlinkSync(path.join(f.target, 'crew-explorer.toml'));
      }
    });
    assert.equal(exitCode, 1);
    assert.equal(result.static_check.status, 'failed');
    assert.notEqual(result.status, 'applied');
    assert.equal(result.runtime_verified, false);
    assert.ok(fs.existsSync(f.config));
    assert.ok(fs.existsSync(path.join(f.target, MANIFEST)));
  }
});

test('post-install read errors produce diagnostics and a filesystem error exit code', (t) => {
  const f = fixture(t);
  const { result, exitCode } = runBootstrap({ ...f.options, apply: true }, (file, data) => {
    atomicWrite(file, data);
    if (path.basename(file) === MANIFEST) fs.unlinkSync(f.config);
  });
  assert.equal(exitCode, 2);
  assert.equal(result.status, 'error');
  assert.equal(result.static_check.status, 'failed');
  assert.match(result.static_check.error, /ENOENT/);
  assert.ok(fs.existsSync(path.join(f.target, MANIFEST)));
});

test('bootstrap runs from an isolated skill copy without development dependencies', (t) => {
  const f = fixture(t);
  const skill = path.join(f.root, 'agent-orchestration');
  for (const dir of ['scripts', 'assets'])
    fs.cpSync(path.join(ROOT, dir), path.join(skill, dir), { recursive: true });
  assert.equal(fs.existsSync(path.join(skill, 'node_modules')), false);
  const script = path.join(skill, 'scripts/configure.mjs');
  const preview = JSON.parse(cli(f.root, ['bootstrap', ...f.args], 0, script).stdout);
  assert.equal(preview.static_check.status, 'not_run');
  const applied = JSON.parse(cli(f.root, ['bootstrap', ...f.args, '--apply'], 0, script).stdout);
  assert.equal(applied.static_check.status, 'passed');
  cli(f.root, ['check', '--config', f.config, '--scope', 'project', '--root', f.root], 0, script);
});
