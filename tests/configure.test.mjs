import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parse as toml } from 'smol-toml';
import { parse as yaml } from 'yaml';
import { assertNodeVersion } from '../scripts/configure.mjs';
import {
  catalog,
  ConfigError,
  defaultConfig,
  HOSTS,
  hostSetup,
  jsonText,
  kimiModels,
  MANIFEST,
  parseJson,
  readJson,
  render,
  ROOT,
  RUNTIME,
  validate,
} from '../scripts/lib/config.mjs';
import {
  atomicWrite,
  install,
  installationPlan,
  targetDirectory,
} from '../scripts/lib/install.mjs';
import { cli, SCRIPT, snapshot, temporary } from './helpers.mjs';

function fixture(t, host = 'codex') {
  const root = temporary(t);
  const configPath = path.join(root, 'choices.json');
  const config = defaultConfig(host);
  const save = (value = config) => fs.writeFileSync(configPath, jsonText(value));
  save();
  const command = (name, extra = [], expected = 0) =>
    cli(
      root,
      [name, '--config', configPath, '--scope', 'project', '--root', root, ...extra],
      expected,
    );
  return {
    root,
    configPath,
    config,
    save,
    command,
    target: targetDirectory(host, 'project', root),
  };
}

for (const host of HOSTS) {
  test(`${host}: init, render, preview, install, check and repeat install`, (t) => {
    const root = temporary(t);
    const config = path.join(root, 'choices.json');
    cli(root, ['init', '--host', host, '--config', config]);
    const source = fs.readFileSync(config);
    const files = JSON.parse(cli(root, ['render', '--config', config]).stdout).files;
    assert.equal(Object.keys(files).length, 8);
    const target = targetDirectory(host, 'project', root);
    const args = ['--config', config, '--scope', 'project', '--root', root];
    assert.equal(JSON.parse(cli(root, ['install', ...args]).stdout).status, 'pending');
    cli(root, ['check', ...args], 1);
    assert.equal(fs.existsSync(target), false);
    cli(root, ['install', ...args, '--apply']);
    for (const [name, body] of Object.entries(files))
      assert.equal(fs.readFileSync(path.join(target, name), 'utf8'), body);
    const checked = JSON.parse(cli(root, ['check', ...args]).stdout);
    assert.equal(checked.status, 'current');
    assert.equal(checked.runtime_verified, false);
    const before = snapshot(target, true);
    cli(root, ['install', ...args, '--apply']);
    assert.deepEqual(snapshot(target, true), before);
    assert.deepEqual(fs.readFileSync(config), source);
  });

  test(`${host}: generated profiles parse independently and retain instructions`, () => {
    for (const preset of host === 'claude-code' ? ['inherit'] : ['inherit', 'recommended']) {
      const config = defaultConfig(host, preset);
      const files = render(config);
      for (const [role, definition] of Object.entries(catalog())) {
        const filename = `crew-${role}${host === 'codex' ? '.toml' : '.md'}`;
        const text = files[filename];
        const parsed = host === 'codex' ? toml(text) : yaml(text.split('---\n')[1]);
        assert.equal(parsed.name, `crew-${role}`);
        assert.equal(parsed.description, definition.description);
        const prompt =
          fs.readFileSync(path.join(ROOT, `assets/roles/${role}.md`), 'utf8').trim() +
          '\n\n' +
          fs.readFileSync(path.join(ROOT, 'assets/roles/common.md'), 'utf8').trim() +
          '\n';
        if (host === 'codex') {
          assert.equal(parsed.developer_instructions, prompt);
          assert.equal(parsed.sandbox_mode, definition.access);
          assert.equal(parsed.model_reasoning_effort, config.roles[role].effort);
        } else assert.equal(text.slice(text.indexOf('\n---\n') + 6), prompt);
        if (host === 'kimi-code') {
          assert.equal(parsed.model, undefined);
          assert.equal(parsed.effort, undefined);
          assert.deepEqual(parsed.subagents, []);
        } else
          assert.equal(
            parsed.model,
            config.roles[role].model === 'inherit' ? undefined : config.roles[role].model,
          );
      }
    }
  });
}

