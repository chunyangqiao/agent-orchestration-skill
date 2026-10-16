import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import {
  defaultConfig,
  jsonText,
  readJson,
  MANIFEST,
  SKILL_ROOT,
} from '../skills/agent-orchestration/scripts/lib/config.mjs';
import { runSetup } from '../skills/agent-orchestration/scripts/lib/setup.mjs';
import {
  SetupCancelled,
  terminalPrompter,
} from '../skills/agent-orchestration/scripts/lib/prompts.mjs';
import { atomicWrite } from '../skills/agent-orchestration/scripts/lib/install.mjs';
import { cli, copySkill, snapshot, temporary } from './helpers.mjs';

function wizard(t, answers, host = 'codex') {
  const root = temporary(t);
  const config = path.join(root, 'choices.json');
  const output = [];
  const prompts = [];
  let index = 0;
  const io = {
    write: (text) => output.push(text),
    async ask(prompt, fallback) {
      prompts.push(prompt);
      const value = answers[index++];
      if (value === undefined || value === 'cancel') throw new SetupCancelled();
      return value || fallback || '';
    },
    async choice(message, items, fallback = 1) {
      return Number(await io.ask(`${message}: ${items.join(', ')}`, String(fallback))) - 1;
    },
    async roles(message, names, fallback = 'all') {
      const value = await io.ask(message, fallback);
      if (value === 'all') return names;
      if (value === 'none') return [];
      return value.split(',').map((index) => names[Number(index) - 1]);
    },
    async confirm(message) {
      return (await io.ask(message, '1')) === '2';
    },
  };
  return { root, config, output, prompts, io, options: { host, scope: 'project', root, config } };
}

test('wizard accepts recommended defaults and previews before writing', async (t) => {
  const w = wizard(t, ['', '', '', '2']);
  const ask = w.io.ask;
  w.io.ask = async (prompt, fallback) => {
    assert.deepEqual(snapshot(w.root), {});
    return ask(prompt, fallback);
  };
  assert.equal(await runSetup(w.options, w.io), 0);
  assert.deepEqual(readJson(w.config), defaultConfig('codex', 'recommended'));
  assert.match(w.output.join('\n'), /create: crew-reviewer.toml/);
  const result = JSON.parse(w.output.find((text) => text.startsWith('{')));
  assert.equal(result.static_check.status, 'passed');
  assert.equal(result.runtime_verified, false);
  cli(w.root, ['check', '--config', w.config, '--scope', 'project', '--root', w.root]);
});

test('disabling all roles reports that no live role probe can run', async (t) => {
  const w = wizard(t, ['none', '', '', '2']);
  assert.equal(await runSetup(w.options, w.io), 0);
  assert.deepEqual(readJson(w.config).roles, {});
  assert.match(w.output.join('\n'), /All roles are disabled; no live role probe/);
  assert.equal(
    JSON.parse(w.output.find((text) => text.startsWith('{'))).static_check.status,
    'passed',
  );
});

test('only selected roles are customized', async (t) => {
  const w = wizard(t, ['1,7', '2', '2', '2', 'custom-review-model', '5', '2']);
  assert.equal(await runSetup(w.options, w.io), 0);
  const config = readJson(w.config);
  assert.deepEqual(Object.keys(config.roles), ['explorer', 'reviewer']);
  assert.equal(config.max_parallel, 2);
  assert.deepEqual(config.roles.explorer, { model: 'gpt-6-luna', effort: 'high' });
  assert.deepEqual(config.roles.reviewer, { model: 'custom-review-model', effort: 'high' });
  assert.equal(w.prompts.filter((text) => text.includes('model ID')).length, 1);
});

test('customize every enabled role and Claude inherit mode', async (t) => {
  const w = wizard(t, ['7', '', '2', 'custom-model', '1', '2'], 'claude-code');
  assert.equal(await runSetup(w.options, w.io), 0);
  assert.deepEqual(readJson(w.config).roles.reviewer, { model: 'custom-model' });
  assert.doesNotMatch(w.output.join('\n'), /Accept recommended/);
  const inherited = wizard(t, ['', '', '', '2'], 'claude-code');
  await runSetup(inherited.options, inherited.io);
  assert.deepEqual(readJson(inherited.config), defaultConfig('claude-code'));
});

test('Kimi adjustments select model-effort aliases and show manual host setup', async (t) => {
  const w = wizard(t, ['1', '', '2', '1', '2', '2'], 'kimi-code');
  await runSetup(w.options, w.io);
  assert.deepEqual(readJson(w.config).roles.explorer, { model: 'crew-kimi-coding-high' });
  assert.match(w.output.join('\n'), /kimi-for-coding \/ high/);
  assert.match(w.output.join('\n'), /Manual host setup/);
  assert.match(w.output.join('\n'), /secondary_model.default_effort/);
});

