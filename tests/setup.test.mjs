import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import {
  defaultConfig,
  jsonText,
  readJson,
} from '../skills/agent-orchestration/scripts/lib/config.mjs';
import {
  runSetup,
  SetupCancelled,
  terminalPrompter,
} from '../skills/agent-orchestration/scripts/lib/setup.mjs';
import { cli, snapshot, temporary } from './helpers.mjs';

function wizard(t, answers, host = 'codex') {
  const root = temporary(t);
  const config = path.join(root, 'choices.json');
  const output = [];
  const prompts = [];
  let index = 0;
  const io = {
    write: (text) => output.push(text),
    async ask(prompt) {
      prompts.push(prompt);
      return answers[index++];
    },
  };
  return { root, config, output, prompts, io, options: { host, scope: 'project', root, config } };
}

test('numbered wizard accepts recommended defaults and previews before writing', async (t) => {
  const w = wizard(t, ['', '', '', '2']);
  const ask = w.io.ask;
  w.io.ask = async (prompt) => {
    assert.deepEqual(snapshot(w.root), {});
    return ask(prompt);
  };
  assert.equal(await runSetup(w.options, w.io), 0);
  assert.deepEqual(readJson(w.config), defaultConfig('codex', 'recommended'));
  assert.match(w.output.join('\n'), /create: crew-reviewer.toml/);
  cli(w.root, ['check', '--config', w.config, '--scope', 'project', '--root', w.root]);
});

test('invalid selections retry and only selected roles are customized', async (t) => {
  const w = wizard(t, [
    'bad',
    '1,7',
    '0',
    '2',
    '9',
    '2',
    '2',
    'custom-review-model',
    'bad',
    '5',
    '2',
  ]);
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
  other.io.ask = async () => answers.shift();
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
  await assert.rejects(runSetup(invalid.options, invalid.io), /outside the managed/);
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
  w.io.ask = async (prompt) => {
    if (++count === 4) {
      const target = path.join(w.root, '.codex/agents');
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, 'crew-reviewer.toml'), 'concurrent edits');
    }
    return ask(prompt);
  };
  await assert.rejects(runSetup(w.options, w.io), /changed since preview/);
  assert.equal(fs.existsSync(w.config), false);
  assert.equal(
    fs.readFileSync(path.join(w.root, '.codex/agents/crew-reviewer.toml'), 'utf8'),
    'concurrent edits',
  );
});

test('terminal EOF and SIGINT cancel pending input without hanging', async () => {
  for (const inputValue of ['\x04', '\x03']) {
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
  assert.match(result.stderr, /init --preset/);
  assert.deepEqual(snapshot(w.root), {});
});