for (const old of readJson(path.join(ROOT, 'tests/fixtures/python-v1.json'))) {
  test(`Python v1 ${old.host}/${old.variant}: byte parity and installed manifest compatibility`, (t) => {
    const f = fixture(t, old.host);
    f.save(old.config);
    assert.deepEqual(render(old.config), old.files);
    fs.mkdirSync(f.target, { recursive: true });
    for (const [name, body] of Object.entries(old.files))
      fs.writeFileSync(path.join(f.target, name), body);
    fs.writeFileSync(path.join(f.target, MANIFEST), old.manifest);
    f.command('check');
    const before = snapshot(f.target, true);
    f.command('install', ['--apply']);
    assert.deepEqual(snapshot(f.target, true), before);
    const config = structuredClone(old.config);
    config.roles = { reviewer: { model: 'changed-model' } };
    f.save(config);
    f.command('install', ['--apply']);
    f.command('check');
    const profile = path.join(f.target, `crew-reviewer${old.host === 'codex' ? '.toml' : '.md'}`);
    fs.unlinkSync(profile);
    f.command('check', [], 1);
    f.command('install', ['--apply']);
    assert.ok(fs.existsSync(profile));
    fs.writeFileSync(profile, 'local edit');
    const edited = snapshot(f.target);
    f.save({ ...config, roles: {} });
    f.command('install', ['--apply'], 1);
    assert.deepEqual(snapshot(f.target), edited);
  });
}

test('init preserves existing choices and invalid input does not create directories', (t) => {
  const f = fixture(t);
  const before = snapshot(f.root);
  cli(f.root, ['init', '--host', 'codex', '--config', f.configPath], 2);
  assert.deepEqual(snapshot(f.root), before);
  cli(
    f.root,
    [
      'init',
      '--host',
      'claude-code',
      '--config',
      path.join(f.root, 'new', 'choices.json'),
      '--preset',
      'recommended',
    ],
    2,
  );
  assert.equal(fs.existsSync(path.join(f.root, 'new')), false);
});

test('unrelated profiles/settings survive updates and disabling all roles', (t) => {
  const f = fixture(t, 'claude-code');
  f.command('install', ['--apply']);
  const unrelated = path.join(f.target, 'other.md');
  const settings = path.join(f.target, '..', 'config.toml');
  fs.writeFileSync(unrelated, 'keep');
  fs.writeFileSync(settings, 'host settings');
  f.config.roles = { reviewer: { model: 'custom', effort: 'high' } };
  f.save();
  f.command('install', ['--apply']);
  assert.deepEqual(
    fs.readdirSync(f.target).filter((name) => name.startsWith('crew-')),
    ['crew-reviewer.md'],
  );
  f.config.roles = {};
  f.save();
  f.command('install', ['--apply']);
  f.command('check');
  assert.equal(fs.readdirSync(f.target).filter((name) => name.startsWith('crew-')).length, 0);
  assert.equal(fs.readFileSync(unrelated, 'utf8'), 'keep');
  assert.equal(fs.readFileSync(settings, 'utf8'), 'host settings');
});

test('unmanaged same-name files block all writes', (t) => {
  const f = fixture(t);
  fs.mkdirSync(f.target, { recursive: true });
  fs.writeFileSync(path.join(f.target, 'crew-explorer.toml'), 'existing');
  const before = snapshot(f.target);
  f.command('install', ['--apply'], 1);
  assert.deepEqual(snapshot(f.target), before);
});

test('symlinked profiles, directory and manifest cannot redirect writes', (t) => {
  const f = fixture(t);
  f.command('install', ['--apply']);
  const outside = path.join(f.root, 'outside');
  fs.writeFileSync(outside, 'keep');
  const profile = path.join(f.target, 'crew-reviewer.toml');
  fs.unlinkSync(profile);
  fs.symlinkSync(outside, profile);
  f.command('install', ['--apply'], 1);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'keep');
  fs.unlinkSync(path.join(f.target, MANIFEST));
  fs.symlinkSync(f.configPath, path.join(f.target, MANIFEST));
  f.command('install', ['--apply'], 2);
  const other = path.join(f.root, 'other');
  fs.mkdirSync(other);
  fs.symlinkSync(path.dirname(f.target), path.join(other, '.codex'));
  assert.throws(() => targetDirectory('codex', 'project', other), /symlinked/);
});