test('Cursor recommended defaults keep model strings and customization skips effort', async (t) => {
  const recommended = wizard(t, ['', '', '', '2'], 'cursor');
  assert.equal(await runSetup(recommended.options, recommended.io), 0);
  assert.deepEqual(readJson(recommended.config), defaultConfig('cursor', 'recommended'));
  assert.match(recommended.output.join('\n'), /create: crew-reviewer.md/);
  const custom = wizard(t, ['7', '', '3', 'composer-2.5[fast=true]', '2'], 'cursor');
  assert.equal(await runSetup(custom.options, custom.io), 0);
  assert.deepEqual(readJson(custom.config).roles, {
    reviewer: { model: 'composer-2.5[fast=true]' },
  });
  assert.equal(custom.prompts.filter((text) => text.includes('effort')).length, 0);
  assert.equal(custom.prompts.filter((text) => text.includes('model string')).length, 1);
});

test('Kimi custom aliases and inherit are supported without synthetic effort fields', async (t) => {
  const w = wizard(t, ['1,7', '', '3', '5', 'existing-pool-alias', '4', '2'], 'kimi-code');
  await runSetup(w.options, w.io);
  assert.deepEqual(readJson(w.config).roles, {
    explorer: { model: 'existing-pool-alias' },
    reviewer: { model: 'inherit' },
  });
});

test('cancel or EOF at any prompt leaves configuration and profiles absent', async (t) => {
  for (const answers of [['cancel'], ['', undefined], ['', '', '', '1'], ['', '', '', undefined]]) {
    const w = wizard(t, answers);
    await assert.rejects(runSetup(w.options, w.io), SetupCancelled);
    assert.deepEqual(snapshot(w.root), {});
  }
});

test('existing source is reused unchanged; new path can be chosen without overwriting', async (t) => {
  const w = wizard(t, ['1', '2']);
  fs.writeFileSync(w.config, jsonText(defaultConfig('codex')));
  const before = fs.readFileSync(w.config);
  await runSetup(w.options, w.io);
  assert.deepEqual(fs.readFileSync(w.config), before);
  assert.equal(
    w.prompts.some((text) => text.includes('Maximum active')),
    false,
  );
  const other = wizard(t, []);
  fs.writeFileSync(other.config, 'unrelated choices');
  const newPath = path.join(other.root, 'new.json');
  const answers = ['2', newPath, '', '', '4', '2'];
  other.io.ask = async (_, fallback) => answers.shift() || fallback;
  await runSetup(other.options, other.io);
  assert.equal(fs.readFileSync(other.config, 'utf8'), 'unrelated choices');
  assert.deepEqual(readJson(newPath), defaultConfig('codex'));
});

test('existing config host mismatch and source inside target fail without changes', async (t) => {
  const w = wizard(t, ['1']);
  fs.writeFileSync(w.config, jsonText(defaultConfig('kimi-code')));
  const before = snapshot(w.root);
  await assert.rejects(runSetup(w.options, w.io), /Existing config is for/);
  assert.deepEqual(snapshot(w.root), before);
  const invalid = wizard(t, []);
  invalid.options.config = path.join(invalid.root, '.codex/agents/choices.json');
  await assert.rejects(runSetup(invalid.options, invalid.io), /outside the skill and managed/);
  assert.deepEqual(snapshot(invalid.root), {});
});

test('profile conflicts prevent saving new source config', async (t) => {
  const w = wizard(t, ['', '', '']);
  const target = path.join(w.root, '.codex/agents');
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'crew-explorer.toml'), 'local profile');
  const before = snapshot(w.root);
  assert.equal(await runSetup(w.options, w.io), 1);
  assert.deepEqual(snapshot(w.root), before);
});

test('a change during confirmation invalidates the preview', async (t) => {
  const w = wizard(t, ['', '', '', '2']);
  const ask = w.io.ask;
  let count = 0;
  w.io.ask = async (prompt, fallback) => {
    if (++count === 4) {
      const target = path.join(w.root, '.codex/agents');
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, 'crew-reviewer.toml'), 'concurrent edits');
    }
    return ask(prompt, fallback);
  };
  await assert.rejects(runSetup(w.options, w.io), /changed since preview/);
  assert.equal(fs.existsSync(w.config), false);
  assert.equal(
    fs.readFileSync(path.join(w.root, '.codex/agents/crew-reviewer.toml'), 'utf8'),
    'concurrent edits',
  );
});