test('corrupt manifest paths, hashes and version fail before changes', (t) => {
  const f = fixture(t);
  f.command('install', ['--apply']);
  const manifest = readJson(path.join(f.target, MANIFEST));
  for (const mutate of [
    (value) => {
      value.files['../keep.txt'] = 'a'.repeat(64);
    },
    (value) => {
      value.files[RUNTIME] = 'bad';
    },
    (value) => {
      value.files[RUNTIME] = 'a'.repeat(64) + '\n';
    },
    (value) => {
      value.schema_version = true;
    },
    (value) => {
      value.host = 'kimi-code';
    },
  ]) {
    const invalid = structuredClone(manifest);
    mutate(invalid);
    fs.writeFileSync(path.join(f.target, MANIFEST), jsonText(invalid));
    const before = snapshot(f.target);
    f.command('install', ['--apply'], 2);
    assert.deepEqual(snapshot(f.target), before);
  }
});

test('write failure restores updates and removed profiles', (t) => {
  const f = fixture(t);
  f.command('install', ['--apply']);
  const before = snapshot(f.target);
  f.config.roles = { reviewer: { model: 'new-model' } };
  const files = render(f.config);
  let calls = 0;
  const write = (file, body) => {
    if (++calls === 2) throw new Error('simulated disk failure');
    atomicWrite(file, body);
  };
  assert.throws(
    () => install(f.target, f.config, files, installationPlan(f.target, f.config, files), write),
    /simulated disk failure/,
  );
  assert.deepEqual(snapshot(f.target), before);
  assert.equal(
    fs.readdirSync(f.target).some((name) => name.startsWith('.crew-stage-')),
    false,
  );
});

test('rollback failure reports files requiring recovery', (t) => {
  const f = fixture(t);
  f.command('install', ['--apply']);
  f.config.roles = { reviewer: { model: 'new-model' } };
  const files = render(f.config);
  let calls = 0;
  const write = (file, body) => {
    if (++calls >= 2) throw new Error('disk unavailable');
    atomicWrite(file, body);
  };
  assert.throws(
    () => install(f.target, f.config, files, installationPlan(f.target, f.config, files), write),
    /rollback incomplete.*crew-/,
  );
});

test('duplicate JSON keys include nested and escaped keys but allow separate objects', () => {
  for (const text of [
    '{"host":1,"host":2}',
    '{"roles":{"reviewer":{"model":"a","m\\u006fdel":"b"}}}',
    '{"a":[{"x":1,"x":2}]}',
    '{"__proto__":1,"__proto__":2}',
  ]) {
    assert.throws(() => parseJson(text), /Duplicate JSON key/);
  }
  assert.deepEqual(parseJson('{"a":[{"x":1},{"x":2}],"b":"{\\\"x\\\":3}","c":"\\\\"}'), {
    a: [{ x: 1 }, { x: 2 }],
    b: '{"x":3}',
    c: '\\',
  });
  for (const token of ['1.0', '1e0', 'true', '9007199254740993'])
    assert.throws(() => parseJson(`{"schema_version":${token}}`), /integer/);
});

test('invalid configs and unsupported options fail', () => {
  const cases = [
    ['kimi-code', { effort: 'high' }],
    ['codex', { tools: ['Read'] }],
    ['claude-code', { effort: 'invented' }],
    ['claude-code', { tools: ['Bash'] }],
    ['kimi-code', { tools: ['Agent'] }],
    ['claude-code', { tools: ['Read', 'Read'] }],
    ['claude-code', { tools: ['*'] }],
    ['claude-code', { tools: ['Read\n'] }],
    ['codex', { model: false }],
    ['codex', { model: null }],
    ['codex', { modle: 'typo' }],
    ...['\n', '\u007f', '\u0085', '\u2028', '\u00a0', '\ud800'].map((char) => [
      'codex',
      { model: `bad${char}model` },
    ]),
  ];
  for (const [host, options] of cases)
    assert.throws(
      () => validate({ ...defaultConfig(host), roles: { reviewer: options } }),
      ConfigError,
    );
  for (const [key, value] of [
    ['schema_version', true],
    ['host', 'other'],
    ['roles', []],
    ['roles', { madeup: {} }],
    ['max_parallel', true],
    ['max_parallel', 0],
    ['max_parallel', 1.5],
    ['max_parallel', Number.MAX_SAFE_INTEGER + 1],
    ['api_key', 'secret'],
  ]) {
    assert.throws(() => validate({ ...defaultConfig('codex'), [key]: value }), ConfigError);
  }
  assert.throws(
    () =>
      validate(
        JSON.parse('{"schema_version":1,"host":"codex","max_parallel":3,"roles":{"__proto__":{}}}'),
      ),
    /Unknown roles/,
  );
});

test('tool overrides replace defaults; browser roles remain read-only', () => {
  assert.equal(
    toml(render(defaultConfig('codex'))['crew-browser-debugger.toml']).sandbox_mode,
    'read-only',
  );
  for (const host of ['claude-code', 'kimi-code']) {
    const config = defaultConfig(host);
    const parse = (text) => yaml(text.split('---\n')[1]);
    assert.deepEqual(parse(render(config)['crew-browser-debugger.md']).tools, [
      'Read',
      'Glob',
      'Grep',
    ]);
    config.roles = {
      'browser-debugger': { tools: ['Read', 'mcp__browser__*'] },
      reviewer: { tools: [] },
    };
    assert.deepEqual(parse(render(config)['crew-browser-debugger.md']).tools, [
      'Read',
      'mcp__browser__*',
    ]);
    assert.deepEqual(parse(render(config)['crew-reviewer.md']).tools, []);
    for (const tool of ['Write', 'Edit', 'Bash'])
      assert.throws(
        () => validate({ ...config, roles: { 'browser-debugger': { tools: [tool] } } }),
        ConfigError,
      );
  }
});

test('presets and Kimi snippets preserve alias/model/effort mapping without host writes', (t) => {
  const config = defaultConfig('codex', 'recommended');
  assert.deepEqual(config.roles.reviewer, { model: 'gpt-6-astra', effort: 'high' });
  assert.deepEqual(config.roles['browser-debugger'], { model: 'gpt-6.1-sol', effort: 'high' });
  assert.deepEqual(config.roles['ui-styler'], { model: 'gpt-6.1-sol', effort: 'medium' });
  assert.throws(() => defaultConfig('claude-code', 'recommended'), /No recommended/);
  config.roles.reviewer.model = 'local';
  assert.equal(defaultConfig('codex', 'recommended').roles.reviewer.model, 'gpt-6-astra');
  const f = fixture(t, 'kimi-code');
  const kimi = defaultConfig('kimi-code', 'recommended');
  f.save(kimi);
  const rendered = JSON.parse(cli(f.root, ['render', '--config', f.configPath]).stdout);
  const snippet = toml(rendered.host_setup.content);
  assert.equal(snippet.secondary_model.default_effort, undefined);
  assert.equal(snippet.secondary_model.force, undefined);
  for (const [alias, expected] of Object.entries(kimiModels())) {
    const entry = snippet.models[alias];
    assert.equal(entry.provider, 'managed:kimi-code');
    assert.equal(entry.model, expected.model);
    assert.equal(entry.overrides.default_effort, expected.effort);
    assert.ok(entry.support_efforts.includes(expected.effort));
    assert.ok(snippet.secondary_model.models[alias]);
    assert.equal(entry.api_key, undefined);
  }
  assert.equal(snippet.models['crew-kimi-k3-high'].capabilities.includes('video_in'), false);
  const home = path.join(f.root, 'kimi-home');
  fs.mkdirSync(home);
  fs.writeFileSync(path.join(home, 'config.toml'), 'existing host settings');
  const before = snapshot(home, true);
  cli(
    f.root,
    ['install', '--config', f.configPath, '--scope', 'project', '--root', f.root, '--apply'],
    0,
    SCRIPT,
    { env: { ...process.env, KIMI_CODE_HOME: home } },
  );
  assert.deepEqual(snapshot(home, true), before);
  const subset = { ...kimi, roles: { explorer: kimi.roles.explorer } };
  assert.deepEqual(Object.keys(toml(hostSetup(subset).content).models), ['crew-kimi-coding-low']);
  assert.equal(hostSetup(defaultConfig('kimi-code')), undefined);
});