test('terminal EOF and SIGINT cancel pending input without hanging', async () => {
  for (const inputValue of ['\x04', '\x03', '\x1b']) {
    const input = new PassThrough();
    const output = new PassThrough();
    input.isTTY = true;
    output.isTTY = true;
    const io = terminalPrompter(input, output);
    const pending = io.ask('Choice: ');
    input.write(inputValue);
    await assert.rejects(pending, SetupCancelled);
    io.close();
    input.destroy();
    output.destroy();
  }
});

test('non-interactive CLI fails immediately with alternatives', (t) => {
  const w = wizard(t, []);
  const result = cli(
    w.root,
    ['setup', '--host', 'codex', '--scope', 'project', '--root', w.root, '--config', w.config],
    2,
  );
  assert.match(result.stderr, /requires an interactive terminal/);
  assert.match(result.stderr, /bootstrap/);
  assert.deepEqual(snapshot(w.root), {});
});

test('wizard rejects source paths inside the skill or managed directory through aliases', async (t) => {
  const w = wizard(t, []);
  const alias = path.join(w.root, 'skill-link');
  fs.symlinkSync(SKILL_ROOT, alias, 'dir');
  const managed = path.join(w.root, '.codex/agents');
  fs.mkdirSync(managed, { recursive: true });
  const managedAlias = path.join(w.root, 'agents-link');
  fs.symlinkSync(managed, managedAlias, 'dir');
  const before = snapshot(w.root);
  for (const directory of [SKILL_ROOT, alias, managedAlias]) {
    await assert.rejects(
      runSetup({ ...w.options, config: path.join(directory, 'setup-test.json') }, w.io),
      /outside the skill and managed/,
    );
    assert.deepEqual(snapshot(w.root), before);
  }
});

test('wizard reports post-install failure and retains artifacts for diagnosis', async (t) => {
  for (const corruptSource of [false, true]) {
    const w = wizard(t, ['', '', '', '2']);
    const exitCode = await runSetup(w.options, w.io, (file, data) => {
      atomicWrite(file, data);
      if (path.basename(file) === MANIFEST) {
        if (corruptSource)
          fs.writeFileSync(w.config, jsonText({ ...defaultConfig('codex'), max_parallel: 1 }));
        else fs.unlinkSync(path.join(path.dirname(file), 'crew-explorer.toml'));
      }
    });
    assert.equal(exitCode, 1);
    const result = JSON.parse(w.output.find((text) => text.startsWith('{')));
    assert.equal(result.static_check.status, 'failed');
    assert.notEqual(result.status, 'applied');
    assert.equal(result.runtime_verified, false);
    assert.ok(fs.existsSync(w.config));
    assert.doesNotMatch(w.output.join('\n'), /Static checks passed/);
  }
});

test('wizard write failures roll back profiles and newly created source', async (t) => {
  const w = wizard(t, ['', '', '', '2']);
  let writes = 0;
  await assert.rejects(
    runSetup(w.options, w.io, (file, data) => {
      if (++writes === 3) throw new Error('injected write failure');
      atomicWrite(file, data);
    }),
    /injected write failure/,
  );
  assert.deepEqual(snapshot(w.root), {});
});

test('a source created during confirmation is preserved and requires a new preview', async (t) => {
  const w = wizard(t, ['', '', '']);
  w.io.confirm = async () => {
    fs.writeFileSync(w.config, 'concurrent choices');
    return true;
  };
  await assert.rejects(runSetup(w.options, w.io), /appeared since preview/);
  assert.equal(fs.readFileSync(w.config, 'utf8'), 'concurrent choices');
  assert.equal(fs.existsSync(path.join(w.root, '.codex/agents')), false);
});

test('copied skill includes the executable wizard and works without node_modules', async (t) => {
  const w = wizard(t, ['', '', '', '2']);
  const copy = path.join(w.root, 'skill');
  copySkill(copy);
  assert.equal(fs.existsSync(path.join(copy, 'node_modules')), false);
  assert.equal(fs.existsSync(path.join(copy, 'package.json')), false);
  const entry = path.join(copy, 'scripts/setup.mjs');
  cli(w.root, ['--help'], 0, entry);
  if (process.platform !== 'win32') {
    const help = spawnSync(entry, ['--help'], { cwd: w.root, encoding: 'utf8', timeout: 10000 });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Inquirer/);
  }
  const copied = await import(pathToFileURL(path.join(copy, 'scripts/lib/setup.mjs')).href);
  assert.equal(await copied.runSetup(w.options, w.io), 0);
  const result = JSON.parse(w.output.find((text) => text.startsWith('{')));
  assert.equal(result.static_check.status, 'passed');
  assert.equal(result.runtime_verified, false);
});