test('custom home paths and CLI argument boundaries', (t) => {
  const f = fixture(t);
  for (const [host, env] of [
    ['codex', 'CODEX_HOME'],
    ['claude-code', 'CLAUDE_CONFIG_DIR'],
    ['kimi-code', 'KIMI_CODE_HOME'],
  ]) {
    const root = path.join(f.root, host);
    const config = path.join(f.root, `${host}.json`);
    fs.writeFileSync(config, jsonText(defaultConfig(host)));
    const result = cli(f.root, ['install', '--config', config, '--scope', 'user'], 0, SCRIPT, {
      env: { ...process.env, [env]: root },
    });
    assert.equal(JSON.parse(result.stdout).target, path.join(root, 'agents'));
    assert.equal(fs.existsSync(root), false);
  }
  for (const args of [
    ['install', '--config', f.configPath, '--scope', 'project'],
    ['install', '--config', f.configPath, '--scope', 'user', '--root', f.root],
    ['check', '--config', f.configPath, '--scope', 'user', '--apply'],
    ['render', '--config', f.configPath, '--typo'],
    ['init', '--host', 'other', '--config', f.configPath],
  ])
    cli(f.root, args, 2);
});

test('version gate runs before file writes and runtime works without development packages', (t) => {
  for (const version of ['20.19.0', '18.0.0', 'invalid'])
    assert.throws(() => assertNodeVersion(version), /requires Node.js 22/);
  for (const version of ['22.0.0', '24.0.0']) assert.doesNotThrow(() => assertNodeVersion(version));
  const root = temporary(t);
  const copy = path.join(root, 'skill');
  fs.mkdirSync(copy);
  for (const name of ['scripts', 'assets'])
    fs.cpSync(path.join(ROOT, name), path.join(copy, name), { recursive: true });
  const script = path.join(copy, 'scripts/configure.mjs');
  const config = path.join(root, 'config.json');
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `Object.defineProperty(process.versions, 'node', { value: '20.0.0' }); const {main} = await import(${JSON.stringify(pathToFileURL(script).href)}); process.exitCode = await main(['init','--host','codex','--config',${JSON.stringify(config)}]);`,
    ],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /requires Node.js 22/);
  assert.equal(fs.existsSync(config), false);
  cli(
    root,
    ['init', '--host', 'kimi-code', '--config', config, '--preset', 'recommended'],
    0,
    script,
  );
  cli(root, ['render', '--config', config], 0, script);
  cli(
    root,
    ['install', '--config', config, '--scope', 'project', '--root', root, '--apply'],
    0,
    script,
  );
  cli(root, ['check', '--config', config, '--scope', 'project', '--root', root], 0, script);
});

test('role catalog and source files match', () => {
  const roles = fs
    .readdirSync(path.join(ROOT, 'assets/roles'))
    .filter((name) => name.endsWith('.md') && name !== 'common.md')
    .map((name) => name.slice(0, -3));
  assert.deepEqual(roles.sort(), Object.keys(catalog()).sort());
});

test('CLI remains executable through a symlinked skill directory', (t) => {
  const root = temporary(t);
  const link = path.join(root, 'agent-orchestration');
  fs.symlinkSync(ROOT, link, 'dir');
  const script = path.join(link, 'scripts/configure.mjs');
  assert.match(
    cli(root, ['--help'], 0, script).stdout,
    /Agent Orchestration profile configuration/,
  );
  const config = path.join(root, 'choices.json');
  cli(root, ['init', '--host', 'codex', '--config', config], 0, script);
  assert.deepEqual(readJson(config), defaultConfig('codex'));
});
